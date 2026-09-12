import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useLogin } from '../auth/hooks/useLogin'
import { useLanguage } from '../i18n/useLanguage'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, clearError } = useLogin()
  const { language } = useLanguage()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const isArabic = language === 'ar'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearError()

    try {
      await login({ identifier, password })
      const redirectTo = (
        location.state as { from?: { pathname?: string } } | null
      )?.from?.pathname ?? '/dashboard/appointments'
      navigate(redirectTo, { replace: true })
    } catch {
      // The auth hook owns the displayed error state.
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Shaden AI by GeniusBot">
        <div className="login-showcase__brand">
          <div className="login-showcase__logo"><img src="/geniusbot-logo.png?v=20260908-3" alt="GeniusBot" /></div>
          <div>
            <div className="login-showcase__name">GeniusBot</div>
            <div className="login-showcase__sub">{isArabic ? 'حلول الذكاء الاصطناعي والأتمتة' : 'AI & Automation Solutions'}</div>
          </div>
        </div>
        <div className="login-showcase__copy">
          <p className="login-showcase__eyebrow">{isArabic ? 'شادن · تشغيل العيادة بالذكاء الاصطناعي' : 'Shaden · AI clinic operations'}</p>
          <h2>{isArabic ? <>شادن، <span>مركز تشغيل عيادتك</span> الذكي.</> : <>Meet <span>Shaden</span>, your AI clinic operations console.</>}</h2>
          <p>
            {isArabic
              ? 'مساحة عمل واحدة وآمنة لإدارة المواعيد والمراجعين والجداول والخدمات والموظفين والبيانات التي تعتمد عليها شادن.'
              : 'One secure workspace for appointments, patients, schedules, services, staff and the clinic data that powers Shaden.'}
          </p>
        </div>
        <div className="login-showcase__features">
          <div className="login-showcase__feature"><strong>{isArabic ? 'المواعيد' : 'Appointments'}</strong><span>{isArabic ? 'تحكم تشغيلي واضح' : 'Operational control'}</span></div>
          <div className="login-showcase__feature"><strong>{isArabic ? 'بيانات العيادة' : 'Clinic Data'}</strong><span>{isArabic ? 'بيانات أساسية منظمة' : 'Structured master data'}</span></div>
          <div className="login-showcase__feature"><strong>{isArabic ? 'التقارير' : 'Reports'}</strong><span>{isArabic ? 'رؤية تساعد على القرار' : 'Actionable visibility'}</span></div>
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="GeniusBot">
          <span className="login-brand__mark" aria-hidden="true"><img src="/geniusbot-logo.png?v=20260908-3" alt="" /></span>
          <span>{isArabic ? 'منصة شادن الذكية' : 'Shaden AI Console'}</span>
        </div>
        <div className="login-heading">
          <h1 id="login-title">{isArabic ? 'مرحبًا بعودتك' : 'Welcome back'}</h1>
          <p>{isArabic ? 'سجّل الدخول إلى مساحة عمل عيادتك الآمنة' : 'Sign in to your secure clinic workspace'}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="identifier">{isArabic ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or email'}</label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder={isArabic ? 'أدخل اسم المستخدم أو البريد الإلكتروني' : 'Enter your username or email'}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">{isArabic ? 'كلمة المرور' : 'Password'}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder={isArabic ? 'أدخل كلمة المرور' : 'Enter your password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <p className="login-error" role="alert">{error.message}</p>}

          <button className="login-submit" type="submit" disabled={isLoading}>
            {isLoading ? (isArabic ? 'جارٍ تسجيل الدخول…' : 'Signing in...') : (isArabic ? 'تسجيل الدخول' : 'Sign in')}
          </button>
        </form>
        <p className="login-footer">GeniusBot · {isArabic ? 'لوحة إدارة شادن' : 'Shaden Clinic Dashboard'}</p>
      </section>
    </main>
  )
}
