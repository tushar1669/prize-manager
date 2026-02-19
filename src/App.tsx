import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DirtyProvider } from "@/contexts/DirtyContext";
import { NavigationGuard } from "@/components/NavigationGuard";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { isFeatureEnabled } from "@/utils/featureFlags";
import { getSafeReturnToPath } from "@/utils/upgradeUrl";

// Eager load critical public pages
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import RootRedirect from "./components/RootRedirect";
import NotFound from "./pages/NotFound";

// Lazy load public home (not needed on "/")
const PublicHome = lazy(() => import("./pages/PublicHome"));

// Lazy load protected/less-critical pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TournamentSetup = lazy(() => import("./pages/TournamentSetup"));
const PlayerImport = lazy(() => import("./pages/PlayerImport"));
const ConflictReview = lazy(() => import("./pages/ConflictReview"));
const Finalize = lazy(() => import("./pages/Finalize"));
const TournamentPayment = lazy(() => import("./pages/TournamentUpgrade"));
const FinalPrizeView = lazy(() => import("./pages/FinalPrizeView"));
const PublishSuccess = lazy(() => import("./pages/PublishSuccess"));
const PublicResults = lazy(() => import("./pages/PublicResults"));
const PublicTournamentDetails = lazy(() => import("./pages/PublicTournamentDetails"));
const Settings = lazy(() => import("./pages/Settings"));
const MasterDashboard = lazy(() => import("./pages/MasterDashboard"));
const Account = lazy(() => import("./pages/Account"));
const CategoryOrderReview = lazy(() => import("./pages/CategoryOrderReview"));
const PublicWinnersPage = lazy(() => import("./pages/PublicWinnersPage"));
const AdminTournaments = lazy(() => import("./pages/AdminTournaments"));
const AdminMartech = lazy(() => import("./pages/AdminMartech"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground">Loading…</div>
  </div>
);

const PublicTournamentDetailsRedirect = () => {
  const { slug } = useParams();
  return <Navigate to={`/p/${slug ?? ""}`} replace />;
};

const LegacyUpgradeRedirect = () => {
  const { id } = useParams();
  const location = useLocation();

  if (!id) {
    return <Navigate to="/dashboard" replace />;
  }

  const params = new URLSearchParams(location.search);
  const safeReturnTo = getSafeReturnToPath(id, params.get("return_to"), `/t/${id}/finalize`);
  const nextParams = new URLSearchParams({ return_to: safeReturnTo });

  if (params.get("coupon") === "1") {
    nextParams.set("coupon", "1");
  }

  return <Navigate to={`/t/${id}/payment?${nextParams.toString()}`} replace />;
};

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
                <Route path="/" element={<RootRedirect />} />
                <Route path="/public" element={<PublicHome />} />
                <Route path="/p/:slug" element={<PublicTournamentDetails />} />
                <Route path="/p/:slug/results" element={<PublicResults />} />
                <Route path="/p/:slug/details" element={<PublicTournamentDetailsRedirect />} />
                <Route path="/t/:id/public" element={<PublicWinnersPage />} />

                {/* Auth routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                
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
                <Route path="/t/:id/payment" element={<ProtectedRoute><TournamentPayment /></ProtectedRoute>} />
                <Route path="/t/:id/upgrade" element={<ProtectedRoute><LegacyUpgradeRedirect /></ProtectedRoute>} />
                <Route path="/t/:id/final/:view" element={<ProtectedRoute><FinalPrizeView /></ProtectedRoute>} />
                <Route path="/t/:id/publish" element={<ProtectedRoute><PublishSuccess /></ProtectedRoute>} />
                <Route path="/t/:id/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/master-dashboard" element={<Navigate to="/admin/users" replace />} />
                <Route path="/admin" element={<ProtectedRoute requireMaster><AdminLayout /></ProtectedRoute>}>
                  <Route index element={<AdminHome />} />
                  <Route path="users" element={<MasterDashboard embeddedInAdmin />} />
                  <Route path="martech" element={<AdminMartech embeddedInAdmin />} />
                  <Route path="tournaments" element={<AdminTournaments embeddedInAdmin />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                </Route>

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
