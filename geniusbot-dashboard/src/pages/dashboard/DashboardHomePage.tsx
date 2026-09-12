import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { listMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'
import { useLanguage } from '../../i18n/useLanguage'

const metrics = [
  { resource: 'branches', label: 'Active branches' },
  { resource: 'doctors', label: 'Active doctors' },
  { resource: 'rooms', label: 'Active rooms' },
  { resource: 'services', label: 'Active services' },
  { resource: 'specialties', label: 'Specialties' },
  { resource: 'service-assignments', label: 'Service assignments' },
]

const quickLinks = [
  { to: '/dashboard/appointments', icon: '◫', label: 'Appointments' },
  { to: '/dashboard/patients', icon: '◎', label: 'Patients' },
  { to: '/dashboard/reports', icon: '↗', label: 'Reports' },
  { to: '/dashboard/settings', icon: '⚙', label: 'Settings' },
]

export function DashboardHomePage() {
  const { user } = useAuth()
  const { language, t } = useLanguage()
  const clinicId = user?.clinicId ?? ''
  const results = useQueries({
    queries: metrics.map(({ resource }) => ({
      queryKey: ['master-data', clinicId, resource],
      queryFn: () => listMasterData(clinicId, resource),
      enabled: Boolean(clinicId),
    })),
  })
  const setupQueries = useQueries({
    queries: ['clinic-holidays', 'doctor-time-off', 'room-time-off', 'payment-methods', 'doctor-specialties', 'doctor-working-hours']
      .map((resource) => ({
        queryKey: ['master-data', clinicId, resource],
        queryFn: () => listMasterData(clinicId, resource),
        enabled: Boolean(clinicId),
      })),
  })

  const warnings = [
    results[0].data?.some((item) => item.is_active) ? null : ['No active branch', 'branches'],
    results[1].data?.some((item) => item.is_active) ? null : ['No active doctor', 'doctors'],
    results[2].data?.some((item) => item.is_active) ? null : ['No active room', 'rooms'],
    results[3].data?.some((item) => item.is_active) ? null : ['No active service', 'services'],
    setupQueries[3].data?.some((item) => item.is_active) ? null : ['No active payment method', 'payment-methods'],
    (setupQueries[4].data?.length ?? 0) > 0 ? null : ['Doctors have no specialty assignments', 'doctor-specialties'],
    (setupQueries[5].data?.length ?? 0) > 0 ? null : ['Doctors have no working hours', 'doctor-working-hours'],
  ].filter(Boolean) as [string, string][]

  const setupTotal = 7
  const setupComplete = setupTotal - warnings.length
  const firstName = user?.name?.trim().split(/\s+/)[0] || (language === 'ar' ? 'بك' : 'there')
  const isArabic = language === 'ar'

  return (
    <section className="dashboard-home">
      <div className="dashboard-home__hero">
        <div className="dashboard-home__hero-logo" aria-hidden="true">
          <img src="/geniusbot-logo.png?v=20260908-3" alt="" />
        </div>
        <div className="dashboard-home__hero-content">
          <p className="dashboard-home__eyebrow">{isArabic ? 'شادن · تشغيل العيادة بالذكاء الاصطناعي' : 'Shaden · AI clinic operations'}</p>
          <h2 className="dashboard-home__title">{isArabic ? <>مرحبًا، <span data-i18n-ignore>{firstName}</span>. مساحة عمل عيادتك جاهزة.</> : <>Welcome, <span data-i18n-ignore>{firstName}</span>. Your clinic workspace is ready.</>}</h2>
          <p className="dashboard-home__description">
            {isArabic
              ? 'أدر البيانات التشغيلية التي تعتمد عليها شادن في المواعيد والمراجعين والخدمات والجداول وإعدادات العيادة.'
              : 'Manage the operational data that powers Shaden across appointments, patients, services, schedules and clinic configuration.'}
          </p>
        </div>
        <div className="dashboard-home__status" role="status">
          <span className="dashboard-home__status-indicator" />
          {isArabic ? 'بيانات أساسية مباشرة' : 'Live master data'}
        </div>
      </div>

      <div className="dashboard-home__grid" aria-label={isArabic ? 'مؤشرات العيادة' : 'Clinic metrics'}>
        {metrics.map((metric, index) => {
          const records = results[index].data ?? []
          const count = records.filter((item) => item.is_active === undefined || item.is_active === true).length
          return (
            <Link className="dashboard-home__panel" key={metric.resource} to={`/dashboard/master-data/${metric.resource}`}>
              <h3 className="dashboard-home__panel-title">{t(metric.label)}</h3>
              <strong className="dashboard-home__metric">{results[index].isLoading ? '…' : count}</strong>
            </Link>
          )
        })}
      </div>

      <nav className="dashboard-home__quick-links" aria-label={isArabic ? 'روابط سريعة' : 'Quick links'}>
        {quickLinks.map((item) => (
          <Link className="dashboard-home__quick-link" key={item.to} to={item.to}>
            <span className="dashboard-home__quick-icon" aria-hidden="true">{item.icon}</span>
            <span>{t(item.label)}</span>
          </Link>
        ))}
      </nav>

      <div className="dashboard-home__setup">
        <article className="dashboard-home__panel dashboard-home__setup-main">
          <h3 className="dashboard-home__panel-title">{isArabic ? 'جاهزية العيادة' : 'Clinic readiness'}</h3>
          {warnings.length === 0 ? (
            <p>{isArabic ? 'اكتمل إعداد البيانات الأساسية. لدى شادن الإعدادات التشغيلية المطلوبة.' : 'Core Master Data setup is complete. Shaden has the required operational configuration.'}</p>
          ) : (
            <>
              <p>{isArabic ? 'أكمل العناصر التالية لتعزيز الجاهزية التشغيلية:' : 'Complete the following setup items to strengthen operational coverage:'}</p>
              <ul>
                {warnings.map(([warning, resource]) => (
                  <li key={resource}><Link to={`/dashboard/master-data/${resource}`}>{t(warning)}</Link></li>
                ))}
              </ul>
            </>
          )}
        </article>
        <article className="dashboard-home__panel dashboard-home__setup-score" aria-label={isArabic ? 'درجة جاهزية الإعداد' : 'Configuration readiness score'}>
          <strong>{setupComplete}/{setupTotal}</strong>
          <span>{isArabic ? 'فحوصات إعداد مكتملة' : 'configuration checks complete'}</span>
        </article>
      </div>
    </section>
  )
}
