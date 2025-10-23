import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TournamentSetup from "./pages/TournamentSetup";
import PlayerImport from "./pages/PlayerImport";
import ConflictReview from "./pages/ConflictReview";
import Finalize from "./pages/Finalize";
import PublishSuccess from "./pages/PublishSuccess";
import PublicTournament from "./pages/PublicTournament";
import PublicHome from "./pages/PublicHome";
import PublicResults from "./pages/PublicResults";
import Bootstrap from "./pages/Bootstrap";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import MasterDashboard from "./pages/MasterDashboard";
import SpecialLanding from "./pages/SpecialLanding";
import Account from "./pages/Account";
import CategoryOrderReview from "./pages/CategoryOrderReview";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes (no auth required) */}
          <Route path="/" element={<PublicHome />} />
          <Route path="/p/:slug" element={<PublicTournament />} />
          <Route path="/p/:slug/results" element={<PublicResults />} />
          
          {/* Auth routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/bootstrap" element={<ProtectedRoute><Bootstrap /></ProtectedRoute>} />
          
          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="/t/:id/setup" element={<ProtectedRoute><TournamentSetup /></ProtectedRoute>} />
          <Route path="/t/:id/order-review" element={<ProtectedRoute><CategoryOrderReview /></ProtectedRoute>} />
          <Route path="/t/:id/import" element={<ProtectedRoute><PlayerImport /></ProtectedRoute>} />
          <Route path="/t/:id/review" element={<ProtectedRoute><ConflictReview /></ProtectedRoute>} />
          <Route path="/t/:id/finalize" element={<ProtectedRoute><Finalize /></ProtectedRoute>} />
          <Route path="/t/:id/publish" element={<ProtectedRoute><PublishSuccess /></ProtectedRoute>} />
          <Route path="/t/:id/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/master/:secret" element={<ProtectedRoute><MasterDashboard /></ProtectedRoute>} />
          <Route path="/root/:secret" element={<ProtectedRoute><SpecialLanding /></ProtectedRoute>} />
          
          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
