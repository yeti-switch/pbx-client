import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const LS_THEME = 'app:theme'
const mql = window.matchMedia('(prefers-color-scheme: dark)')

function systemIsDark(): boolean {
  return mql.matches
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemIsDark() ? 'dark' : 'light') : theme
}

function apply(theme: Theme): void {
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
    apply(theme)
    set({ theme, resolved: resolve(theme) })
  }
}))

// Apply on load (before first paint, since this module is imported from main.tsx)
// and keep following the OS while in "system" mode.
apply(initial)
mql.addEventListener('change', () => {
  if (useThemeStore.getState().theme === 'system') {
    apply('system')
    useThemeStore.setState({ resolved: resolve('system') })
  }
})
