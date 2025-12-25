import { useEffect, lazy, Suspense } from "react";
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

// Eager load critical public pages
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import PublicHome from "./pages/PublicHome";
import NotFound from "./pages/NotFound";

// Lazy load protected/less-critical pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TournamentSetup = lazy(() => import("./pages/TournamentSetup"));
const PlayerImport = lazy(() => import("./pages/PlayerImport"));
const ConflictReview = lazy(() => import("./pages/ConflictReview"));
const Finalize = lazy(() => import("./pages/Finalize"));
const FinalPrizeView = lazy(() => import("./pages/FinalPrizeView"));
const PublishSuccess = lazy(() => import("./pages/PublishSuccess"));
const PublicResults = lazy(() => import("./pages/PublicResults"));
const PublicTournamentDetails = lazy(() => import("./pages/PublicTournamentDetails"));
const Bootstrap = lazy(() => import("./pages/Bootstrap"));
const Settings = lazy(() => import("./pages/Settings"));
const MasterDashboard = lazy(() => import("./pages/MasterDashboard"));
const SpecialLanding = lazy(() => import("./pages/SpecialLanding"));
const Account = lazy(() => import("./pages/Account"));
const CategoryOrderReview = lazy(() => import("./pages/CategoryOrderReview"));
const PublicWinnersPage = lazy(() => import("./pages/PublicWinnersPage"));
const AdminTournaments = lazy(() => import("./pages/AdminTournaments"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground">Loading…</div>
  </div>
);

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
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes (no auth required) */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/p/:slug" element={<PublicTournamentDetails />} />
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
            </Suspense>
          </BrowserRouter>
        </DirtyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
