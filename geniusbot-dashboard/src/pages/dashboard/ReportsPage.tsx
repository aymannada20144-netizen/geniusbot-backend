import './OperationalPages.css'

export function ReportsPage() {
  return <section className="operational-page">
    <header><div><p>Insights</p><h2>Reports</h2><span>Operational reports will appear here when a dashboard reporting API is available.</span></div></header>
    <div className="operational-state"><strong>No reports are currently available</strong><p>The backend exposes appointment dashboard summaries, but no dedicated reporting API is registered. No placeholder metrics are shown.</p></div>
  </section>
}
