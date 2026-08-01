import { NavLink } from 'react-router-dom'
import { canViewOperationalReports } from '../../auth/reportPermissions'
import { useAuth } from '../../auth/hooks/useAuth'
import { canViewPrices } from '../../auth/pricePermissions'

type SidebarNavigationItem = {
  label: string
  to: string
  end?: boolean
}

type SidebarNavigationGroup = {
  label: string
  items: SidebarNavigationItem[]
}

const navigationGroups: SidebarNavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        end: true,
      },
      {
        label: 'Appointments',
        to: '/dashboard/appointments',
      },
      {
        label: 'Patients',
        to: '/dashboard/patients',
      },
    ],
  },
  {
    label: 'Clinic Management',
    items: [
      { label: 'Clinics', to: '/dashboard/master-data/clinics' },
      { label: 'Branches', to: '/dashboard/master-data/branches' },
      {
        label: 'Doctors',
        to: '/dashboard/master-data/doctors',
      },
      { label: 'Specialties', to: '/dashboard/master-data/specialties' },
      { label: 'Rooms', to: '/dashboard/master-data/rooms' },
      {
        label: 'Services',
        to: '/dashboard/master-data/services',
      },
      {
        label: 'Staff',
        to: '/dashboard/staff',
      },
    ],
  },
  {
    label: 'Schedules',
    items: [
      { label: 'Branch Working Hours', to: '/dashboard/master-data/branch-working-hours' },
      { label: 'Clinic Holidays', to: '/dashboard/master-data/clinic-holidays' },
      { label: 'Doctor Working Hours', to: '/dashboard/master-data/doctor-working-hours' },
      { label: 'Doctor Time Off', to: '/dashboard/master-data/doctor-time-off' },
      { label: 'Room Time Off', to: '/dashboard/master-data/room-time-off' },
    ],
  },
  {
    label: 'Assignments',
    items: [
      { label: 'Doctor Specialties', to: '/dashboard/master-data/doctor-specialties' },
      { label: 'Service Assignments', to: '/dashboard/master-data/service-assignments' },
      { label: 'Service Pre Questions', to: '/dashboard/master-data/service-pre-questions' },
    ],
  },
  {
    label: 'Billing Setup',
    items: [
      { label: 'Payment Methods', to: '/dashboard/master-data/payment-methods' },
      { label: 'Insurance Companies', to: '/dashboard/master-data/insurance-companies' },
      { label: 'Insurance Classes', to: '/dashboard/master-data/insurance-classes' },
      { label: 'Prices', to: '/dashboard/prices' },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        label: 'Reports',
        to: '/dashboard/reports',
      },
    ],
  },
]

export function AppSidebar() {
  const { user } = useAuth()
  return (
    <div className="app-sidebar">
      <div className="app-sidebar__brand">
        <div
          className="app-sidebar__brand-mark"
          aria-hidden="true"
        >
          G
        </div>

        <div className="app-sidebar__brand-content">
          <span className="app-sidebar__brand-name">
            GeniusBot
          </span>

          <span className="app-sidebar__brand-description">
            Clinic Dashboard
          </span>
        </div>
      </div>

      <nav
        className="app-sidebar__navigation"
        aria-label="Dashboard navigation"
      >
        {navigationGroups.map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (item.to !== '/dashboard/reports' || canViewOperationalReports(user?.permissions)) &&
              (item.to !== '/dashboard/prices' || canViewPrices(user?.permissions)),
          ),
        })).filter((group) => group.items.length > 0).map((group) => (
          <div
            className="app-sidebar__navigation-group"
            key={group.label}
          >
            <p className="app-sidebar__navigation-label">
              {group.label}
            </p>

            <ul className="app-sidebar__navigation-list">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive }) =>
                      [
                        'app-sidebar__navigation-link',
                        isActive
                          ? 'app-sidebar__navigation-link--active'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    }
                    end={item.end}
                    to={item.to}
                  >
                    <span
                      className="app-sidebar__navigation-indicator"
                      aria-hidden="true"
                    />

                    <span>
                      {item.label}
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <NavLink
          className={({ isActive }) =>
            [
              'app-sidebar__navigation-link',
              isActive
                ? 'app-sidebar__navigation-link--active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
          to="/dashboard/settings"
        >
          <span
            className="app-sidebar__navigation-indicator"
            aria-hidden="true"
          />

          <span>
            Settings
          </span>
        </NavLink>

        <p className="app-sidebar__version">
          GeniusBot Dashboard
        </p>
      </div>
    </div>
  )
}
