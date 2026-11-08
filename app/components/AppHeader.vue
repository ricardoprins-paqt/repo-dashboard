<script setup lang="ts">
import type { DropdownMenuItem } from '@paqtdesign/core/components/dropdown-menu'

/**
 * The page header for every page: logo, title, page links and one menu for the page's actions. It sticks to the top (with the
 * data sync banner above it), so the menu is always at hand. Pages add their own menu items; dark mode is always there.
 */
const props = withDefaults(defineProps<{
  title: string
  /** Page actions: `type: 'checkbox'` with `checked` for settings. */
  items?: DropdownMenuItem[]
}>(), { items: () => [] })
const emit = defineEmits<{ select: [id: string, checked: boolean] }>()

const { theme, toggle: toggleTheme } = useTheme()
const route = useRoute()

const PAGES = [
  { to: '/focus', label: 'Focus' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/summary', label: 'Summary' },
  { to: '/', label: 'Repositories' },
  { to: '/ci', label: 'CI' },
  { to: '/lab', label: 'Lab loop' },
  { to: '/research', label: 'Research' },
]

/** /ci/<repo> belongs to the CI page. */
const isCurrent = (to: string) => route.path === to || (to !== '/' && route.path.startsWith(`${to}/`))

const menuItems = computed<DropdownMenuItem[]>(() => [
  ...props.items,
  { id: 'theme-dark', label: 'Dark mode', type: 'checkbox', checked: theme.value === 'dark' },
])

// The sticky block's height (banners included) as --app-header-height, so link targets land below it (.inbox-anchor).
const sticky = ref<HTMLElement | null>(null)
let resize: ResizeObserver | undefined
onMounted(() => {
  if (!sticky.value) return
  resize = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--app-header-height', `${Math.round(entry?.target.getBoundingClientRect().height ?? 0)}px`)
  })
  resize.observe(sticky.value)
})
onBeforeUnmount(() => resize?.disconnect())

function onSelect(event: CustomEvent<{ id: string, checked?: boolean }>) {
  const { id, checked } = event.detail
  if (id === 'theme-dark') toggleTheme()
  else emit('select', id, Boolean(checked))
}
</script>

<template>
  <div
    ref="sticky"
    class="sticky top-0 z-30"
  >
    <StatusServiceBanner />
    <DataSyncBanner />
    <header class="border-b border-border bg-surface">
      <div class="mx-auto flex w-full max-w-[84rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-8">
        <NuxtLink
          to="/"
          class="flex shrink-0"
          aria-label="PAQT repo dashboard home"
        >
          <img
            class="dark:invert"
            src="/logo.svg"
            width="110"
            height="24"
            alt="PAQT"
          >
        </NuxtLink>
        <span
          class="hidden h-6 border-l border-border sm:block"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <h1 class="text-lg font-semibold">
            {{ title }}
          </h1>
          <p
            class="text-xs text-foreground-muted"
            aria-live="polite"
          >
            <slot name="subtitle" />
          </p>
        </div>
        <!-- Small screens: the pages get their own row that scrolls sideways, so the header stays two lines at most. -->
        <nav
          class="order-last -mx-1 flex w-full items-center gap-x-6 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:ml-auto sm:w-auto sm:px-0"
          aria-label="Pages"
        >
          <NuxtLink
            v-for="page in PAGES"
            :key="page.to"
            :to="page.to"
            class="whitespace-nowrap py-1 text-sm font-medium underline-offset-[6px] transition-colors hover:text-foreground"
            :class="isCurrent(page.to) ? 'text-foreground underline decoration-2' : 'text-foreground-muted'"
            :aria-current="route.path === page.to ? 'page' : undefined"
          >
            {{ page.label }}
          </NuxtLink>
        </nav>
        <div class="ml-auto sm:ml-0">
          <!-- Client only: the menu's checked states depend on the theme, which the server cannot know. -->
          <ClientOnly>
            <PDSDropdownMenu
              :items="menuItems"
              @select="onSelect"
            >
              <template #trigger>
                <PDSButton
                  appearance="outlined"
                  square
                >
                  <PDSIcon
                    name="lucide:ellipsis-vertical"
                    size="16"
                  />
                  <span class="sr-only">Actions and settings</span>
                </PDSButton>
              </template>
            </PDSDropdownMenu>
          </ClientOnly>
        </div>
      </div>
    </header>
  </div>
</template>
