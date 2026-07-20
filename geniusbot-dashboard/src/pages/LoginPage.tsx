import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useLogin } from '../auth/hooks/useLogin'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const { login, isLoading, error, clearError } =
    useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    clearError()

    try {
      await login({
        email,
        password,
      })

      const redirectTo =
        (
          location.state as {
            from?: {
              pathname?: string
            }
          } | null
        )?.from?.pathname ?? '/'

      navigate(redirectTo, {
        replace: true,
      })
    } catch {
      // الخطأ تتم إدارته داخل useLogin
    }
  }

  return (
    <main>
      <h1>Login</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">
            Email
          </label>

          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />
        </div>

        <div>
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
          <p role="alert">
            {error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
        >
          {isLoading
            ? 'Signing in...'
            : 'Sign in'}
        </button>
      </form>
    </main>
  )
}