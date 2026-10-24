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
  { to: '/inbox', label: 'Inbox' },
  { to: '/', label: 'Repositories' },
  { to: '/lab', label: 'Lab loop' },
]

const menuItems = computed<DropdownMenuItem[]>(() => [
  ...props.items,
  { id: 'theme-dark', label: 'Dark mode', type: 'checkbox', checked: theme.value === 'dark' },
])

function onSelect(event: CustomEvent<{ id: string, checked?: boolean }>) {
  const { id, checked } = event.detail
  if (id === 'theme-dark') toggleTheme()
  else emit('select', id, Boolean(checked))
}
</script>

<template>
  <div class="sticky top-0 z-30">
    <DataSyncBanner />
    <header class="border-b border-border bg-surface">
      <div class="mx-auto flex w-full max-w-[84rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
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
          <h1 class="text-base font-semibold leading-tight">
            {{ title }}
          </h1>
          <p
            class="text-xs text-foreground-muted"
            aria-live="polite"
          >
            <slot name="subtitle" />
          </p>
        </div>
        <nav
          class="ml-auto flex flex-wrap items-center gap-4"
          aria-label="Pages"
        >
          <NuxtLink
            v-for="page in PAGES"
            :key="page.to"
            :to="page.to"
            class="text-sm underline-offset-4 hover:underline"
            :class="route.path === page.to ? 'font-semibold underline' : 'text-foreground-muted'"
            :aria-current="route.path === page.to ? 'page' : undefined"
          >
            {{ page.label }}
          </NuxtLink>
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
        </nav>
      </div>
    </header>
  </div>
</template>
