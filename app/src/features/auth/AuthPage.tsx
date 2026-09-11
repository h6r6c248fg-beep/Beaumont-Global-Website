import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, Mail, TriangleAlert } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { isSupabaseConfigured } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'magic'

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signInWithPassword, signUpWithPassword, signInWithMagicLink } = useAuth()
  const navigate = useNavigate()

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error } = await signInWithPassword(email, password)
        if (error) setError(error)
        else navigate('/')
      } else if (mode === 'signup') {
        const { error } = await signUpWithPassword(email, password, fullName)
        if (error) setError(error)
        else setNotice('Account created. Check your inbox to confirm your email, then sign in.')
      } else {
        const { error } = await signInWithMagicLink(email)
        if (error) setError(error)
        else setNotice('Magic link sent. Check your inbox to finish signing in.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-ink)] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[var(--color-gold)]/10 blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[420px] w-[420px] rounded-full bg-[var(--color-azure)]/10 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10">
            <Compass className="h-6 w-6 text-[var(--color-gold-bright)]" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-3xl font-medium text-[var(--color-paper)]">Meridian</h1>
          <p className="mt-1.5 text-sm text-[var(--color-mist)]">The private command center for your work and your life.</p>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          {!isSupabaseConfigured && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--color-amber)]/30 bg-[var(--color-amber)]/10 p-3 text-xs text-[var(--color-amber)]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Supabase isn&apos;t configured yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> — see the README.
              </span>
            </div>
          )}

          <div className="mb-6 flex gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-obsidian-2)] p-1">
            {(['login', 'signup', 'magic'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setNotice(null)
                }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold-bright)]' : 'text-[var(--color-mist)] hover:text-[var(--color-paper)]'
                }`}
              >
                {m === 'login' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Magic link'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Field label="Full name">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Beaumont" required />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" required />
            </Field>
            {mode !== 'magic' && (
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </Field>
            )}

            {error && <p className="rounded-lg bg-[var(--color-rose)]/10 px-3 py-2 text-xs text-[var(--color-rose)]">{error}</p>}
            {notice && <p className="rounded-lg bg-[var(--color-emerald)]/10 px-3 py-2 text-xs text-[var(--color-emerald)]">{notice}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={submitting}>
              {mode === 'magic' && <Mail className="h-4 w-4" />}
              {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send magic link'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-mist-2)]">
          Your data is private to your account and end-to-end scoped by row-level security — it syncs automatically across every device you sign into.
        </p>
      </div>
    </div>
  )
}
