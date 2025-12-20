import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DirtyProvider } from "@/contexts/DirtyContext";
import { NavigationGuard } from "@/components/NavigationGuard";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { isFeatureEnabled } from "@/utils/featureFlags";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import TournamentSetup from "./pages/TournamentSetup";
import PlayerImport from "./pages/PlayerImport";
import ConflictReview from "./pages/ConflictReview";
import Finalize from "./pages/Finalize";
import FinalPrizeView from "./pages/FinalPrizeView";
import PublishSuccess from "./pages/PublishSuccess";
import PublicTournament from "./pages/PublicTournament";
import PublicHome from "./pages/PublicHome";
import PublicResults from "./pages/PublicResults";
import PublicTournamentDetails from "./pages/PublicTournamentDetails";
import Bootstrap from "./pages/Bootstrap";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import MasterDashboard from "./pages/MasterDashboard";
import SpecialLanding from "./pages/SpecialLanding";
import Account from "./pages/Account";
import CategoryOrderReview from "./pages/CategoryOrderReview";
import PublicWinnersPage from "./pages/PublicWinnersPage";
import AdminTournaments from "./pages/AdminTournaments";
import PendingApproval from "./pages/PendingApproval";
const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    console.log(
      `[flags] HEADER_DETECTION=${isFeatureEnabled('HEADER_DETECTION')} RATING_PRIORITY=${isFeatureEnabled('RATING_PRIORITY')} UNRATED_INFERENCE=${isFeatureEnabled('UNRATED_INFERENCE')}`
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DirtyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <NavigationGuard />
            <GlobalShortcuts />
            <Routes>
              {/* Public routes (no auth required) */}
              <Route path="/" element={<PublicHome />} />
              <Route path="/p/:slug" element={<PublicTournament />} />
              <Route path="/p/:slug/results" element={<PublicResults />} />
              <Route path="/p/:slug/details" element={<PublicTournamentDetails />} />
              <Route path="/t/:id/public" element={<PublicWinnersPage />} />

              {/* Auth routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/bootstrap" element={<ProtectedRoute><Bootstrap /></ProtectedRoute>} />
              
              {/* Pending approval route - protected but allowed for unverified */}
              <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />

              {/* Protected routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="/t/:id/setup" element={<ProtectedRoute><TournamentSetup /></ProtectedRoute>} />
              <Route path="/t/:id/order-review" element={<ProtectedRoute><CategoryOrderReview /></ProtectedRoute>} />
              <Route path="/t/:id/import" element={<ProtectedRoute><PlayerImport /></ProtectedRoute>} />
              <Route path="/t/:id/review" element={<ProtectedRoute><ConflictReview /></ProtectedRoute>} />
              <Route path="/t/:id/finalize" element={<ProtectedRoute><Finalize /></ProtectedRoute>} />
              <Route path="/t/:id/final/:view" element={<ProtectedRoute><FinalPrizeView /></ProtectedRoute>} />
              <Route path="/t/:id/publish" element={<ProtectedRoute><PublishSuccess /></ProtectedRoute>} />
              <Route path="/t/:id/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/master-dashboard" element={<ProtectedRoute requireMaster><MasterDashboard /></ProtectedRoute>} />
              {/* Legacy route - redirect to new master-dashboard for backwards compatibility */}
              <Route path="/master/:secret" element={<Navigate to="/master-dashboard" replace />} />
              <Route path="/root/:secret" element={<ProtectedRoute><SpecialLanding /></ProtectedRoute>} />
              <Route path="/admin/tournaments" element={<ProtectedRoute requireMaster><AdminTournaments /></ProtectedRoute>} />

              {/* Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </DirtyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
