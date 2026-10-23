import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import { Loading } from "./components/States";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AvlsPage from "./pages/AvlsPage";
import HistoryPage from "./pages/HistoryPage";
import SchedulingPage from "./pages/SchedulingPage";
import IncidentsPage from "./pages/IncidentsPage";
import NoticesPage from "./pages/NoticesPage";
import DriverPage from "./pages/DriverPage";
import AdminPage from "./pages/AdminPage";
import type { Role } from "./types";

function Protected({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/driver"
        element={
          <Protected roles={["driver", "conductor"]}>
            <div className="min-h-screen px-3 py-4">
              <DriverPage />
            </div>
          </Protected>
        }
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="avls"
          element={
            <Protected roles={["admin", "control_room_operator", "depot_manager"]}>
              <AvlsPage />
            </Protected>
          }
        />
        <Route
          path="avls/history"
          element={
            <Protected roles={["admin", "control_room_operator", "depot_manager"]}>
              <HistoryPage />
            </Protected>
          }
        />
        <Route
          path="scheduling"
          element={
            <Protected roles={["admin", "depot_manager"]}>
              <SchedulingPage />
            </Protected>
          }
        />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="incidents/:id" element={<IncidentsPage />} />
        <Route path="notices" element={<NoticesPage />} />
        <Route
          path="admin"
          element={
            <Protected roles={["admin"]}>
              <AdminPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
