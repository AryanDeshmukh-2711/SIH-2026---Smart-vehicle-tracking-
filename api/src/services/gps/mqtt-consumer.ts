import mqtt, { type MqttClient } from 'mqtt';
import { env } from '../../config/env.ts';
import { gpsLog } from '../../config/logger.ts';
import { ingestReading } from './ingest.ts';
import type { RawReading } from './validate.ts';

/**
 * MQTT intake.
 *
 * MQTT rather than HTTP because that is what the vehicles speak: AIS-140 units
 * publish over a long-lived, low-overhead session that survives the intermittent
 * connectivity these routes run through. A REST POST per vehicle every ten
 * seconds would mean a TCP and TLS handshake each time, on a link that is often
 * barely up.
 */

export const GPS_TOPIC = 'him_gati/bus/+/location';

let client: MqttClient | null = null;

export function startGpsConsumer(): MqttClient {
  client = mqtt.connect(env.MQTT_URL, {
    clientId: `himgati-api-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 2000,
    clean: true,
  });

  client.on('connect', () => {
    gpsLog.info({ url: env.MQTT_URL }, 'mqtt connected');
    // QoS 1: a position may be delivered twice (the pipeline dedupes on
    // timestamp) but must not be silently dropped.
    client?.subscribe(GPS_TOPIC, { qos: 1 }, (err) => {
      if (err) gpsLog.error({ err: err.message }, 'mqtt subscribe failed');
      else gpsLog.info({ topic: GPS_TOPIC }, 'subscribed to GPS feed');
    });
  });

  client.on('reconnect', () => gpsLog.warn('mqtt reconnecting'));
  client.on('error', (err) => gpsLog.error({ err: err.message }, 'mqtt error'));

  client.on('message', (topic, payload) => {
    void handleMessage(topic, payload);
  });

  return client;
}

async function handleMessage(topic: string, payload: Buffer): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString());
  } catch {
    gpsLog.warn({ topic }, 'unparseable GPS payload');
    return;
  }

  // A device may publish a single fix or, on reconnecting from a dead zone, the
  // whole buffered batch at once (SRS §8.5).
  const readings = Array.isArray(parsed) ? parsed : [parsed];

  // Oldest first, so the live marker ends on the newest position.
  const ordered = (readings as RawReading[])
    .slice()
    .sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));

  if (ordered.length > 1) {
    gpsLog.info(
      { busId: ordered[0]?.busId, count: ordered.length },
      'buffered batch received — device back in coverage',
    );
  }

  for (const reading of ordered) {
    try {
      await ingestReading(reading);
    } catch (err) {
      gpsLog.error(
        { err: err instanceof Error ? err.message : err, busId: reading?.busId },
        'ingest failed',
      );
    }
  }
}

function timestampMs(t: number | string): number {
  if (typeof t === 'string') return new Date(t).getTime();
  return t > 1e12 ? t : t * 1000;
}

export async function stopGpsConsumer(): Promise<void> {
  await client?.endAsync();
  client = null;
}
