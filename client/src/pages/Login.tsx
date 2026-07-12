import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { isAxiosError } from 'axios'

export default function Login() {
  const { login, signup } = useAuth()
  const [isSignup, setIsSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  document.title = isSignup ? 'Sign Up — AssetFlow' : 'Login — AssetFlow'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignup) {
        if (!name.trim()) { setError('Name is required'); setLoading(false); return }
        await signup(name.trim(), email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Invalid credentials. Please try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-app)',
      padding: 20,
    }}>
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '40px 36px',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 28,
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-accent-green), #16a34a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.1rem',
            color: '#fff',
            letterSpacing: '-0.02em',
            boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
          }}>
            AF
          </div>
        </div>

        {/* Title */}
        <h1 style={{
          textAlign: 'center',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: 28,
          letterSpacing: '-0.01em',
        }}>
          AssetFlow – {isSignup ? 'sign up' : 'login'}
        </h1>

        {/* Error */}
        {error && (
          <div
            className="animate-fade-in"
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-pill-red-bg)',
              color: 'var(--color-pill-red-text)',
              fontSize: '0.82rem',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isSignup && (
            <div className="animate-fade-in">
              <label style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: 6,
              }}>
                Name
              </label>
              <input
                className="input"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: 6,
            }}>
              Email
            </label>
            <input
              className="input"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: 6,
            }}>
              Password
              {!isSignup && (
                <span style={{
                  color: 'var(--color-text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}>
                  Forgot password
                </span>
              )}
            </label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px',
              fontSize: '0.9rem',
              marginTop: 4,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <div className="animate-spin" style={{
                width: 18,
                height: 18,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
              }} />
            ) : (
              isSignup ? 'Create Account' : 'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          margin: '24px 0 20px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {isSignup ? 'Already have an account?' : 'New here?'}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        {/* Helper / Toggle */}
        {!isSignup && (
          <div style={{
            padding: '14px 16px',
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 16,
          }}>
            <p style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
            }}>
              Sign up creates an employee account — admin roles assigned later
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setIsSignup(!isSignup)
            setError('')
          }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid var(--color-border-light)`,
            background: 'transparent',
            color: 'var(--color-text-primary)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent-green)'
            e.currentTarget.style.color = 'var(--color-accent-green)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-light)'
            e.currentTarget.style.color = 'var(--color-text-primary)'
          }}
        >
          {isSignup ? 'Back to Login' : 'Create Account'}
        </button>
      </div>
    </div>
  )
}
