import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth'
import { apiClient } from '../../api/apiClient'
import { useQuery } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { listMasterData } from '../../api/masterDataApi'
import { masterDataConfigs } from '../../pages/master-data/masterDataConfig'
import { changeOwnPassword } from '../../auth/api/passwordApi'
import '../../pages/dashboard/OperationalPages.css'
import { useLanguage } from '../../i18n/useLanguage'

const pageTitles: Array<[RegExp, string]> = [
  [/^\/dashboard\/patients\/[^/]+\/conversation\/?$/, 'Conversation'],
  [/^\/dashboard\/appointments\/?$/, 'Appointments'],
  [/^\/dashboard\/patients\/?$/, 'Patients'],
  [/^\/dashboard\/doctors\/?$/, 'Doctors'],
  [/^\/dashboard\/services\/?$/, 'Services'],
  [/^\/dashboard\/staff\/?$/, 'Staff'],
  [/^\/dashboard\/reports\/?$/, 'Reports'],
  [/^\/dashboard\/campaigns\/?$/, 'Campaigns'],
  [/^\/dashboard\/settings\/?$/, 'Settings'],
]

export function AppHeader() {
  const { language, setLanguage, t } = useLanguage()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const clinicQuery = useQuery({
    queryKey: ['master-data', user?.clinicId, 'clinics'],
    queryFn: () => listMasterData(user!.clinicId, 'clinics'),
    enabled: Boolean(user?.clinicId),
  })
  const title = pageTitles.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Dashboard'
  const masterDataResource = pathname.match(/^\/dashboard\/master-data\/([^/]+)\/?$/)?.[1]
  const resolvedTitle = masterDataResource ? masterDataConfigs[masterDataResource]?.title ?? title : title
  const initials = user?.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GB'
  const passwordMutation = useMutation({
    mutationFn: () => changeOwnPassword(passwordForm),
    onSuccess: () => {
      setPasswordOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    },
  })

  function closePasswordDialog() {
    setPasswordOpen(false)
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    passwordMutation.reset()
  }

  function handleLogout() {
    logout()
    apiClient.defaults.headers.common.Authorization = undefined
    navigate('/login', { replace: true })
  }
  return (
    <div className="app-header">
      <div className="app-header__page">
        <p className="app-header__eyebrow">
          {t('Overview')}
        </p>

        <h1 className="app-header__title">
          {t(resolvedTitle)}
        </h1>
      </div>

      <div className="app-header__actions">
        <button
          className="app-header__language-toggle"
          type="button"
          data-i18n-ignore
          aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          title={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
        >
          <svg className="app-header__language-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
          </svg>
          <span>{language === 'ar' ? 'English' : 'العربية'}</span>
        </button>
        <div className="app-header__clinic">
          <span className="app-header__clinic-label">
            {t('Current Clinic')}
          </span>

          <span className="app-header__clinic-name" data-i18n-ignore>
            {String(clinicQuery.data?.[0]?.name ?? '—')}
          </span>
        </div>

        <div
          className="app-header__divider"
          aria-hidden="true"
        />

        <div className="app-header__user">
          <span
            className="app-header__user-avatar"
            aria-hidden="true"
          >
            {initials}
          </span>

          <span className="app-header__user-details">
            <span className="app-header__user-name" data-i18n-ignore>
              {user?.name ?? 'Clinic Owner'}
            </span>

            <span className="app-header__user-role">
              {t(user?.role ?? 'Owner')}
            </span>
          </span>
          <button className="app-header__logout" type="button" onClick={() => setPasswordOpen(true)}>{t('Change password')}</button>
          <button className="app-header__logout" type="button" onClick={handleLogout}>{t('Logout')}</button>
        </div>
      </div>
      {passwordOpen && <div className="operational-modal">
        <div className="operational-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
          <header><h3 id="change-password-title">{t('Change password')}</h3><button type="button" aria-label={t('Close')} onClick={closePasswordDialog}>×</button></header>
          <form onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate() }}>
            <div className="operational-form">
              <label>{t('Current password *')}<input type="password" autoComplete="current-password" required minLength={8} value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} /></label>
              <label>{t('New password *')}<input type="password" autoComplete="new-password" required minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} /></label>
              <label>{t('Confirm password *')}<input type="password" autoComplete="new-password" required minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></label>
            </div>
            {passwordMutation.isError && <p className="operational-error" role="alert">{passwordMutation.error.message}</p>}
            <footer><button type="button" onClick={closePasswordDialog}>{t('Cancel')}</button><button className="operational-primary" type="submit" disabled={passwordMutation.isPending || passwordForm.newPassword !== passwordForm.confirmPassword}>{passwordMutation.isPending ? t('Changing...') : t('Change password')}</button></footer>
          </form>
        </div>
      </div>}
    </div>
  )
}
