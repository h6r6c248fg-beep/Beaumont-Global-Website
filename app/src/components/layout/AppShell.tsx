import { type ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  CalendarDays,
  Mail,
  Sparkles,
  Syringe,
  UtensilsCrossed,
  Dumbbell,
  LineChart,
  Settings,
  LogOut,
  Menu,
  X,
  Compass,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { cx, initials } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/email', label: 'Email', icon: Mail },
  { to: '/assistant', label: 'Assistant', icon: Sparkles },
  { to: '/cycles', label: 'Cycles', icon: Syringe },
  { to: '/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/finance', label: 'Finance', icon: LineChart },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <div className="flex min-h-screen bg-[var(--color-ink)]">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[var(--color-line-soft)] bg-[var(--color-obsidian)] lg:flex">
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {/* Sidebar (mobile) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 flex-col border-r border-[var(--color-line-soft)] bg-[var(--color-obsidian)] flex animate-fade-up">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--color-line-soft)] bg-[var(--color-ink)]/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-lg p-2 text-[var(--color-mist)] hover:bg-white/5 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm text-[var(--color-mist)] lg:block">
            Welcome back, <span className="text-[var(--color-paper)]">{displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <NavLink
              to="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-panel-2)] text-xs font-medium text-[var(--color-paper)] transition-colors hover:border-[var(--color-gold-dim)]"
            >
              {initials(displayName)}
            </NavLink>
            <button
              onClick={async () => {
                await signOut()
                navigate('/auth')
              }}
              className="rounded-lg p-2 text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-rose)]"
              title="Sign out"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )

  function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
    return (
      <>
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10">
              <Compass className="h-4.5 w-4.5 text-[var(--color-gold-bright)]" strokeWidth={1.5} />
            </div>
            <span className="font-display text-lg font-medium text-[var(--color-paper)]">Meridian</span>
          </div>
          <button className="rounded-lg p-1.5 text-[var(--color-mist)] hover:bg-white/5 lg:hidden" onClick={onNavigate}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="hairline mx-5" />

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-gold)]/12 text-[var(--color-gold-bright)]'
                    : 'text-[var(--color-mist)] hover:bg-white/5 hover:text-[var(--color-paper)]'
                )
              }
            >
              <item.icon className="h-4.5 w-4.5" strokeWidth={1.6} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hairline mx-5" />

        <div className="px-3 py-4">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--color-gold)]/12 text-[var(--color-gold-bright)]'
                  : 'text-[var(--color-mist)] hover:bg-white/5 hover:text-[var(--color-paper)]'
              )
            }
          >
            <Settings className="h-4.5 w-4.5" strokeWidth={1.6} />
            Settings
          </NavLink>
        </div>
      </>
    )
  }
}
