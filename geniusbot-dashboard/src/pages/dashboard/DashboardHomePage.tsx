export function DashboardHomePage() {
  return (
    <section className="dashboard-home">
      <div className="dashboard-home__hero">
        <div className="dashboard-home__hero-content">
          <p className="dashboard-home__eyebrow">
            Clinic workspace
          </p>

          <h2 className="dashboard-home__title">
            Welcome to GeniusBot
          </h2>

          <p className="dashboard-home__description">
            Your dashboard foundation is ready. Upcoming
            modules will provide appointment management,
            patient records, clinic operations and business
            insights from one unified workspace.
          </p>
        </div>

        <div
          className="dashboard-home__status"
          role="status"
        >
          <span
            className="dashboard-home__status-indicator"
            aria-hidden="true"
          />

          <span>
            System ready
          </span>
        </div>
      </div>

      <div className="dashboard-home__grid">
        <article className="dashboard-home__panel">
          <div className="dashboard-home__panel-header">
            <span
              className="dashboard-home__panel-index"
              aria-hidden="true"
            >
              01
            </span>

            <h3 className="dashboard-home__panel-title">
              Daily operations
            </h3>
          </div>

          <p className="dashboard-home__panel-description">
            Review appointments, patient activity and the
            clinic schedule from a single operational view.
          </p>

          <span className="dashboard-home__panel-state">
            Coming soon
          </span>
        </article>

        <article className="dashboard-home__panel">
          <div className="dashboard-home__panel-header">
            <span
              className="dashboard-home__panel-index"
              aria-hidden="true"
            >
              02
            </span>

            <h3 className="dashboard-home__panel-title">
              Clinic management
            </h3>
          </div>

          <p className="dashboard-home__panel-description">
            Manage doctors, services, staff, branches and
            operational settings without leaving the
            dashboard.
          </p>

          <span className="dashboard-home__panel-state">
            Coming soon
          </span>
        </article>

        <article className="dashboard-home__panel">
          <div className="dashboard-home__panel-header">
            <span
              className="dashboard-home__panel-index"
              aria-hidden="true"
            >
              03
            </span>

            <h3 className="dashboard-home__panel-title">
              Business insights
            </h3>
          </div>

          <p className="dashboard-home__panel-description">
            Track clinic performance, appointment trends and
            financial indicators through focused reports.
          </p>

          <span className="dashboard-home__panel-state">
            Coming soon
          </span>
        </article>
      </div>
    </section>
  )
}