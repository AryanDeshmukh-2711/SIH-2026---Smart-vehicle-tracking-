<div align="center">

# 🚌 Routify

### Know where your bus is. Know when it'll reach you. Know how clean it is.

**Smart bus tracking built for Himachal Pradesh — where mountains confuse GPS and the signal vanishes for miles —<br/>so it tells passengers the truth about how sure it is, instead of a frozen dot on a map.**

<br/>

![SIH 2026](https://img.shields.io/badge/Smart_India_Hackathon-2026-FF9933?style=for-the-badge) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white) ![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
<br/>
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) ![PostGIS](https://img.shields.io/badge/PostgreSQL-PostGIS-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-live_state-DC382D?style=for-the-badge&logo=redis&logoColor=white) ![MQTT](https://img.shields.io/badge/MQTT-GPS_feed-660066?style=for-the-badge&logo=mqtt&logoColor=white) ![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

![Tests](https://img.shields.io/badge/tests-90+_passing-2EA043) ![Routes](https://img.shields.io/badge/routes-8-10B981) ![Stops](https://img.shields.io/badge/stops-26-10B981) ![Buses](https://img.shields.io/badge/simulated_buses-17-10B981)

</div>

---

## 👋 In 30 seconds

<table>
<tr>
<td width="22%">

😟 **The problem**

</td>
<td>

Waiting at a bus stop in the hills: *has it already left? Is it 5 minutes away or 50?* Mountains block GPS and mobile signal disappears for miles, so ordinary tracking apps freeze the bus icon and let you believe it's live.

</td>
</tr>
<tr>
<td width="22%">

💡 **The idea**

</td>
<td>

Be honest about uncertainty. Arrival times **widen** as the data gets older, a bus that goes quiet is shown as "signal lost", and after 15 minutes the app falls back to the printed timetable. When GPS fails, there are five other ways to find your stop.

</td>
</tr>
<tr>
<td width="22%">

🎯 **Who it's for**

</td>
<td>

Passengers in Himachal, the drivers, and the depots that run the fleet — each with their own screen.

</td>
</tr>
<tr>
<td width="22%">

🚦 **Where it is**

</td>
<td>

Built for **Smart India Hackathon 2026**. The whole system runs, with 17 simulated buses driving 8 real routes — the simulator speaks the same language real vehicle trackers do.

</td>
</tr>
</table>

---

## 🧭 How it works for a passenger

```mermaid
flowchart TB
    subgraph R1[" "]
        direction LR
        A["📍 Find your stop<br/>six ways"] --> B["⏱️ See arrivals<br/>live countdown"] --> C["🗺️ Watch buses<br/>move on the map"]
    end
    subgraph R2[" "]
        direction LR
        D["📶 Signal lost?<br/>Told honestly"] --> E["🌱 See how clean<br/>each bus is"] --> F["🧭 Plan a day<br/>around bus times"]
    end
    R1 --> R2

    classDef step fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#064E3B
    class A,B,C,D,E,F step
    style R1 fill:none,stroke:none
    style R2 fill:none,stroke:none
```

---

## ✨ What it can do

<table>
<tr>
<td width="50%" valign="top">

### ⏱️ Arrival times that tell the truth
Fresh data shows `7 min`. Older data shows `7 min (±2)`, then a range like `8–14 min`. A silent bus becomes *"Signal lost — last seen at Mandi, 4 min ago"*, and after 15 minutes the printed timetable takes over. The rules live in the backend, not just the screen.

</td>
<td width="50%" valign="top">

### 📍 Six ways to find your stop
GPS, stop name, a nearby landmark, a pin on the map, the QR code on the stop's plate, or the bus's route number. Each says how accurate it honestly is — a QR scan is ±5 m — and a GPS fix worse than 500 m is refused rather than trusted.

</td>
</tr>
<tr>
<td valign="top">

### 🌱 A green score you can check
Every bus gets a score from its fuel, emission standard and age, with the weights shown on screen. CO₂ saved is added up from your real trips. Old diesel buses are labelled as such — no greenwashing.

</td>
<td valign="top">

### 🧭 Explore and plan a day
Places worth visiting, each with the bus that gets you there, and a day planner that fits what you like around real bus timings.

</td>
</tr>
<tr>
<td valign="top">

### 🚍 A driver app with one big button
Start and end a trip with no typing, report crowding or delays in one tap, raise a breakdown or an SOS — and the driver's phone doubles as a backup tracker if the GPS box fails.

</td>
<td valign="top">

### 🏢 A depot dashboard, worst first
The live fleet sorted by what needs attention — cancelled, then signal lost, then delayed — plus punctuality per route, service alerts, route import from a spreadsheet and an audit log.

</td>
</tr>
</table>

---

## 📮 A bus through a mountain dead zone

```mermaid
sequenceDiagram
    autonumber
    participant Bus as 🚌 Bus tracker
    participant Server as 🖥️ Routify server
    actor You as 👤 Passenger

    Bus->>Server: Position, every few seconds
    Server-->>You: "On time · 7 min"
    Note over Bus: Enters the gorge —<br/>no mobile signal
    Note over Bus: Keeps recording<br/>every position
    Server-->>You: "Signal lost,<br/>last seen 4 min ago"
    Server-->>You: A widening estimate
    Server-->>You: Printed timetable
    Note over Bus: Back in signal
    Bus->>Server: Everything it<br/>recorded while dark
    Server-->>You: Live again
```

This is the whole point of the project, and you can watch it happen: in the demo, one bus drives into the Pandoh–Aut gorge, where there's genuinely no coverage.

---

## 🏗️ How it's built

```mermaid
flowchart TB
    subgraph R1[" "]
        direction LR
        Bus["🚌 Bus GPS<br/>or simulator"] -- "MQTT" --> Check["✅ Validate<br/>reject bad fixes"] --> Match["🛣️ Snap to the road<br/>PostGIS"]
    end
    subgraph R2[" "]
        direction LR
        Live[("⚡ Redis<br/>live positions")] --> ETA["⏱️ ETA engine<br/>+ confidence"] -- "Socket.IO" --> App["📱 Web app<br/>installable PWA"]
    end
    R1 --> R2

    classDef flow fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#064E3B
    classDef store fill:#EEF2FF,stroke:#6366F1,stroke-width:2px,color:#1E1B4B
    class Bus,Check,Match,ETA,App flow
    class Live store
    style R1 fill:none,stroke:none
    style R2 fill:none,stroke:none
```

| Layer | Tool | Why this one |
|---|---|---|
| 📥 GPS intake | **MQTT** | What real bus trackers speak, and it survives a flaky link far better than repeated web requests |
| 🗄️ Data | **PostgreSQL + PostGIS** | Routes and stops are relational, and "which stops are within 2 km" is a map query |
| ⚡ Live state | **Redis** | Where a bus is *right now* is read constantly and thrown away quickly |
| 📡 Updates | **Socket.IO** | Pushes changes instead of polling, to keep within a tight mobile-data budget |
| 📱 App | **React + Vite, as a PWA** | One link, works on any phone, installs to the home screen and caches for offline |
| ⚙️ Backend | **Node.js + Express + Prisma** | One process today, split cleanly enough to scale out later |

The rules both sides rely on — the green score, the CO₂ factors, the confidence thresholds — live in one shared package, so the server and the app use the **same function** and can never disagree.

---

## 🛡️ Built to be trusted

| | What it means | How it's done |
|---|---|---|
| 📶 | **No false confidence** | The confidence ladder is enforced on the server and pinned by tests, down to the exact minute each label changes. |
| 🧭 | **Bad GPS never reaches the map** | Readings with impossible speeds, swapped coordinates, broken clocks or jitter are rejected, and a dead zone's backlog of late readings is handled without scrambling the timeline. |
| 🔐 | **Sign-in fit for each person** | Passengers use phone + OTP, drivers their employee ID + OTP, depot staff a password. Refresh tokens rotate, and reuse of an old one revokes the whole session. |
| 🚦 | **OTPs can't be abused** | Stored hashed, single-use, limited to 5 guesses, rate-limited per account, and the reply never reveals whether an account exists. |
| 🌐 | **Timetables stay public** | Where buses are and when they arrive needs no login — it's public information. |
| 📋 | **Every privileged action is logged** | Driver and depot actions go to an append-only audit log. |

```mermaid
flowchart LR
    G["🧭 GPS<br/>validation"] --> C["📶 Confidence<br/>ladder"] --> E["⏱️ ETA<br/>engine"] --> S["🌱 Green score<br/>& CO₂"] --> A["🔐 Sign-in<br/>& tokens"]
    classDef ok fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    class G,C,E,S,A ok
```

**90+ automated tests** cover exactly these — and none of them need the database, the cache or the broker, which is why the rules live in plain shared functions. The green-score tests use the specification's own worked examples: a new electric bus scores exactly 100.

---

<a name="roadmap"></a>

## 🗺️ Roadmap

| Status | Milestone |
|:---:|---|
| ✅ | Live tracking with honest, widening arrival estimates and a timetable fallback |
| ✅ | Six ways to find your stop, each with its real accuracy |
| ✅ | Green score, CO₂ saved, places to explore and a day planner |
| ✅ | The driver app and the depot dashboard, with sign-in and an audit log |
| ✅ | A simulator using the same channel as real bus trackers |
| 🔜 | SMS and phone-line access — the replies are designed, the telecom gateway isn't connected |
| 🔜 | Surveyed stop positions from the transport department |
| 🔜 | A native driver app, since a browser can't track GPS with the screen off |

---

## 📁 What's in this repository

```
📦 Routify
├── 📂 api/               backend: GPS pipeline, ETA engine, sign-in, realtime
├── 📂 web/               the app passengers, drivers and depots use
├── 📂 packages/shared/   the rules both sides use, so they can never disagree
├── 📂 infra/             message-broker settings
├── 📄 docker-compose.yml database, cache and message broker
└── 📂 docs/              the full developer guide
```

---

## 👩‍💻 For developers

You need **Node.js** (LTS) and **Docker Desktop**.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run infra:up
```

Then set up the data, and run the backend, the bus simulator and the app — one per terminal. Every step is in the guide.

**The full developer guide is in [`docs/DEVELOPER-GUIDE.md`](docs/DEVELOPER-GUIDE.md):**

| Topic | Jump to |
|---|---|
| 🚀 Running it, and what to look at first | [Run it yourself](docs/DEVELOPER-GUIDE.md#-run-it-yourself) |
| 🏗️ The architecture, and why each piece | [How it's built](docs/DEVELOPER-GUIDE.md#-how-its-built) |
| 🔐 Sign-in, tokens and the demo accounts | [Signing in](docs/DEVELOPER-GUIDE.md#-signing-in) |
| 🚍 The driver app and depot dashboard | [Driver app & fleet dashboard](docs/DEVELOPER-GUIDE.md#-driver-app--fleet-dashboard) |
| 🧪 What the tests cover | [Tests](docs/DEVELOPER-GUIDE.md#-tests) |

---

<div align="center">

**Built by [Aryan Deshmukh](https://github.com/AryanDeshmukh-2711)** for Smart India Hackathon 2026

</div>
