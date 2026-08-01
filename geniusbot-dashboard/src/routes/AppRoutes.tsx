import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import { ProtectedRoute } from '../auth/components/ProtectedRoute'
import { ReportsPermissionGuard } from '../auth/components/ReportsPermissionGuard'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { LoginPage } from '../pages/LoginPage'
import { DashboardHomePage } from '../pages/dashboard/DashboardHomePage'
import { AppointmentsPage } from '../pages/dashboard/AppointmentsPage'
import { PatientsPage } from '../pages/dashboard/PatientsPage'
import { ConversationPage } from '../pages/dashboard/ConversationPage'
import { MasterDataPage } from '../pages/master-data/MasterDataPage'
import { StaffPage } from '../pages/dashboard/StaffPage'
import { ReportsPage } from '../pages/dashboard/ReportsPage'
import { SettingsPage } from '../pages/dashboard/SettingsPage'
import { DoctorWorkingHoursPage } from '../pages/master-data/DoctorWorkingHoursPage'
import { ServiceAssignmentsPage } from '../pages/master-data/ServiceAssignmentsPage'
import { PricesPage } from '../pages/prices/PricesPage'
import { PricesPermissionGuard } from '../auth/components/PricesPermissionGuard'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHomePage />} />
        <Route
          path="appointments"
          element={<AppointmentsPage />}
        />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:patientId/conversation" element={<ConversationPage />} />
        <Route path="master-data/doctor-working-hours" element={<DoctorWorkingHoursPage />} />
        <Route path="master-data/service-assignments" element={<ServiceAssignmentsPage />} />
        <Route path="prices" element={<PricesPermissionGuard><PricesPage /></PricesPermissionGuard>} />
        <Route path="master-data/:resource" element={<MasterDataPage />} />
        <Route path="doctors" element={<Navigate to="../master-data/doctors" replace />} />
        <Route path="services" element={<Navigate to="../master-data/services" replace />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="reports" element={<ReportsPermissionGuard><ReportsPage /></ReportsPermissionGuard>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />
    </Routes>
  )
}
