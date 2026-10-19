import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthProvider';
import { supabaseConfigured } from './lib/supabase';
import { Loading } from './components/ui';
import SetupNotice from './pages/SetupNotice';
import Login from './pages/auth/Login';
import ResetPassword from './pages/auth/ResetPassword';
import ChangePassword from './pages/auth/ChangePassword';
import MyEvents from './pages/events/MyEvents';
import EventEditor from './pages/events/EventEditor';
import EventLayout from './layout/EventLayout';
import Summary from './pages/event/Summary';
import Program from './pages/event/Program';
import CalendarPage from './pages/event/Calendar';
import People from './pages/event/People';
import PersonDetail from './pages/event/PersonDetail';
import Payments from './pages/event/Payments';
import Packages from './pages/event/Packages';
import AttendancePage from './pages/event/Attendance';
import Projector from './pages/event/Projector';
import Certificates from './pages/event/Certificates';
import ExportPage from './pages/event/Export';
import Admins from './pages/event/Admins';
import Settings from './pages/event/Settings';
import Register from './pages/public/Register';
import PublicItinerary from './pages/public/PublicItinerary';
import CheckIn from './pages/public/CheckIn';
import CertificateView from './pages/public/CertificateView';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />;
  if (profile?.must_change_password && loc.pathname !== '/cambiar-contrasena')
    return <Navigate to="/cambiar-contrasena" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  if (!supabaseConfigured) return <SetupNotice />;
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/eventos" replace />} />
      <Route path="/entrar" element={<Login />} />
      <Route path="/restablecer" element={<ResetPassword />} />
      <Route path="/r/:slug" element={<Register />} />
      <Route path="/r/:slug/itinerario" element={<PublicItinerary />} />
      <Route path="/a/:code" element={<CheckIn />} />
      <Route path="/c/:folio" element={<CertificateView />} />

      <Route path="/cambiar-contrasena" element={<RequireAuth><ChangePassword /></RequireAuth>} />
      <Route path="/eventos" element={<RequireAuth><MyEvents /></RequireAuth>} />
      <Route path="/eventos/nuevo" element={<RequireAuth><EventEditor /></RequireAuth>} />
      <Route path="/evento/:eventId/asistencia/:activityId/proyectar" element={<RequireAuth><Projector /></RequireAuth>} />
      <Route path="/evento/:eventId" element={<RequireAuth><EventLayout /></RequireAuth>}>
        <Route index element={<Navigate to="resumen" replace />} />
        <Route path="resumen" element={<Summary />} />
        <Route path="programa" element={<Program />} />
        <Route path="asistencia" element={<AttendancePage />} />
        <Route path="asistencia/:activityId" element={<AttendancePage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="participantes" element={<People />} />
        <Route path="participantes/nuevo" element={<PersonDetail />} />
        <Route path="participantes/:personId" element={<PersonDetail />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="paquetes" element={<Packages />} />
        <Route path="constancias" element={<Certificates />} />
        <Route path="exportar" element={<ExportPage />} />
        <Route path="administradores" element={<Admins />} />
        <Route path="ajustes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/eventos" replace />} />
    </Routes>
  );
}
