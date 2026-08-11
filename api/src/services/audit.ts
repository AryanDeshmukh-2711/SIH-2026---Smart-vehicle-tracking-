import type { UserRole } from '@prisma/client';
import { logger } from '../config/logger.ts';
import { prisma } from '../db/prisma.ts';

/**
 * Append-only record of privileged actions.
 *
 * The SRS puts a transport authority above the depots, and an authority that
 * cannot answer "who cancelled that service, and when?" has no oversight at all.
 * Sign-ins are recorded too, because an unexplained admin login is exactly the
 * thing worth noticing after the fact.
 *
 * Writes never block or fail the action they describe — an audit trail that can
 * take the system down is a liability rather than a control.
 */

const log = logger.child({ module: 'audit' });

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? undefined) as never,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err, action: entry.action }, 'audit write failed');
  }
}
