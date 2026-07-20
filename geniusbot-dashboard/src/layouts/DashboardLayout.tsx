import { Outlet } from 'react-router-dom'

import { AppHeader } from '../components/layout/AppHeader'
import { AppSidebar } from '../components/layout/AppSidebar'

export function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <AppSidebar />
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <AppHeader />
        </header>

        <main className="dashboard-content">
          <div className="dashboard-content__container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}