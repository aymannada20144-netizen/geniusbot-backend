export function AppHeader() {
  return (
    <div className="app-header">
      <div className="app-header__page">
        <p className="app-header__eyebrow">
          Overview
        </p>

        <h1 className="app-header__title">
          Dashboard
        </h1>
      </div>

      <div className="app-header__actions">
        <div className="app-header__clinic">
          <span className="app-header__clinic-label">
            Current clinic
          </span>

          <span className="app-header__clinic-name">
            Oryan Clinics
          </span>
        </div>

        <div
          className="app-header__divider"
          aria-hidden="true"
        />

        <button
          className="app-header__user"
          type="button"
          aria-label="Open user menu"
        >
          <span
            className="app-header__user-avatar"
            aria-hidden="true"
          >
            ON
          </span>

          <span className="app-header__user-details">
            <span className="app-header__user-name">
              Clinic Owner
            </span>

            <span className="app-header__user-role">
              Owner
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}