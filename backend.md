# Routify — architecture, workflow and technology choices

This document explains how the system actually works: the path a GPS reading
takes from a bus to a passenger's screen, the other paths that feed it, and why
each piece of technology is in the stack. Every technology section is written
problem-first — what would break without it — because a stack list on its own
explains nothing.

The product is a public-transport tracker for Himachal Pradesh: mountain routes,
patchy mobile coverage, and a state fleet mixing new electric buses with
twelve-year-old diesels. Those three facts drive most of the decisions below.

---

## 1. The shape of the system

```
   AIS-140 tracker on a bus                 Driver app        Depot console
   (or the simulator, locally)              (web)             (web)
            │                                   │                 │
            │ MQTT: him_gati/bus/{id}/location  │ HTTPS           │ HTTPS
            │       him_gati/bus/{id}/status    │                 │
            ▼                                   ▼                 ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                        API  (Node + Express)                          │
   │                                                                       │
   │   validate ─→ map-match ─→ live state ─→ ETA + confidence ─→ publish  │
   │      │            │            │              │                  │    │
   └──────┼────────────┼────────────┼──────────────┼──────────────────┼────┘
          │            │            │              │                  │
          │       ┌────▼─────┐  ┌───▼───┐    ┌─────▼─────┐            │
          │       │ PostGIS  │  │ Redis │    │  Postgres │            │
          │       │  shapes  │  │ live  │    │  history  │            │
          │       └──────────┘  └───────┘    └───────────┘            │
          │                                                            │
     rejected readings                                        Socket.IO │
     never become "where the bus is"                                    ▼
                                                            Passenger web app
                                                            (React PWA)
```

Three processes run in development: the **API**, the **simulator** standing in
for vehicle trackers, and the **web** dev server. Three containers back them:
**PostgreSQL/PostGIS**, **Redis** and **Mosquitto**.

### Repository layout

An npm workspaces monorepo, three packages:

| Package | What lives there |
|---|---|
| `api/` | Express server, ingestion pipeline, ETA engine, auth, Prisma schema, simulator |
| `web/` | React PWA — passenger app, driver app, depot dashboard |
| `packages/shared/` | Rules and types that **both** sides must agree on |

`packages/shared` exists because of a specific failure mode. The confidence
ladder, the Green Score and the emissions factors are quoted by the API *and*
rendered by the client. Implemented twice, they drift, and the app ends up
showing a badge that contradicts the number beside it. There is one
implementation, imported by both.

---

## 2. Running it

```bash
npm install
```

```bash
docker compose up -d
```

```bash
npm run db:migrate && npm run db:seed
```

Then three terminals:

```bash
npm run dev:api
```

```bash
npm run dev:sim
```

```bash
npm run dev:web
```

The app is at `http://localhost:5173`, the API at `http://localhost:4000/api/v1`.
`GET /api/v1/health` reports database, Redis and network-graph status plus live
ingestion counters. Tests — 93 of them, no infrastructure required:

```bash
npm test
```

Demo accounts: driver `HRTC-D-4021` (OTP; the code is printed on screen because
no SMS gateway is wired up), depot `HRTC-ADMIN` with the password shown on the
sign-in screen.

---

## 3. The main workflow: one GPS reading, end to end

This is the spine of the product. Everything else is a variation on it.

### Step 1 — Intake over MQTT

A tracker publishes to `him_gati/bus/{busId}/location`. The API subscribes with
a wildcard, so vehicles need no registration step to start appearing.

**Why MQTT.** Indian commercial vehicles carry AIS-140 VLTD trackers, and MQTT
is what that class of hardware speaks. It holds one long-lived TCP connection
rather than opening an HTTPS request every few seconds, which matters when a
device is on a 2G link on a mountain road and paying for every byte. QoS 1
means a reading survives a brief disconnect instead of vanishing.

### Step 2 — Validation (`services/gps/validate.ts`)

A reading is rejected if it is malformed, has impossible coordinates, is
timestamped in the future, reports poor accuracy, duplicates the previous fix,
or implies an impossible speed.

**The problem this solves.** Consumer and commercial GPS both lie — reflections
off valley walls, cold starts, clock skew. A single bad fix that reaches the map
teleports a bus across a district, and the arrival board follows it. The
invariant is that a reading which cannot be trusted never becomes "where the bus
is".

The speed check has a subtlety that would have been a production outage. Speed
is implied by distance over time against the *previous* fix. After a signal
blackout, every buffered reading is compared against the same pre-blackout fix,
so the first one is rejected as impossible — and because it was rejected, the
next one is compared against that same stale fix and rejected too. The vehicle
could never recover. The check is therefore skipped once the gap exceeds the
signal-lost threshold: over that long a silence the implied speed means nothing.
This is pinned by tests.

### Step 3 — Map-matching (PostGIS)

A raw fix is a point in a valley; what the app must draw is a bus on a road. One
SQL statement snaps the fix onto the route's shape and returns how far along the
route the vehicle is:

```sql
ST_LineLocatePoint(r.shape, p.pt)                 -- fraction along the route
ST_LineInterpolatePoint(r.shape, <that fraction>) -- the snapped position
ST_Distance(r.shape::geography, p.pt::geography)  -- how far off-route, metres
```

**Why PostGIS rather than doing the geometry in Node.** Route shapes have
hundreds of vertices and there are readings arriving continuously. Done in
application code this is a loop over every segment of every route on every fix.
PostGIS does it in C, against a GiST index, next to the data. The off-route
distance also gives a free sanity check: a fix more than 250 m from any route
alignment is a GPS artefact, not a diversion.

`ST_DWithin` on a geography column answers "stops near me" as a radius query —
metres on the ellipsoid, not degrees, which matters at 31° N where a degree of
longitude is nothing like a degree of latitude.

### Step 4 — Live state (Redis)

The accepted, matched position is written to Redis: position, bearing, speed,
progress along the route, next stop, and the timestamp of the fix.

**Why Redis and not Postgres.** This record is rewritten every couple of seconds
per vehicle and read on every map pan. It is also completely rebuildable from
the feed, so it is a cache, not a system of record — which is why the container
runs with persistence deliberately switched off. Redis also supplies a geo index
(`GEOADD`/`GEORADIUS`), so "buses near me" is a radius lookup rather than a scan
of the whole fleet.

Live keys carry a TTL. A vehicle that stops reporting ages out on its own rather
than lingering on the map as a ghost.

### Step 5 — History (Postgres)

Every accepted reading is also appended to `bus_locations`, with a trigger
building the `geometry` column from lat/lng so application code never has to
construct WKT. ETA predictions are snapshotted to `eta_predictions`.

**Why keep it.** Punctuality reporting needs a record — the depot dashboard's
seven-day on-time report is computed from trips, and the ETA snapshots are what
would let the system be scored on whether its predictions were any good. Live
state cannot answer "was this route late all week", and an authority that cannot
answer that has no oversight.

### Step 6 — ETA and confidence (`services/eta/engine.ts`)

Distance remaining is converted to minutes using the route's typical speed, plus
dwell time for intermediate stops, plus any declared delay.

Then the part that distinguishes this product: **the estimate is presented at the
precision the data supports, and no more.** Confidence is a function of one
thing — how old the fix is:

| Fix age | Confidence | What the passenger sees |
|---|---|---|
| under 60 s | high | `7 min` |
| 60 s – 5 min | medium | `7 min (±2)` |
| over 5 min | low | `8–14 min` |
| over 15 min | — | falls back to the printed timetable |

Separately, a vehicle silent for **3 minutes** is badged *Signal lost*.

That 3-minute badge deliberately fires *before* the 5-minute confidence drop.
A passenger is told the bus has gone quiet while the number is still reasonably
tight, rather than discovering it only when the estimate visibly falls apart.
The ordering is counter-intuitive enough that a test pins it — an earlier version
of that test asserted the opposite and was wrong.

Past 90 minutes the display switches to `3h 8m`, because "188 min" is arithmetic
homework on a bus-stop board, and the range is dropped, because "168–256 min"
reads as noise rather than information.

### Step 7 — Broadcast (Socket.IO)

The merged view is pushed to every subscribed client on `bus:location`. Clients
subscribe to a route or the whole fleet.

**Why push and not polling.** A phone polling every two seconds wakes the radio
every two seconds, and battery is a real constraint for someone travelling all
day. One socket, server-pushed, is dramatically cheaper. Socket.IO over a raw
WebSocket buys automatic reconnection with backoff, polling fallback where
WebSockets are blocked, rooms for per-route subscriptions, and connection-state
recovery so a PWA resumed from a background tab does not miss the interval it
was asleep for.

---

## 4. The second workflow: the operator channel

A GPS tracker knows where a bus is. It does **not** know whether the service is
running late, how full it is, or whether the depot cancelled it. Inventing that
telemetry would mean pretending AIS-140 hardware produces data it does not.

So operational state is a separate channel — `him_gati/bus/{id}/status` over
MQTT, and the driver/admin REST endpoints — written to its own Redis key and
merged with the position only at read time.

**The problem that forced the split.** Position and operational state originally
shared one key with two writers. The GPS handler would read the record, spend a
few milliseconds map-matching, then write its now-stale copy back — overwriting
an occupancy the status handler had set in the meantime. A classic lost update,
happening every two seconds. Separate keys, merged on read, cannot lose a write.

### Who wins when two sources disagree

Crowd level is the one field a human and a machine both report about the same
bus at the same time. The driver taps it once; telemetry republishes it every
couple of seconds. Last-write-wins meant the driver's answer survived about two
seconds — they would watch their own report vanish.

So a driver's crowd report **holds for ten minutes** and device telemetry cannot
displace it during that window. Delay and cancellation stay last-write-wins,
because there the depot is as authoritative as the driver — it is the depot that
cancels a service, not the person driving it. The rule lives in
`api/src/state/ops.ts` as a pure function, with eight tests.

### Cancellations

A cancelled bus publishes no GPS — there is nothing to track. But it must still
be *visible*: someone waiting for the 16:30 needs to be told it is not coming,
and an absent vehicle communicates nothing at all. A cancelled service is
therefore surfaced at its origin with no predictions attached.

---

## 5. The third workflow: identity

Passengers never sign in. Only staff do, and the two kinds of staff need very
different things.

**Drivers** get OTP. A driver about to pull out is holding a phone, in a hurry,
possibly wearing gloves — they should never type a password. The code is stored
hashed in Redis with a 5-minute TTL and a capped attempt count, so a six-digit
code cannot be brute-forced.

**Depot and authority staff** get a password, hashed with **Argon2id**
(`@node-rs/argon2`) — memory-hard, so a stolen hash cannot be attacked with
commodity GPUs the way bcrypt increasingly can.

Sessions are a short-lived **JWT** access token (15 min, signed with `jose`) plus
a long-lived refresh token held in Postgres. Refresh tokens are single-use and
**reuse is detected**: presenting a token that has already been exchanged revokes
the whole family, on the assumption that if a token was replayed, it was stolen.

Every privileged action — publishing an alert, cancelling a service, a crowd
report — is appended to `audit_logs` with the actor and their role. An authority
that cannot answer "who cancelled that service?" has no oversight.

Rate limiting is **Redis-backed rather than in-process**, because a per-process
limiter is trivially defeated by hitting a different node once the API is scaled
out. Credential endpoints are limited on the *identifier being attacked*, not
just the IP — a botnet spread across many addresses would otherwise sail past an
IP-keyed limit while still hammering one account.

---

## 6. What the client fetches, and what ships inside it

The web app makes a deliberate split:

- **Static reference data** — stops, routes, fares, timetables — ships *inside*
  the app. It is the GTFS bundle, it changes at most nightly, and a PWA on a hill
  road with no signal must still be able to draw a route and read a timetable.
  Fetching it would trade that guarantee for nothing.
- **Anything that changes while the app is open** — live positions over the
  socket, and service alerts over REST — comes from the server. A landslide
  closure published from the depot console has to reach a traveller's phone, not
  wait for the next release.

A remote read that fails falls back to the bundled copy rather than showing an
error, and if the socket cannot connect the app runs its own simulator so the map
never goes blank. That is not a developer convenience: in this region "the server
is not reachable right now" is a normal operating condition.

---

## 7. The technologies, and the problem each one solves

### Infrastructure

**PostgreSQL 16** — system of record: network graph, trips, position history,
alerts, users, audit log. Chosen over a document store because almost every
question here is relational (*which routes serve this stop*, *which trips ran
late on this route this week*) and because the alternative to joins is
maintaining those relationships by hand in application code.

**PostGIS 3.4** — everything geographic. Map-matching a fix to a route, radius
queries for nearby stops, distance in metres on the ellipsoid rather than in
degrees. Without it, all of that is hand-rolled geometry in JavaScript, run on
every reading, with no spatial index. GiST indexes cover stop points, route
shapes and position history, so these stay index lookups rather than full scans
as the history table grows — it passed 178,000 rows during a single afternoon of
testing.

**Redis 7** — live vehicle state, the ETA cache, OTP codes, and rate-limit
counters. Chosen for write throughput on data rewritten every two seconds, for
TTLs (a stale vehicle expiring on its own, an OTP dying after five minutes), for
the geo index, and because atomic `INCR` is exactly what a rate limiter needs.
Persistence is off on purpose — nothing here is a system of record.

**Eclipse Mosquitto 2** — the MQTT broker. Decouples vehicles from the API: the
broker holds the device connections, so restarting the API does not drop the
fleet, and a second consumer can be attached later without touching the vehicles.

**Docker Compose** — one command brings up all three, pinned to the same
versions on every machine. Removes "works on my laptop" from a hackathon
weekend, where the failure mode is usually a teammate on a different Postgres.

### API

**Node.js + TypeScript** — one language across the whole repo, which is what
makes `packages/shared` possible. Node's event loop suits this workload: it is
almost entirely I/O — broker, Redis, Postgres, sockets — not computation.

**Express 4** — HTTP routing and middleware. Small, boring, universally
understood; the routing is not the interesting part of this system and should
not be.

**Prisma 6** — typed database access and migrations. The type safety is the
point: a renamed column becomes a compile error rather than a runtime failure
during a demo. Migrations mean the schema is reproducible from an empty
database. Raw SQL is used deliberately for the PostGIS work, which Prisma's
query builder does not model.

**Socket.IO 4** — the realtime push described above.

**MQTT.js 5** — broker client, with automatic reconnection.

**ioredis 5** — Redis client, with pipelining so a multi-key write is one round
trip.

**Zod 3** — runtime validation at every boundary: MQTT payloads, request bodies,
query strings, and environment variables at boot. TypeScript types vanish at
runtime; a tracker sending a string where a number is expected is a real
possibility, and the environment schema means a missing variable fails at
startup with a clear message instead of surfacing as `undefined` an hour later.

**jose** — JWT signing and verification, standards-correct and maintained.

**@node-rs/argon2** — password hashing, as above.

**Helmet + CORS** — security headers and a locked-down origin allowlist.

**Pino + pino-http** — structured JSON logging. Every request and every rejected
GPS reading is a queryable object rather than a string, which is what made the
632-rejection cascade diagnosable at all.

**tsx** — runs TypeScript directly with watch mode, so there is no build step in
the development loop.

### Web

**React 19 + TypeScript** — the UI. `useSyncExternalStore` is what binds the live
socket store into React without tearing.

**Vite 6** — dev server and build. Instant HMR; the production bundle is built in
about 17 seconds.

**Tailwind CSS 4** — styling, with the design tokens declared in CSS via
`@theme`. Keeps spacing, colour and type consistent across 20+ screens built at
speed, which is exactly where a hand-rolled stylesheet drifts.

**React Router 7** — routing, including the role-gated operator routes.

**Leaflet + react-leaflet** — the map, on a greyscale Carto basemap so that
coloured bus markers and route lines are the most salient thing on screen.
Leaflet rather than a vector-tile engine because it is light, has no API key,
and the map here is a 2D overlay of markers and polylines.

**Framer Motion** — transitions and sheet animations.

**vite-plugin-pwa** — service worker and offline caching, so the app installs to
a home screen and opens without a connection.

**socket.io-client** — the other half of the realtime link.

### Testing

**Vitest 4** — 93 tests at the workspace root, covering the pure logic the
product's credibility rests on: whether a GPS reading can be trusted, how
confidence decays, how emissions are scored, how tokens and passwords behave, and
who wins when a driver and a device disagree. None of it needs Postgres, Redis or
a broker — which is the reason those rules live in plain functions in the first
place, and why the suite runs in under a second.

---

## 8. Data model

| Table | Purpose |
|---|---|
| `stops` | Stop master, with a PostGIS point and a GiST index |
| `routes` | Route master, with the alignment as a PostGIS `LineString` |
| `route_stops` | Ordered stops on a route, with cumulative distance |
| `buses` | Fleet master: fuel, emission norm, year, seats, amenities |
| `trips` | One run of a bus along a route |
| `bus_locations` | Every accepted GPS reading, with derived geometry |
| `eta_predictions` | ETA snapshots, so predictions can be scored after the fact |
| `alerts` | GTFS-Realtime style service alerts |
| `users` | Staff accounts and roles |
| `refresh_tokens` | Session families, with reuse detection |
| `audit_logs` | Append-only record of privileged actions |

The model deliberately mirrors **GTFS** (stops, routes, trips, shapes) and
**GTFS-Realtime** (VehiclePosition, TripUpdate, ServiceAlert). That is the format
transport authorities actually publish, so a real HRTC feed can replace the seed
data without reshaping the schema.

---

## 9. The simulator

`npm run dev:sim` publishes GPS for 17 vehicles over the same MQTT topics real
trackers would use. It is not a mock: the API cannot tell it apart from hardware,
and every reading goes through the full validate → match → ETA → broadcast path.

It runs at 12× real time so a two-hour route is watchable in ten minutes, and it
models conditions the happy path would never exercise: **dead zones** on three
routes where a vehicle goes silent and then flushes its buffer on return, one
service pinned **cancelled**, and others pinned **delayed**.

One demo-only consequence: 12× time compression implies 12× speed, so
`GPS_MAX_SPEED_KMPH` is raised to 1440 in the local `.env`. The real value is the
code default of 120.

---

## 10. Known limits

Stated plainly, because a demo that overclaims is worse than one that does not.

- **ETAs use typical route speed, not learned history.** The `eta_predictions`
  table exists so that a model could be trained on observed versus predicted, but
  nothing consumes it yet.
- **The traffic/congestion model is client-side only.** It affects the offline
  fallback simulator, not server-computed live arrivals. Porting it into the
  server ETA engine is the clearest next improvement.
- **No SMS gateway.** The `BUS <code>` reply is rendered in-app so a user can see
  what a relative without a smartphone would receive, but nothing is sent.
- **No push notifications.** Alerts reach the app over REST and the socket; a web
  push subscription is not wired up.
- **The dataset is representative, not official.** 26 stops, 8 routes and 17
  vehicles across Shimla, Mandi, Kullu, Manali and Dharamshala, built to be
  plausible. Real HRTC GTFS would replace it without schema changes.
- **Fares are static.** No ticketing or payment integration.
