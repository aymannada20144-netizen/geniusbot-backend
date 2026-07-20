import { NavLink } from 'react-router-dom'

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
      {
        label: 'Doctors',
        to: '/dashboard/doctors',
      },
      {
        label: 'Services',
        to: '/dashboard/services',
      },
      {
        label: 'Staff',
        to: '/dashboard/staff',
      },
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
        {navigationGroups.map((group) => (
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