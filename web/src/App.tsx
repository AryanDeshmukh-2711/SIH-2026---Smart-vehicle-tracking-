import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AppStateProvider } from '@/store/AppState';
import { AuthProvider, RequireRole } from '@/store/AuthContext';

import { HomeScreen } from '@/screens/Home';
import { SearchScreen } from '@/screens/Search';
import { JourneyPlannerScreen } from '@/screens/JourneyPlanner';
import { LiveMapScreen } from '@/screens/LiveMap';
import { BusInfoScreen } from '@/screens/BusInfo';
import { BusReviewsScreen } from '@/screens/BusReviews';
import { StopDetailScreen } from '@/screens/StopDetail';
import { SmartLocationScreen } from '@/screens/SmartLocation';
import { QrScannerScreen } from '@/screens/QrScanner';
import { ExploreScreen } from '@/screens/Explore';
import { PlaceDetailScreen } from '@/screens/PlaceDetail';
import { SmartItineraryScreen } from '@/screens/SmartItinerary';
import { MyTripsScreen } from '@/screens/MyTrips';
import { SustainabilityScreen } from '@/screens/Sustainability';
import { NotificationsScreen } from '@/screens/Notifications';
import { ProfileScreen } from '@/screens/Profile';
import { OfflineScreen } from '@/screens/Offline';
import { UiStatesScreen } from '@/screens/UiStates';
import { OperatorLoginScreen } from '@/screens/operator/Login';
import { DriverHomeScreen } from '@/screens/operator/DriverHome';
import { AdminDashboardScreen } from '@/screens/operator/AdminDashboard';

export function App() {
  return (
    <AppStateProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/plan" element={<JourneyPlannerScreen />} />
            <Route path="/map" element={<LiveMapScreen />} />

            <Route path="/bus/:busId" element={<BusInfoScreen />} />
            <Route path="/bus/:busId/reviews" element={<BusReviewsScreen />} />
            <Route path="/stop/:stopId" element={<StopDetailScreen />} />
            <Route path="/locate" element={<SmartLocationScreen />} />
            <Route path="/scan" element={<QrScannerScreen />} />

            <Route path="/explore" element={<ExploreScreen />} />
            <Route path="/place/:placeId" element={<PlaceDetailScreen />} />
            <Route path="/itinerary" element={<SmartItineraryScreen />} />

            <Route path="/trips" element={<MyTripsScreen />} />
            <Route path="/impact" element={<SustainabilityScreen />} />
            <Route path="/alerts" element={<NotificationsScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="/offline" element={<OfflineScreen />} />

            <Route path="/states" element={<UiStatesScreen />} />

            {/* Operator surfaces. Gated here for convenience only — the API
                enforces the same roles, which is the boundary that counts. */}
            <Route path="/operator/login" element={<OperatorLoginScreen />} />
            <Route
              path="/driver"
              element={
                <RequireRole roles={['driver', 'depot_manager', 'admin', 'transport_authority']}>
                  <DriverHomeScreen />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole roles={['depot_manager', 'admin', 'transport_authority']}>
                  <AdminDashboardScreen />
                </RequireRole>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AppStateProvider>
  );
}
