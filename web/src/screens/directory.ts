/**
 * Every screen in the product, grouped the way a reviewer would look for them.
 * Drives the desktop screen index in `AppShell`.
 */
export const SCREEN_DIRECTORY = [
  {
    group: 'Core',
    items: [
      { to: '/', label: 'Home' },
      { to: '/search', label: 'Search' },
      { to: '/plan', label: 'Journey planner' },
      { to: '/map', label: 'Live bus map' },
    ],
  },
  {
    group: 'Transit detail',
    items: [
      { to: '/bus/B-4021', label: 'Bus information' },
      { to: '/bus/B-4021/reviews', label: 'Bus reviews' },
      { to: '/stop/HP-SML-001', label: 'Bus stop details' },
      { to: '/locate', label: 'Smart location' },
      { to: '/scan', label: 'QR stop scanner' },
    ],
  },
  {
    group: 'Tourism',
    items: [
      { to: '/explore', label: 'Explore Himachal' },
      { to: '/place/PL-HADIMBA', label: 'Destination detail' },
      { to: '/itinerary', label: 'Smart itinerary' },
    ],
  },
  {
    group: 'Personal',
    items: [
      { to: '/trips', label: 'My trips' },
      { to: '/impact', label: 'Sustainability' },
      { to: '/alerts', label: 'Notifications' },
      { to: '/profile', label: 'Profile' },
      { to: '/offline', label: 'Offline mode' },
    ],
  },
  {
    group: 'Reference',
    items: [{ to: '/states', label: 'UI states' }],
  },
] as const;
