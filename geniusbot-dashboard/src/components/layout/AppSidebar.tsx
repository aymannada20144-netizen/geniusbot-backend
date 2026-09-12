import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { canViewOperationalReports } from '../../auth/reportPermissions'
import { useAuth } from '../../auth/hooks/useAuth'
import { canViewPrices } from '../../auth/pricePermissions'
import { canViewCampaigns } from '../../auth/notificationPermissions'
import { useLanguage } from '../../i18n/useLanguage'

type SidebarNavigationItem = {
  label: string
  to: string
  end?: boolean
  icon: IconName
}

type SidebarNavigationGroup = {
  label: string
  items: SidebarNavigationItem[]
}

type IconName =
  | 'dashboard' | 'calendar' | 'patients' | 'clinic' | 'branch' | 'doctor'
  | 'specialty' | 'room' | 'service' | 'staff' | 'clock' | 'holiday'
  | 'timeoff' | 'assignment' | 'questions' | 'payment' | 'insurance'
  | 'price' | 'report' | 'campaign' | 'settings'

const navigationGroups: SidebarNavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/dashboard', end: true, icon: 'dashboard' },
      { label: 'Appointments', to: '/dashboard/appointments', icon: 'calendar' },
      { label: 'Patients', to: '/dashboard/patients', icon: 'patients' },
    ],
  },
  {
    label: 'Clinic Management',
    items: [
      { label: 'Clinics', to: '/dashboard/master-data/clinics', icon: 'clinic' },
      { label: 'Branches', to: '/dashboard/master-data/branches', icon: 'branch' },
      { label: 'Doctors', to: '/dashboard/master-data/doctors', icon: 'doctor' },
      { label: 'Specialties', to: '/dashboard/master-data/specialties', icon: 'specialty' },
      { label: 'Rooms', to: '/dashboard/master-data/rooms', icon: 'room' },
      { label: 'Services', to: '/dashboard/master-data/services', icon: 'service' },
      { label: 'Staff', to: '/dashboard/staff', icon: 'staff' },
    ],
  },
  {
    label: 'Schedules',
    items: [
      { label: 'Branch Working Hours', to: '/dashboard/master-data/branch-working-hours', icon: 'clock' },
      { label: 'Clinic Holidays', to: '/dashboard/master-data/clinic-holidays', icon: 'holiday' },
      { label: 'Doctor Working Hours', to: '/dashboard/master-data/doctor-working-hours', icon: 'clock' },
      { label: 'Doctor Time Off', to: '/dashboard/master-data/doctor-time-off', icon: 'timeoff' },
      { label: 'Room Time Off', to: '/dashboard/master-data/room-time-off', icon: 'timeoff' },
    ],
  },
  {
    label: 'Assignments',
    items: [
      { label: 'Doctor Specialties', to: '/dashboard/master-data/doctor-specialties', icon: 'assignment' },
      { label: 'Service Assignments', to: '/dashboard/master-data/service-assignments', icon: 'assignment' },
      { label: 'Service Pre Questions', to: '/dashboard/master-data/service-pre-questions', icon: 'questions' },
    ],
  },
  {
    label: 'Billing Setup',
    items: [
      { label: 'Payment Methods', to: '/dashboard/master-data/payment-methods', icon: 'payment' },
      { label: 'Insurance Companies', to: '/dashboard/master-data/insurance-companies', icon: 'insurance' },
      { label: 'Insurance Classes', to: '/dashboard/master-data/insurance-classes', icon: 'insurance' },
      { label: 'Prices', to: '/dashboard/prices', icon: 'price' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', to: '/dashboard/reports', icon: 'report' },
      { label: 'Campaigns', to: '/dashboard/campaigns', icon: 'campaign' },
    ],
  },
]

function NavIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    patients: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clinic: <><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6M9 10h6M12 7v6M9 10h6"/></>,
    branch: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M12 12v5"/></>,
    doctor: <><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M12 14v7M9 18h6"/></>,
    specialty: <><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="8"/></>,
    room: <><path d="M3 21h18M5 21V4h11v17M9 12h.01"/><path d="M16 8h3v13"/></>,
    service: <><path d="M12 2l2.2 6.4H21l-5.5 4 2.1 6.5L12 15l-5.6 3.9 2.1-6.5-5.5-4h6.8z"/></>,
    staff: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2.5"/><path d="M2 21v-2a6 6 0 0 1 12 0v2M14 14a5 5 0 0 1 8 4v3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    holiday: <><path d="M4 5h16v16H4zM8 3v4M16 3v4M4 10h16"/><path d="M8 14l2 2 5-5"/></>,
    timeoff: <><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></>,
    assignment: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
    questions: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1 .8-1.9 1.4-1.9 2.9M12 18h.01"/></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    insurance: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-5"/></>,
    price: <><path d="M20 13l-7 7-9-9V4h7z"/><circle cx="8.5" cy="8.5" r="1"/></>,
    report: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    campaign: <><path d="M3 11v2l11 4V7L3 11z"/><path d="M14 9.5c3.5.4 5.5 2.1 7 4.5M6 14.2 7.5 20h3L9 15.3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.07V3h4v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>
}

export function AppSidebar() {
  const { user } = useAuth()
  const { language, t } = useLanguage()
  const visibleGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (item.to !== '/dashboard/reports' || canViewOperationalReports(user?.permissions)) &&
        (item.to !== '/dashboard/prices' || canViewPrices(user?.permissions)) &&
        (item.to !== '/dashboard/campaigns' || canViewCampaigns(user?.permissions)),
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="app-sidebar">
      <div className="app-sidebar__brand">
        <div className="app-sidebar__brand-mark" aria-hidden="true">
          <img src="/geniusbot-logo.png?v=20260908-3" alt="" />
        </div>
        <div className="app-sidebar__brand-content">
          <span className="app-sidebar__brand-name">{language === 'ar' ? 'منصة شادن الذكية' : 'Shaden AI Console'}</span>
          <span className="app-sidebar__brand-description">{language === 'ar' ? 'GeniusBot · أتمتة العيادات' : 'GeniusBot · Clinic Automation'}</span>
        </div>
      </div>

      <nav className="app-sidebar__navigation" aria-label={t('Dashboard navigation')}>
        {visibleGroups.map((group) => (
          <div className="app-sidebar__navigation-group" key={group.label}>
            <p className="app-sidebar__navigation-label">{t(group.label)}</p>
            <ul className="app-sidebar__navigation-list">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive }) => [
                      'app-sidebar__navigation-link',
                      isActive ? 'app-sidebar__navigation-link--active' : '',
                    ].filter(Boolean).join(' ')}
                    end={item.end}
                    to={item.to}
                    title={t(item.label)}
                  >
                    <span className="app-sidebar__navigation-icon"><NavIcon name={item.icon} /></span>
                    <span>{t(item.label)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <NavLink
          className={({ isActive }) => [
            'app-sidebar__navigation-link',
            isActive ? 'app-sidebar__navigation-link--active' : '',
          ].filter(Boolean).join(' ')}
          to="/dashboard/settings"
          title={t('Settings')}
        >
          <span className="app-sidebar__navigation-icon"><NavIcon name="settings" /></span>
          <span>{t('Settings')}</span>
        </NavLink>
        <div className="app-sidebar__status">
          <span className="app-sidebar__status-dot" aria-hidden="true" />
          <span>{language === 'ar' ? 'مساحة عمل عيادة آمنة' : 'Secure clinic workspace'}</span>
        </div>
        <p className="app-sidebar__version">GeniusBot · Shaden</p>
      </div>
    </div>
  )
}
