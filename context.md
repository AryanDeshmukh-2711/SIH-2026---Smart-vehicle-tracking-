# Routify — Working Context

> Handoff notes for picking this project up cold. Covers what exists, why it was
> built this way, the non-obvious decisions, the bugs already found and fixed,
> and the environment quirks that will otherwise cost you an hour.
>
> Last updated at commit `0d3f464`. 11 commits, all pushed to
> `github.com/AryanDeshmukh-2711/SIH-2026---Smart-vehicle-tracking-` on `main`.

---

## 1. What this is

**Routify** — a smart public transport and tourism platform for Himachal
Pradesh, built for **SIH 2026**. Full stack, everything on the web.

The product answers three questions from the SRS: *where is my bus*, *when will
it reach me*, *how clean is it*. Everything else hangs off those.

**The two positions that shape every screen:**

1. **GPS is one input among six, not the input.** In the hills GPS is routinely
   the *worst* available signal — valley walls reflect it, deodar cover blocks
   it, coverage gaps stop an assisted fix converging. So position resolves via
   GPS, stop search, landmark, map pin, QR plate, or route/bus number with no
   location at all. Each states the accuracy it can honestly claim, and a GPS fix
   worse than 500 m is **rejected** — a vague fix that sends you to the wrong
   stop is worse than no fix.

2. **Never show a precision the data cannot support.** Confidence derives from
   data freshness alone, and the answer changes *shape* as the feed ages. This is
   computed server-side, not in the UI.

If you change one thing in this codebase, do not quietly break either of those.
They are the whole differentiator.

---

## 2. Current status

| | |
|---|---|
| Commits | 11, all pushed, working tree clean |
| Tests | **83 passing**, 6 files, ~0.5 s, zero infra needed |
| Typecheck | clean across all three packages |
| Build | clean (`npm run build`) |
| Last verified live | 4,440 / 4,440 GPS readings accepted, 0 rejected |

**⚠️ Docker Desktop is currently stopped**, so Postgres/Redis/MQTT are down and
the API + simulator are not running. Nothing is broken — see §4 to bring it back.

---

## 3. Repo layout

npm workspace. The frontend used to sit at the repo root and was moved into
`web/` when the backend arrived.

```
routify/
├── api/                  Backend — GPS pipeline, ETA engine, REST + realtime
│   ├── prisma/           Schema + 3 migrations
│   └── src/
│       ├── config/       env (zod-validated), pino logger
│       ├── db/           prisma, redis, geo.ts (raw PostGIS)
│       ├── http/         routes.ts (public), auth/driver/admin routers, middleware
│       ├── realtime/     socket.ts (rooms), publish.ts (fan-out)
│       ├── services/     gps/, eta/, ops/, auth/, audit
│       ├── state/        network.ts (in-memory graph), live.ts (Redis)
│       ├── seed/         run.ts, accounts.ts
│       └── simulator/    run.ts — the demo centrepiece
├── web/                  React PWA: 18 passenger screens + 3 operator screens
├── packages/shared/      Rules BOTH sides need, so they cannot drift
├── infra/mosquitto/      Broker config
├── docker-compose.yml    Postgres+PostGIS, Redis, Mosquitto
└── vitest.config.ts      Root test runner
```

### Why `packages/shared` exists

The Green Score formula, CO₂ factors, confidence thresholds, geo maths and the
8-route dataset live in **exactly one file each**. The API scores a bus and the
frontend displays it using *the same function*. They cannot disagree.

`web/src/lib/{eta,green,geo}.ts` and `web/src/data/{stops,routes,buses,alerts}.ts`
are **thin re-export shims** pointing at `@routify/shared`. That was deliberate:
it kept ~40 existing imports working unchanged during the restructure. Don't add
logic to the shims.

Aliases are configured in three places and must stay in sync:
`web/vite.config.ts` (array form — order matters, longest prefix first),
`web/tsconfig.json`, `api/tsconfig.json`, plus `vitest.config.ts`.

---

## 4. Running it

```bash
npm install
cp .env.example .env          # already done; .env is gitignored
npm run infra:up              # needs Docker Desktop running
npm run db:migrate
npm run db:seed
```

Then three terminals:

```bash
npm run dev:api               # :4000
npm run dev:sim               # publishes GPS over MQTT — run ONE only
npm run dev:web               # :5173
```

| Command | Does |
|---|---|
| `npm test` | 83 tests |
| `npm run typecheck` | all packages |
| `npm run dev:reset` | flush stale Redis vehicle state |
| `curl localhost:4000/api/v1/health` | status + live GPS accept/reject counts |

### Environment quirks that will cost you time

- **Postgres is on port 5433, not 5432.** A local `postgresql-x64-18` Windows
  service already owns 5432. We moved *our container* rather than touching your
  install. If auth fails against the DB, this is why.
- **`prisma generate` fails while the API is running** — Windows locks the query
  engine DLL. Stop the API first.
- **Restarting the API leaves stale vehicle state in Redis.** Run
  `npm run dev:reset`. Symptoms otherwise: vehicles frozen at old positions.
- **Never run two simulators.** They publish conflicting positions for the same
  buses and silently break the dead-zone demo. The simulator now uses a fixed
  MQTT client id so a second instance kicks the first off — but don't rely on it.
- **`pkill` does not kill Windows node processes.** Use PowerShell:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "SIH-2026" } | Stop-Process -Force`
- **Don't pipe long-running servers through `head`** — it closes stdout and
  kills them (this happened; looked like a crash, wasn't).

---

## 5. The pipeline

```
Bus GPS ──MQTT──▶ validate ──▶ map-match ──▶ Redis live ──▶ ETA engine ──▶ Socket.IO ──▶ web
(simulator)       FR-3         PostGIS       state           + confidence
                                   │
                            Postgres history
```

Two MQTT topics, deliberately separate:

- `routify/bus/{id}/location` — position only. What AIS-140 hardware produces.
- `routify/bus/{id}/status` — delay, crowd level, cancellation, bay departure.
  **Operator-reported**, per SRS FR-37 (driver app "report delay" / "update
  crowd"). A tracker has no idea whether the depot cancelled a trip; putting
  that in the position payload would mean inventing telemetry.

The driver app also POSTs positions to `/api/v1/driver/trips/:id/location`,
which goes through the *identical* validation and map-matching. That's the SRS's
stated mitigation for "GPS box missing or broken".

### Key modules

| File | Owns |
|---|---|
| `api/src/services/gps/validate.ts` | What is trustworthy. Pure, heavily tested. |
| `api/src/services/gps/ingest.ts` | The one path a position takes. |
| `api/src/services/eta/engine.ts` | Arrivals + confidence + timetable fallback. |
| `api/src/state/live.ts` | Redis live state; **merges two writers** (see §7). |
| `api/src/state/network.ts` | In-memory route graph. Call `refreshNetwork()` after admin edits. |
| `api/src/db/geo.ts` | Raw PostGIS: `ST_LineLocatePoint`, `ST_DWithin`. |
| `web/src/services/live/liveStore.ts` | Socket feed, falls back to bundled simulator. |
| `web/src/services/live/queries.ts` | **One** source of "what's running now". |

---

## 6. Domain rules — the numbers that must not drift

### ETA confidence (SRS §8.3)

| Fix age | Confidence | Shown as |
|---|---|---|
| < 60 s | high | `7 min` |
| < 300 s | medium | `7 min (±2)` |
| ≥ 300 s | low | `8–14 min` |
| ≥ 180 s silent | — | `Signal lost — last seen at Mandi, 4 min ago` |
| ≥ 900 s silent | — | abandons live position, answers from **timetable** |

**The thresholds overlap on purpose.** Signal-lost fires at 180 s while
confidence is still *medium* until 300 s — so a passenger is warned the bus went
quiet **before** the number visibly loosens. A test pins this so it can't be
"tidied" into one threshold. (I got this backwards on the first attempt.)

### Green Score (SRS §9.2)

`fuel×0.50 + norm×0.35 + age×0.15`

Fuel: electric 100, CNG 80, hybrid 70, diesel 40.
Norm: zero-tailpipe/BS-VI 100, BS-IV 65, BS-III 30.
Age: ≤3 yr 100, ≤8 yr 70, ≤12 yr 45, else 20.

Tested against the SRS's own worked examples: **new electric = exactly 100**,
**10-year-old BS-IV diesel = exactly 50**.

### CO₂ (SRS §9.3)

`(car − bus) × distance`. Car 0.17, diesel 0.05, CNG 0.04, electric 0.02 kg/passenger-km.
Hybrid 0.035 is *interpolated*, not measured — flagged as such in the UI.
**25 km electric = exactly 3.75 kg.**

**BS-IV and BS-III are never described as clean.** A test asserts the copy says
"superseded" and "obsolete". The SRS is explicit that mislabelling them is the
fastest way to lose a transport department's trust.

---

## 7. Bugs already found and fixed — do not reintroduce

These cost real debugging time. Each has a regression test or a comment.

1. **Dead-zone recovery was impossible.** Every buffered reading uploaded after a
   blackout was compared against the same pre-blackout fix and rejected as
   "impossible speed" — and since the last-accepted position never advanced, the
   vehicle could never re-acquire. Fix: the speed check does not apply across a
   gap longer than `SIGNAL_LOST_AFTER_SEC`. *Would have hit production.*

2. **Lost update on crowd level.** Position and operator state shared one Redis
   key with two writers; the GPS handler wrote its stale copy back over an
   occupancy the status handler had just set, every 2 s. Occupancy stayed
   `unknown` forever. Fix: separate keys (`bus:{id}:live`, `bus:{id}:ops`),
   merged on read. The GPS path also broadcasts the *merged* view.

3. **Empty terminus board.** Shimla ISBT is the origin of six routes and showed
   **zero** departures. A bus parked in the bay had made no progress, so it was
   treated as having already passed the first stop. Fix: a stationary vehicle at
   the origin is recognised as awaiting departure, with the bay time coming from
   the operator (falling back to the timetable).

4. **Timetable quoted 153 min for a bus about to pull out.** First attempt at
   #3 inferred the bay departure from the schedule. The timetable only knows when
   *a* bus is due; the depot knows which vehicle is on which run.

5. **Dwell double-count.** A bus waiting in the bay was charged dwell time for
   the stop it was already standing at, *on top of* the wait. Found by a test.

6. **Two simulators racing** — see §4.

7. **Four services bypassed the live feed.** `transit/journey/places/search`
   queried the bundled simulator while the map read the socket, so the journey
   planner could contradict the live map on the same screen.

---

## 8. Auth model

Three sign-in paths, matching who actually signs in:

| Who | How |
|---|---|
| Passenger | phone + OTP |
| Driver | employee id + OTP (FR-34) — the cab needs no keyboard |
| Depot / admin | username + password (Argon2id) |

**Transit data stays public — deliberately.** Where buses are, when they arrive,
what fares cost: no login. It's public information, and the SRS targets people
reaching this by SMS/IVR *because* they won't install an app. Auth guards
writing and privileged reading only.

Demo accounts (seeded):

| Role | Identifier | Password |
|---|---|---|
| Driver | `HRTC-D-4021` | OTP only |
| Depot manager | `HRTC-M-SML` | `shimla-depot-2026` |
| Admin | `HRTC-ADMIN` | `routify-admin-2026` |
| Authority | `HPTA-001` | `authority-oversight-2026` |

In development the OTP returns as `devCode` in the response — gated on
`NODE_ENV`. Sign in at **`/operator/login`**.

**Enforced:** refresh tokens stored hashed and rotated; presenting an
already-rotated token revokes the whole family (can't tell who the thief is).
OTPs hashed with identifier as salt, constant-time compared, single-use, burned
after 5 wrong guesses. Credential rate limiting keys on the **identifier, not
the IP** — a proxy pool would sail past an IP limit. OTP requests answer
identically for unknown accounts (no enumeration). Password verify returns false
on a corrupt hash rather than throwing. Everything privileged is audited.

---

## 9. The demo

`SIM_TIME_SCALE=12` compresses time so a 7-hour Shimla–Manali run is watchable.

**`GPS_MAX_SPEED_KMPH=1440` looks wrong and isn't.** At 12× a bus genuinely
implies 12× the speed, and the validator — which has no idea it's being fed a
simulation — correctly rejected every reading at 120. **The real-world value is
120.** Both settings are documented as demo-only.

### What to show

**The flagship: bus `HP-01-3312` on route 42B.** A few minutes in it enters the
Pandoh–Aut gorge between Mandi (138 km) and Bhuntar (190 km) — genuinely the
worst coverage on that corridor. Watch:

`On time → Signal lost (>3 min) → range widens (>5 min) → timetable (>15 min) → snaps back on reconnect`

Takes ~4–5 minutes to complete a cycle. **Time this before presenting.**

Also pinned so they're always visible: `HP-52-0456` cancelled, `HP-52-1187`
14 min late, `HP-01-5540` 7 min late.

Then: `/admin` shows the same dead-zone bus from the operator side, worst-first.

---

## 10. What's built

**Passenger (18 screens)** — Home, Search (parses "bus from Shimla to Manali
tomorrow morning"), Journey planner, Live map, Bus info, Reviews, Stop details,
Smart location, QR scanner, Explore, Destination, Itinerary, Trips,
Sustainability, Notifications, Profile, Offline, UI-states gallery.

**Driver** (`/driver`, FR-34..38) — one screen, one full-width button, nothing
to type. Start/end trip, phone-as-backup-tracker with Wake Lock, one-tap crowd
and delay, breakdown (cancels + alerts passengers), SOS (never fails validation
into a dead end). The driver can always see *whether the depot can see them*.

**Depot/authority** (`/admin`, FR-39..43) — live fleet worst-first refreshing
every 5 s, punctuality per route, alert publish/withdraw, CSV route import,
append-only audit log.

Punctuality counts "late" at **5 minutes — the same threshold the passenger app
uses to badge a service.** A report using a different definition would be
indefensible in a review meeting.

### Data

8 real HRTC corridors, 26 stops, 17 buses, 7 alerts, 6 demo users. Stop
coordinates are approximate town/stand positions (few hundred metres), meant to
be replaced by surveyed data. Route polylines are coarse; each carries its
published road distance and per-stop distances are rescaled to it, so quoted
kilometres are right even though the drawn line is simplified.

---

## 11. Not built / known limits

- **A web driver app cannot track GPS with the screen off.** Browser tabs
  suspend. Wake Lock holds the screen (fine for a dashboard-mounted phone) and
  the limitation is stated *on screen*. A native app is the only complete fix.
- **Push notifications** need a service worker over HTTPS, so arrival alerts run
  over the live socket, not mobile push. FCM won't fire on localhost.
- **SMS / IVR gateway** — the stop screen renders the exact reply a gateway would
  send, but the telecom integration is out of scope.
- **Route/stop creation is CSV import, not a full editor.** Imported shapes join
  stop positions in a straight line — flagged in the response as not surveyed.
- **No backend** for places/tourism, reviews, trip history, saved places — those
  screens still run on bundled data.
- **LightGBM ETA model** — the engine is deterministic; the interface is shaped
  so a model can replace it.
- **Simulator vs driver reports:** the simulator republishes status every 2 s, so
  a driver's delay report on a *simulated* bus is overwritten shortly after. Demo
  artifact only.

### Sensible next steps

1. Point the remaining passenger services (places, itinerary, reviews, trips) at
   the API — they're the last bundled-data holdouts.
2. Integration tests for the auth routes and the driver/admin endpoints (current
   83 are unit-level and infra-free by design).
3. Trip lifecycle: trips seeded as `scheduled` never transition automatically;
   only the driver app moves them.
4. OpenAPI spec — the endpoint paths are already documented in code.

---

## 12. Conventions

- **Comments explain *why*, never *what*.** Existing comments carry real
  reasoning (why a threshold, why a trade-off). Match that; don't narrate code.
- Ordinary-language commit messages, no marketing.
- `.env` is gitignored and holds a real generated `JWT_SECRET`;
  `.env.example` ships a placeholder. Verified no secret is in any tracked file.
- The design system is in `web/src/components/ui/` — deep teal accent, hairline
  borders, restrained elevation. Pills are reserved for live status.
- Destination artwork is **generated SVG** from a seed, not photography — a
  weak hill connection can't afford image payloads.
