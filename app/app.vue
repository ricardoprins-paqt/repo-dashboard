<script setup lang="ts">
useHead({
  script: [{ key: 'theme-init', innerHTML: THEME_INIT_SCRIPT, tagPosition: 'head' }],
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>
