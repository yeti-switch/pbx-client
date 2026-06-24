import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const LS_THEME = 'app:theme'
const mql = window.matchMedia('(prefers-color-scheme: dark)')

// Cached "OS is dark" value (the prefers-color-scheme media query is the OS
// truth in Chromium across all platforms). We RE-READ it actively rather than
// trusting only the 'change' event, which can be missed across sleep/wake.
let systemDark = mql.matches

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

function applyClass(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolve(theme) === 'dark')
}

interface ThemeState {
  theme: Theme
  /** The effective light/dark value after resolving "system". */
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const initial = ((): Theme => {
  const stored = localStorage.getItem(LS_THEME)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
})()

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  resolved: resolve(initial),
  setTheme: (theme) => {
    localStorage.setItem(LS_THEME, theme)
    applyClass(theme)
    set({ theme, resolved: resolve(theme) })
  }
}))

// Apply on load (before first paint, since this module is imported from main.tsx).
applyClass(initial)

/** Re-read the OS dark state; re-apply if it changed and we follow the system. */
function syncSystem(): void {
  const dark = mql.matches
  if (dark === systemDark) return
  systemDark = dark
  if (useThemeStore.getState().theme === 'system') {
    applyClass('system')
    useThemeStore.setState({ resolved: resolve('system') })
  }
}

// 1) The media-query change event (primary, but can be missed across sleep/wake).
mql.addEventListener('change', syncSystem)
// 2) Re-check when the window regains focus / becomes visible (covers wake-from-sleep).
window.addEventListener('focus', syncSystem)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncSystem()
})
// 3) Low-frequency backstop so it always converges even if no event fires.
setInterval(syncSystem, 2000)
