import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useLogin } from '../auth/hooks/useLogin'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const { login, isLoading, error, clearError } =
    useLogin()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    clearError()

    try {
      await login({
        identifier,
        password,
      })

      const redirectTo =
        (
          location.state as {
            from?: {
              pathname?: string
            }
          } | null
        )?.from?.pathname ?? '/dashboard/appointments'

      navigate(redirectTo, {
        replace: true,
      })
    } catch {
      // الخطأ تتم إدارته داخل useLogin
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="GeniusBot">
          <span className="login-brand__mark" aria-hidden="true">G</span>
          <span>GeniusBot</span>
        </div>
        <div className="login-heading">
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to manage your clinic</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="identifier">
            Username or email
          </label>

          <input
            id="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) =>
              setIdentifier(event.target.value)
            }
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="password">
            Password
          </label>

          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
          />
        </div>

        {error && (
          <p className="login-error" role="alert">
            {error.message}
          </p>
        )}

        <button className="login-submit"
          type="submit"
          disabled={isLoading}
        >
          {isLoading
            ? 'Signing in...'
            : 'Sign in'}
        </button>
        </form>
        <p className="login-footer">GeniusBot Clinic Dashboard</p>
      </section>
    </main>
  )
}
