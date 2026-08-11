import type { ServiceAlert } from '../types';

/** Minutes ago → ISO timestamp, so alert ages stay believable on any run. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * Service alerts map one-to-one onto GTFS-Realtime `ServiceAlert` entities.
 * `source` is carried through to the UI because a landslide notice from the
 * state disaster authority carries different weight than a crowd-sourced report.
 */
export const ALERTS: ServiceAlert[] = [
  {
    id: 'AL-001',
    kind: 'delay',
    severity: 'warning',
    title: 'Route 42B delayed near Kufri',
    body: 'Route 42B is running approximately 15 minutes behind schedule because of single-lane traffic near Kufri. Arrival times in the app already account for the delay.',
    affectedRouteIds: ['R-42B'],
    affectedStopIds: ['HP-SML-001', 'HP-BLS-001'],
    issuedAt: ago(12),
    source: 'HRTC Control Room, Shimla',
    read: false,
  },
  {
    id: 'AL-002',
    kind: 'arrival',
    severity: 'info',
    title: 'HP-01-9012 arriving at Victory Tunnel',
    body: 'Your tracked bus HP-01-9012 on Route 07L is about 5 minutes from Victory Tunnel.',
    affectedRouteIds: ['R-07L'],
    affectedStopIds: ['HP-SML-002'],
    issuedAt: ago(3),
    source: 'HimGati arrival alert',
    read: false,
  },
  {
    id: 'AL-003',
    kind: 'road-closure',
    severity: 'severe',
    title: 'Landslide on NH-5 near Narkanda',
    body: 'A landslide has blocked one carriageway between Theog and Narkanda. Route 07L is terminating at Theog until clearance work finishes. Onward passengers are being transferred by shuttle. Next update expected by 18:00.',
    affectedRouteIds: ['R-07L'],
    affectedStopIds: ['HP-THG-001', 'HP-NRK-001'],
    issuedAt: ago(48),
    source: 'HP State Disaster Management Authority',
    read: false,
  },
  {
    id: 'AL-004',
    kind: 'weather',
    severity: 'warning',
    title: 'Snow warning above 2,500 m tonight',
    body: 'The met department expects moderate snow above 2,500 m between 22:00 and 06:00. Services to Kufri, Narkanda and Solang may run late or be curtailed. Carry chains if driving yourself.',
    affectedRouteIds: ['R-07L', 'R-31M'],
    affectedStopIds: ['HP-KFR-001', 'HP-NRK-001', 'HP-SLG-001'],
    issuedAt: ago(95),
    source: 'IMD Shimla',
    read: true,
  },
  {
    id: 'AL-005',
    kind: 'cancellation',
    severity: 'severe',
    title: '16:30 Route 22C to Chail cancelled',
    body: 'The 16:30 departure from Shimla ISBT to Chail is cancelled due to a vehicle breakdown at the depot. The next service is at 18:15. Tickets already issued will be honoured on the 18:15.',
    affectedRouteIds: ['R-22C'],
    affectedStopIds: ['HP-SML-001', 'HP-KDG-001', 'HP-CHL-001'],
    issuedAt: ago(140),
    source: 'Shimla Depot',
    read: true,
  },
  {
    id: 'AL-006',
    kind: 'stop-change',
    severity: 'info',
    title: 'Boarding bay change at Shimla ISBT',
    body: 'Route 55D Volvo departures have moved from Bay 2 to Bay 5 for the next two weeks while Bay 2 is resurfaced.',
    affectedRouteIds: ['R-55D'],
    affectedStopIds: ['HP-SML-001'],
    issuedAt: ago(1450),
    source: 'Shimla ISBT Administration',
    read: true,
  },
  {
    id: 'AL-007',
    kind: 'route-change',
    severity: 'info',
    title: 'Route 12S diverted via Cart Road',
    body: 'City circular 12S is running via Cart Road instead of Lower Bazaar between 09:00 and 17:00 while drainage work continues. The Mall Road (Lift) stop is being served as normal.',
    affectedRouteIds: ['R-12S'],
    affectedStopIds: ['HP-SML-002', 'HP-SML-003'],
    issuedAt: ago(2600),
    source: 'Shimla Municipal Corporation',
    read: true,
  },
];
