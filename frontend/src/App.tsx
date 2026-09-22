import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { PageSpinner } from "./components/ui/Spinner";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/login" element={<LoginGate />} />
      <Route path="/dashboard" element={<ProtectedDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeGate() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function LoginGate() {
  const { user, loading, backendDown } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LoginPage backendDown={backendDown} />;
}

function ProtectedDashboard() {
  const { user, loading, unauthenticated, backendDown } = useAuth();
  if (loading) return <PageSpinner />;
  if (unauthenticated || !user) {
    if (backendDown) return <LoginPage backendDown />;
    return <Navigate to="/login" replace />;
  }
  return <DashboardPage />;
}
