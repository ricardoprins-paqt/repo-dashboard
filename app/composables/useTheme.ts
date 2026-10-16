export type ThemeName = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'repo-dashboard:theme'

/**
 * Runs in <head> before the first paint, so a stored or system dark preference never
 * flashes the light theme. Must stay in sync with `useTheme` below.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`

export function useTheme() {
  // The server cannot know the preference, so it renders 'light' and the client
  // adopts whatever the init script already put on <html> once mounted.
  const theme = useState<ThemeName>('theme', () => 'light')

  function apply(next: ThemeName) {
    theme.value = next
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    }
    catch {
      // Storage can be blocked (private mode); the choice then only lasts for this visit.
    }
  }

  function toggle() {
    apply(theme.value === 'dark' ? 'light' : 'dark')
  }

  onMounted(() => {
    theme.value = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  })

  return { theme, toggle }
}
