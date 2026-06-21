import { Navigate, Route, Routes } from "react-router"

import { AdminIndexRedirect, AdminLayout } from "@/components/AdminLayout"
import { AdminRoute } from "@/components/AdminRoute"
import { AppLayout } from "@/components/AppLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { AdminSettingsPage } from "@/pages/AdminSettingsPage"
import { AuditLogPage } from "@/pages/AuditLogPage"
import { CalendarPage } from "@/pages/CalendarPage"
import { FormPage } from "@/pages/forms/FormPage"
import { FormsListPage } from "@/pages/forms/FormsListPage"
import { ContactsManagePage } from "@/pages/ContactsManagePage"
import { DashboardPage } from "@/pages/Dashboard"
import { LoginPage } from "@/pages/Login"
import { ProjectDetailPage } from "@/pages/ProjectDetailPage"
import { ProjectsListPage } from "@/pages/ProjectsListPage"
import { ProjectsViewPage } from "@/pages/ProjectsViewPage"
import { RosterIndexPage } from "@/pages/RosterIndexPage"
import { RosterPage } from "@/pages/RosterPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { TaxonomyManagePage } from "@/pages/TaxonomyManagePage"
import { TemplateDetailPage } from "@/pages/TemplateDetailPage"
import { TemplatesListPage } from "@/pages/TemplatesListPage"
import { UsersManagePage } from "@/pages/UsersManagePage"
import { ViewPage } from "@/pages/ViewPage"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsListPage />} />
        <Route path="/projects/view" element={<ProjectsViewPage />} />
        <Route path="/projects/:pid" element={<ProjectDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/forms" element={<FormsListPage />} />
        <Route path="/forms/:fid" element={<FormPage />} />
        <Route path="/views/:vid" element={<ViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute requireRole="department_manager">
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminIndexRedirect />} />
          <Route
            path="departments"
            element={
              <AdminRoute>
                <TaxonomyManagePage
                  path="departments"
                  title="Departments"
                  description="Departments are the top of the taxonomy."
                  singular="Department"
                />
              </AdminRoute>
            }
          />
          <Route
            path="clients"
            element={
              <AdminRoute>
                <TaxonomyManagePage
                  path="clients"
                  title="Clients"
                  description="Client records used by projects and templates."
                  singular="Client"
                />
              </AdminRoute>
            }
          />
          <Route
            path="disciplines"
            element={
              <AdminRoute>
                <TaxonomyManagePage
                  path="disciplines"
                  title="Disciplines"
                  description="Engineering disciplines used by templates."
                  singular="Discipline"
                />
              </AdminRoute>
            }
          />
          <Route
            path="templates"
            element={
              <AdminRoute requireRole="department_manager">
                <TemplatesListPage />
              </AdminRoute>
            }
          />
          <Route
            path="templates/:tid"
            element={
              <AdminRoute requireRole="department_manager">
                <TemplateDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="contacts"
            element={
              <AdminRoute>
                <ContactsManagePage />
              </AdminRoute>
            }
          />
          <Route
            path="users"
            element={
              <AdminRoute>
                <UsersManagePage />
              </AdminRoute>
            }
          />
          <Route
            path="roster"
            element={
              <AdminRoute requireRole="department_manager">
                <RosterIndexPage />
              </AdminRoute>
            }
          />
          <Route
            path="departments/:deptId/roster"
            element={
              <AdminRoute requireRole="department_manager">
                <RosterPage />
              </AdminRoute>
            }
          />
          <Route
            path="audit-log"
            element={
              <AdminRoute>
                <AuditLogPage />
              </AdminRoute>
            }
          />
          <Route
            path="settings"
            element={
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
