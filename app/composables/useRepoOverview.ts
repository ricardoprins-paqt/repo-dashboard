import type { RepoOverview } from '#shared/types/repo'

const AUTO_REFRESH_MS = 60_000

export function useRepoOverview() {
  const overview = useState<RepoOverview | null>('repo-overview', () => null)
  const loading = ref(false)
  const githubLoading = ref(false)
  const fetching = ref(false)
  const error = ref<string | null>(null)
  const autoRefresh = ref(true)
  let timer: ReturnType<typeof setInterval> | undefined

  async function load(options: { refresh?: boolean } = {}) {
    if (loading.value || fetching.value) return
    loading.value = true
    error.value = null
    const refresh = options.refresh ? '&refresh=1' : ''
    try {
      // First paint: local git state only, which takes well under a second.
      // Later reloads skip this step so GitHub-derived findings do not flicker away.
      if (!overview.value) overview.value = await $fetch<RepoOverview>(`/api/repos?github=0${refresh}`)
      githubLoading.value = true
      overview.value = await $fetch<RepoOverview>(`/api/repos?github=1${refresh}`)
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      loading.value = false
      githubLoading.value = false
    }
  }

  async function fetchRemotes() {
    if (fetching.value) return
    fetching.value = true
    error.value = null
    try {
      overview.value = await $fetch<RepoOverview>('/api/repos', { method: 'POST' })
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      fetching.value = false
    }
  }

  onMounted(() => {
    void load()
    timer = setInterval(() => {
      if (autoRefresh.value && !document.hidden) void load()
    }, AUTO_REFRESH_MS)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return { overview, loading, githubLoading, fetching, error, autoRefresh, load, fetchRemotes }
}
