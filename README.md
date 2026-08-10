# 🚌 HimGati

### Know where your bus is. Know when it'll reach you. Know how clean it is.

HimGati is a smart bus-tracking app built for Himachal Pradesh — a place where GPS gets confused by the mountains and mobile signal disappears for miles at a time. So instead of just showing a dot on a map and hoping for the best, HimGati tells you the *truth*: exactly how sure it is about where your bus is, and gives you five other ways to find your stop when GPS gives up.

Built for **SIH 2026**.

---

## 🚀 Try it yourself (takes 2 minutes)

You don't need to know how to code. Just follow these steps:

1. **Install [Node.js](https://nodejs.org)** if you don't already have it (pick the "LTS" version, click next through the installer).
2. **Open a terminal** in this folder and run:
   ```bash
   npm install
   ```
   *(This downloads everything the app needs — takes about a minute.)*
3. **Start the app:**
   ```bash
   npm run dev
   ```
4. **Open your browser** and go to the address it shows you — usually **http://localhost:5173**

That's it — the app is now running on your computer, exactly as it would on a phone.

### 👀 Where to start looking

Once it's open, try this in order:

| Do this | You'll see |
|---|---|
| Look at the **Home** screen | Buses arriving near you, right now, with live countdown timers |
| Tap **"Track bus"** or the map icon | A live map with buses actually moving along their routes |
| Tap any bus card | Full details — is it electric, how clean is it, what's it like inside |
| Tap **"GPS not working?"** on Home | Six different ways to tell the app where you are, without needing GPS |
| Go to **Explore** | Tourist spots around Himachal, each one telling you exactly which bus gets you there |
| Go to **"Build a day plan"** | Tell it what you like doing and how much time you have — it plans your whole day using buses |

💡 **Tip:** Watch bus **HP-01-3312** on the map for about a minute — it drives into a mountain valley with no signal, and you'll see the app honestly say *"Signal lost"* instead of pretending it still knows where the bus is. That's the whole point of the app.

---

## 🧩 What problem does this actually solve?

If you've ever waited at a bus stop in the hills, you know the feeling: *has the bus already left? Is it 5 minutes away or 50? Did a landslide cancel it?*

Every existing transit app struggles here for two reasons — **the mountains block GPS**, and **mobile network just disappears** for long stretches. HimGati is designed around that reality instead of ignoring it.

**1. GPS is just one option, not the only one.**
You can find your bus stop by GPS, by searching the stop name, by typing a nearby landmark ("near the temple"), by dropping a pin on the map, by scanning a QR code at the stop, or just by typing the bus's route number — no location needed at all.

**2. The app never fakes confidence it doesn't have.**
If the bus reported its position 10 seconds ago, you get a precise "7 min". If it's been 6 minutes of silence, you get an honest range like "8–14 min" instead of a made-up exact number. If the bus goes quiet for too long, the app plainly says **"Signal lost"** and tells you the last place it was seen — rather than freezing the bus icon and letting you believe it's still live (which is what most apps do).

---

## ✨ Everything in the app

**Get around**
Home · Search (understands plain sentences like *"bus from Shimla to Manali tomorrow morning"*) · Journey planner · Live bus map

**About your bus**
Bus details (fuel type, cleanliness score, seating) · Passenger reviews · Bus stop details · Six ways to find your location · QR code scanner

**Explore Himachal**
Browse attractions, cafés & viewpoints · Full destination pages that tell you exactly how to get there by bus · An itinerary builder that plans your whole day around bus timings

**Your account**
Trip history · Your environmental impact (CO₂ saved by taking the bus) · Notifications for delays & disruptions · Profile & preferences · Offline mode for when there's no signal at all

---

## 🌱 The numbers are real, not just for show

- **Green Score** — every bus gets a score out of 100 based on its fuel type, emission standard, and age. The app shows you exactly how that score was calculated, not just the final number.
- **CO₂ saved** — calculated by comparing the bus you took against driving the same distance alone in a car. Every trip in your history adds up into your personal impact dashboard.
- **No greenwashing** — an older, more polluting bus is clearly marked as such, in red. The app doesn't pretend every bus is eco-friendly just because it's a bus.

---

## 🎬 Why the buses actually move on the map

Real buses obviously aren't driving around for this demo — so a small simulator plays the part of the live tracking system, moving buses along their real routes in real time (sped up, so a 7-hour journey plays out in minutes). A couple of buses are scripted to always show interesting things: one loses signal in a mountain pass and comes back, one is running late, one is cancelled. That way, every time you open the app, there's always something worth watching.

---

## 🛠️ For developers

<details>
<summary>Click to expand: tech stack, architecture, and what's not built</summary>

### Stack
React 19 · TypeScript (strict) · Vite 6 · Tailwind v4 · React Router 7 · Leaflet + OpenStreetMap · Framer Motion · vite-plugin-pwa

### How it's structured
```
src/
  types/         Domain model — matches the shape of GTFS + GTFS-Realtime
  lib/           Green Score & CO₂ math · ETA confidence rules · geo helpers
  data/          Stops, routes, fleet, places, trips, reviews, alerts
  services/
    client.ts    Every network call goes through here — swap mock data for a
                 real API by changing one config line
    adapters/    Ready-made mappings from GTFS/GTFS-RT feeds to the app's data
    simulation/  The live-bus simulator described above
  components/    Design system, transit widgets, map, layout
  screens/       Every screen in the app
```

Every "live" data call is written against the same interface a real backend would use (GTFS static + GTFS-Realtime + AIS-140 vehicle trackers), so plugging in a real transport department feed later is a matter of swapping the data source, not rewriting screens.

### Data used
8 real HRTC bus routes across Shimla, Mandi, Kullu and Kangra districts, 26 real stops, and 16 buses with realistic fuel/age/emission mixes (including older, more polluting ones — deliberately, so the "honest emissions" feature has something real to show).

### What's out of scope for this build
- **Driver app** (trip start/end, delay reporting, SOS)
- **Admin/depot dashboard** (fleet management, route editing)

The SMS and phone-line (IVR) access methods are shown in the app — you can see exactly what a text message reply would look like — but the actual telecom gateway is backend infrastructure outside this build.

</details>
