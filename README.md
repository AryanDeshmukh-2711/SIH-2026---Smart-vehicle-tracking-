# 🚌 HimGati

### Know where your bus is. Know when it'll reach you. Know how clean it is.

HimGati is a smart bus-tracking platform built for Himachal Pradesh — a place where GPS gets confused by the mountains and mobile signal disappears for miles at a time. So instead of showing a dot on a map and hoping for the best, HimGati tells you the *truth*: exactly how sure it is about where your bus is, and gives you five other ways to find your stop when GPS gives up.

Everything runs in the browser. Built for **SIH 2026**.

---

## 🚀 Run it yourself

You'll need [Node.js](https://nodejs.org) (LTS) and [Docker Desktop](https://www.docker.com/products/docker-desktop/). Then, from the project folder:

```bash
npm install
cp .env.example .env
npm run infra:up
```

That starts the database, cache and message broker in Docker. Now set up the data:

```bash
npm run db:migrate
npm run db:seed
```

Then open **three terminals** and run one command in each:

```bash
npm run dev:api
```
```bash
npm run dev:sim
```
```bash
npm run dev:web
```

Open **http://localhost:5173** — buses will be moving.

> **What each one does:** `dev:api` is the backend. `dev:sim` pretends to be 17 buses driving around Himachal and reporting their GPS — real buses would do this themselves. `dev:web` is the app you look at.

### 👀 Where to start looking

| Do this | You'll see |
|---|---|
| Look at the **Home** screen | Buses arriving near you with live countdown timers |
| Tap **"Track bus"** | A live map with buses actually moving along real routes |
| Tap any bus | Full detail — fuel type, cleanliness score, what's onboard |
| Tap **"GPS not working?"** | Six ways to find your location without GPS |
| Open **Explore** | Places worth visiting, each with the bus that gets you there |
| Open **"Build a day plan"** | Tell it what you like; it plans your day around bus timings |

💡 **The one to watch:** bus **HP-01-3312** on route 42B. A few minutes in, it drives into the Pandoh–Aut gorge between Mandi and Bhuntar, where there's genuinely no mobile coverage. You'll watch it go **On time → Signal lost → widening estimate → printed timetable**, then snap back when it reconnects and uploads everything it recorded while dark. That behaviour is the whole point of the project.

---

## 🧩 The problem, and what we do about it

If you've waited at a bus stop in the hills you know the feeling: *has it already left? Is it 5 minutes away or 50? Did a landslide cancel it?*

Every transit app struggles here for two reasons — **mountains block GPS** and **the network disappears**. HimGati is designed around that instead of pretending otherwise.

**1. GPS is one option, not the only one.**
Find your stop by GPS, stop name, a nearby landmark, a pin on the map, the QR code on the stop's plate, or just the bus's route number. Each method reports the accuracy it can honestly claim — a QR scan is ±5 m, a landmark is ±220 m — and a GPS fix worse than 500 m is *rejected*, because a vague fix that sends you to the wrong stop is worse than no fix at all.

**2. We never show a confidence we don't have.**
Arrival times change *shape* as the data ages. This is enforced in the backend, not the UI:

| Time since the bus last reported | What you see |
|---|---|
| under 1 minute | `7 min` |
| under 5 minutes | `7 min (±2)` |
| over 5 minutes | `8–14 min` |
| over 3 minutes silent | `Signal lost — last seen at Mandi, 4 min ago` |
| over 15 minutes silent | falls back to the printed timetable |

Other apps freeze the bus icon and let you believe it's live. Telling the truth about staleness is the feature.

---

## 🏗 How it's built

```
Bus GPS  ──MQTT──▶  validate  ──▶  map-match   ──▶  Redis      ──▶  ETA engine
(simulator)         reject bad     onto the road    live state       + confidence
                    readings       (PostGIS)                              │
                                                                    Socket.IO
                          Postgres ◀── history                            │
                                                                    the web app
```

A **modular monolith**, not fifteen microservices. Everything is one Node process today; the ETA engine, GPS ingestion and notification workers are separated cleanly enough to split out later if load ever demands it.

| Piece | Choice | Why |
|---|---|---|
| Database | PostgreSQL + **PostGIS** | The data is deeply relational, and "which stops are within 2 km" is a spatial query |
| Live state | **Redis** | Where a bus is *right now* is disposable and read constantly |
| GPS intake | **MQTT** | What AIS-140 vehicle trackers actually speak; survives a flaky link far better than an HTTP request every 10 seconds |
| Live updates | **Socket.IO** | Polling every bus would blow past the SRS's 5 MB/hour data budget |
| Frontend | React + Vite, installable PWA | One URL, works on any phone, caches for offline |

```
himgati/
├── api/                 Backend — GPS pipeline, ETA engine, REST + realtime
├── web/                 The app you look at
├── packages/shared/     Rules used by BOTH sides, so they can never disagree
├── infra/               MQTT broker config
└── docker-compose.yml   Postgres + Redis + MQTT
```

**Why `packages/shared` matters:** the Green Score formula, the CO₂ factors, the confidence thresholds and the 8-route dataset live in exactly one file each. The backend computes a bus's score and the frontend displays it using *the same function* — they cannot drift apart.

---

## 🌱 The numbers are real arithmetic

- **Green Score** — `fuel×50% + emission norm×35% + age×15%`. The bus screen shows all three components and their weights, so a "94" can be challenged and checked.
- **CO₂ saved** — `(car − bus) × distance`, summed from your actual trip history rather than stored, so the monthly total always reconciles with the journeys listed under it. Every assumption is printed on the page.
- **No greenwashing** — BS-IV and BS-III buses get warning and error colours and are described as "superseded" and "obsolete". A bus whose operator never filed an emission record is labelled *estimated*, not silently guessed.

---

## 🔌 Swapping in real buses

The simulator publishes to the same MQTT topic real hardware would (`him_gati/bus/{id}/location`). Nothing downstream knows the difference — validation, map-matching and prediction all run identically. Point a real AIS-140 fleet at the broker and the simulator simply stops being needed.

Two settings in `.env` exist purely for the demo and should change in production:

- `SIM_TIME_SCALE=12` compresses time so a 7-hour Shimla–Manali run is watchable. Real time is `1`.
- `GPS_MAX_SPEED_KMPH=1440` is raised only because of that compression — a bus covering 12 minutes of road per real minute genuinely implies 12× the speed, and the validator (which has no idea it's being fed a simulation) would correctly throw every reading away. **The real-world value is 120.**

---

## ⚠️ Known limitations

Worth stating plainly rather than being caught out on:

- **A web driver app can't track GPS with the screen off.** Browser tabs suspend when backgrounded. The driver device must keep the tab in the foreground (we use a Screen Wake Lock). A native app is the only real fix.
- **Push notifications** need a registered service worker over HTTPS, so arrival alerts run over the live socket rather than mobile push in this build.
- **Stop coordinates** are approximate town and stand positions, good to a few hundred metres, intended to be replaced by surveyed data from the transport department.

## 🧪 Tests

```bash
npm test
```

67 tests covering the logic the product's credibility rests on. None of them need Postgres, Redis or the broker — that's deliberate, and the reason those rules live in plain functions in `packages/shared`.

- **GPS validation** — impossible speeds, swapped coordinates, broken device clocks, GPS jitter over short intervals, and out-of-order readings from a dead-zone backlog.
- **Confidence ladder** — the exact thresholds and output shapes from SRS §8.3, including that a bus is declared Signal Lost at 3 minutes while its ETA is still medium-confidence until 5.
- **ETA engine** — road distance, dwell time, degradation with age, the 15-minute timetable fallback, and departures from the origin bay.
- **Green Score & CO₂** — checked against the SRS's own worked examples: a new electric bus scores exactly **100**, a ten-year-old BS-IV diesel exactly **50**, and 25 km on an electric bus saves exactly **3.75 kg**.

Two tests are regression guards for bugs that reached the running app: the dead-zone recovery cascade, and the empty terminus board.

## 🚧 Not built yet

- **Driver app** — start/end trip, delay reporting, SOS
- **Admin dashboard** — fleet map, route editing, punctuality reports

The SMS and phone-line (IVR) fallbacks are *shown* in the app — the stop screen renders the exact text reply a gateway would send — but the telecom gateway itself is outside this build.

---

## 🛠 Commands

| Command | What it does |
|---|---|
| `npm run infra:up` / `infra:down` | Start / stop Docker services |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load routes, stops and buses |
| `npm run dev:api` | Backend on :4000 |
| `npm run dev:sim` | Bus simulator (run **one** at a time) |
| `npm run dev:web` | App on :5173 |
| `npm run typecheck` | Typecheck every package |
| `npm test` | Run the test suite |
| `npm run dev:reset` | Clear stale live vehicle state from Redis |
| `curl localhost:4000/api/v1/health` | Backend status + live GPS accept/reject counts |
