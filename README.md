# HimGati

**Smart public transport & tourism platform for Himachal Pradesh**
SIH 2026 · Real-time bus tracking, journey planning, tourism discovery and sustainable travel information.

A mobile-first React PWA. Runs from a single URL, installs to a home screen, and works from downloaded data when the signal goes.

```bash
npm install
npm run dev      # http://localhost:5173
```

---

## The problem, and the position we take on it

In Himachal, people wait at stops without knowing whether the bus has already left, whether it is five minutes or fifty away, or whether it was cancelled by a landslide. Existing apps fail here for two specific reasons: **the hills break GPS accuracy**, and **mobile networks vanish for long stretches**.

So the product takes two positions that shape every screen:

**1. GPS is one input among six, not the input.**
Position can be established by GPS, bus-stop search, landmark, a manually dropped map pin, a QR plate at the stand, or by route/bus number with no location at all. Each method reports the accuracy it can honestly claim — a QR scan is ±5 m, a landmark is ±220 m — and a GPS fix worse than 500 m is *rejected*, because a vague fix that sends you to the wrong stop is worse than no fix.

**2. Never show a precision the data cannot support.**
Confidence is derived from data freshness alone, and the number changes shape as the feed ages:

| Fix age | Confidence | Shown as |
|---|---|---|
| under 1 min | High | `7 min` |
| under 5 min | Medium | `7 min (±2)` |
| over 5 min | Low | `8–14 min` |
| over 3 min silent | — | `Signal lost — last seen at Kandaghat, 4 min ago` |
| over 15 min silent | — | prediction abandoned; the printed timetable answers instead |

Other apps freeze the bus icon and let you believe it is live. Telling the truth about staleness is the feature.

---

## What is implemented

All 18 screens, one design system, live data throughout.

**Core** — Home · Search · Journey planner · Live bus map
**Transit detail** — Bus information · Bus reviews · Stop details · Smart location · QR scanner
**Tourism** — Explore Himachal · Destination detail · Smart itinerary
**Personal** — My trips · Sustainability · Notifications · Profile · Offline mode
**Reference** — UI states (every loading, empty, error and permission path in one place)

On a desktop viewport the app renders in a device frame with a screen index on the left, so every screen is one click away for a reviewer.

### The numbers are real arithmetic, not copy

Every figure on screen is computed, traceable and defensible:

- **Green Score** (`src/lib/green.ts`) — `fuel×0.50 + norm×0.35 + age×0.15`, per the SRS weighting. The bus detail screen prints the three components and their weights, so a depot manager challenging a "94" can see where it came from.
- **CO₂** — `(car − bus) × distance` using 0.17 / 0.05 / 0.04 / 0.02 kg per passenger-km. The sustainability dashboard sums from the trip history rather than storing a total, so the monthly figure always reconciles with the journeys listed under it. Every assumption is printed on the page.
- **Emission norms are not flattered.** BS-IV and BS-III get warning and error colours and are described as "superseded" and "obsolete". A bus whose operator never filed an emission record is labelled *estimated* rather than silently guessed.

### The simulator

The SRS calls a bus simulator the demo centrepiece, and `src/services/simulation/simulator.ts` is it. It stands in for the whole ingest pipeline — AIS-140 VLTD → MQTT → cleaning → map-matching → prediction → WebSocket fan-out — and emits exactly the `VehiclePosition` shape a GTFS-Realtime feed produces.

It runs at **12× wall clock** so a 7-hour Shimla–Manali run is watchable. Pinned states so a demo never depends on luck:

| Vehicle | State |
|---|---|
| `HP-01-3312` | Enters a modelled dead zone between Sundernagar and Mandi ~45 s after load. Watch it drop to **Signal lost**, the age counter climb, the ETA widen to a range, then fall back to the timetable at 15 min — and finally *slide* back to its true position on recovery rather than teleporting. |
| `HP-52-0456` | Cancelled (and a BS-III private vehicle, so it also demonstrates the honest emissions treatment) |
| `HP-52-1187` | Running 14 minutes late |
| `HP-01-5540` | Running 7 minutes late |

---

## Architecture

Built so the mock layer can be replaced without touching a screen.

```
src/
  types/         Domain model — a lossless projection of GTFS + GTFS-Realtime
  lib/           green.ts (Green Score, CO₂) · eta.ts (confidence rules) · geo.ts (haversine, map-matching)
  data/          Stops, routes, fleet, places, trips, reviews, alerts
  services/
    client.ts    The transport seam — mock today, `mode: 'http'` tomorrow
    adapters/    GTFS static, GTFS-RT VehiclePosition/TripUpdate, and Vahan → domain mappings
    simulation/  Fleet simulator standing in for the live feed
    ...          transit · journey · places · itinerary · search · location · offline
  components/    ui/ (design system) · transit/ · map/ · layout/ · art/
  screens/       18 screens
```

**Every service call goes through `request()` in `services/client.ts`.** Each one carries the endpoint path it will eventually hit, so the API surface is documented in code. Switching to a real gateway is a config change plus the adapters in `services/adapters/gtfs.ts`, which are written and type-checked against the domain model already.

Designed to accept: GTFS static bundles, GTFS-Realtime (VehiclePosition, TripUpdate, ServiceAlert), AIS-140 VLTD streams over MQTT, HRTC/HPTDC operator APIs, the HP tourism dataset, and crowd reports.

### Stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind v4 · React Router 7 · Leaflet + OpenStreetMap (Carto Positron) · Framer Motion · vite-plugin-pwa

Maps use a greyscale basemap deliberately: a transit map has to carry four overlays at once — routes, vehicles, stops, the user — and a colourful basemap makes that unreadable. OSM tiles also satisfy the SRS's "free, no per-call cost" constraint.

Destination artwork is **generated**, not photographed — each place renders a deterministic ridge-line scene from its seed. Photography would mean shipping tens of megabytes or fetching from a CDN, neither of which is acceptable for an app whose premise is working on a weak hill connection.

---

## Data

Eight real HRTC corridors across the Shimla, Mandi, Kullu and Kangra valleys (Shimla–Manali, Shimla–Parwanoo, Shimla–Narkanda, Shimla–Chail, Shimla–McLeod Ganj, Kullu–Manali, Manali–Solang, Shimla city circular), 26 stops and 16 vehicles with real fuel/norm/year mixes.

Stop coordinates are approximate town and stand positions, good to a few hundred metres — enough for route drawing and walk estimates, and intended to be replaced by surveyed positions from the transport department. Route polylines are coarse; each route carries its published road distance and per-stop distances are rescaled to it, so quoted kilometres are right even though the drawn line is simplified.

---

## Not built

Scoped out deliberately, both in the SRS but outside the passenger app:

- **Driver app** — OTP login, Start/End Trip, delay and breakdown reporting, SOS
- **Admin panel** — fleet map, route/stop CRUD, on-time reports, disruption publishing

The SMS (`BUS 0456`) and IVR access paths are *shown* in the app — the stop screen renders the exact reply a gateway would send — but the gateway itself is backend work.
