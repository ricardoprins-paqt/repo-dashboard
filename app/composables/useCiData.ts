import type { CiSyncState } from '#shared/types/ci'

const RELOAD_MS = 60_000
const WHILE_SYNCING_MS = 3_000

/**
 * Loads a CI endpoint in the browser (it only reads the local history, so this is cheap), every minute while the tab is visible
 * and every few seconds while a sync runs. `syncNow` is the "Refresh now" button: it starts a sync that calls GitHub.
 */
export function useCiData<T extends object>(url: MaybeRefOrGetter<string>) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const status = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load() {
    try {
      data.value = await $fetch<T>(toValue(url)) as T
      error.value = null
      status.value = 200
    }
    catch (caught) {
      const failure = caught as { statusCode?: number, data?: { statusMessage?: string } }
      status.value = failure.statusCode ?? null
      error.value = failure.data?.statusMessage ?? (caught as Error).message
    }
    schedule()
  }

  function schedule() {
    clearTimeout(timer)
    if (import.meta.server) return
    timer = setTimeout(() => {
      if (document.hidden) schedule()
      else void load()
    }, (data.value as { sync?: CiSyncState } | null)?.sync?.running ? WHILE_SYNCING_MS : RELOAD_MS)
  }

  async function syncNow() {
    try {
      await $fetch('/api/ci', { method: 'POST', headers: { 'X-LSS-Action': '1' } })
    }
    catch (caught) {
      error.value = (caught as { data?: { statusMessage?: string } }).data?.statusMessage ?? (caught as Error).message
    }
    await load()
  }

  onMounted(load)
  onBeforeUnmount(() => clearTimeout(timer))
  watch(() => toValue(url), () => {
    data.value = null
    void load()
  })

  return { data, error, status, load, syncNow }
}
