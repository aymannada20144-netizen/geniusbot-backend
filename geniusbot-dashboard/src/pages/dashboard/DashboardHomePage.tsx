import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { listMasterData } from '../../api/masterDataApi'
import { useAuth } from '../../auth/hooks/useAuth'

const metrics = [
  { resource: 'branches', label: 'Active branches' },
  { resource: 'doctors', label: 'Active doctors' },
  { resource: 'rooms', label: 'Active rooms' },
  { resource: 'services', label: 'Active services' },
  { resource: 'specialties', label: 'Specialties' },
  { resource: 'service-assignments', label: 'Service assignments' },
]

export function DashboardHomePage() {
  const { user } = useAuth()
  const clinicId = user?.clinicId ?? ''
  const results = useQueries({
    queries: metrics.map(({ resource }) => ({
      queryKey: ['master-data', clinicId, resource],
      queryFn: () => listMasterData(clinicId, resource),
      enabled: Boolean(clinicId),
    })),
  })
  const holidays = useQueries({
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
    holidays[3].data?.some((item) => item.is_active) ? null : ['No active payment method', 'payment-methods'],
    (holidays[4].data?.length ?? 0) > 0 ? null : ['Doctors have no specialty assignments', 'doctor-specialties'],
    (holidays[5].data?.length ?? 0) > 0 ? null : ['Doctors have no working hours', 'doctor-working-hours'],
  ].filter(Boolean) as [string, string][]

  return (
    <section className="dashboard-home">
      <div className="dashboard-home__hero">
        <div className="dashboard-home__hero-content">
          <p className="dashboard-home__eyebrow">Clinic workspace</p>
          <h2 className="dashboard-home__title">Clinic operations overview</h2>
          <p className="dashboard-home__description">Live Master Data status for the authenticated clinic.</p>
        </div>
        <div className="dashboard-home__status" role="status"><span className="dashboard-home__status-indicator" />Live data</div>
      </div>
      <div className="dashboard-home__grid">
        {metrics.map((metric, index) => {
          const records = results[index].data ?? []
          const count = records.filter((item) => item.is_active === undefined || item.is_active === true).length
          return <Link className="dashboard-home__panel" key={metric.resource} to={`/dashboard/master-data/${metric.resource}`}>
            <h3 className="dashboard-home__panel-title">{metric.label}</h3>
            <strong className="dashboard-home__metric">{results[index].isLoading ? '…' : count}</strong>
          </Link>
        })}
      </div>
      <article className="dashboard-home__panel">
        <h3 className="dashboard-home__panel-title">Clinic setup</h3>
        {warnings.length === 0 ? <p>Core Master Data setup is complete.</p> : <ul>{warnings.map(([warning, resource]) => <li key={resource}><Link to={`/dashboard/master-data/${resource}`}>{warning}</Link></li>)}</ul>}
      </article>
    </section>
  )
}
