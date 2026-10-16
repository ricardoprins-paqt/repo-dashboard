import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import RepoCard from '../../app/components/RepoCard.vue'
import { brokenRepo, cleanRepo } from '../fixtures/overview'

// The PDS web components need a browser; stub them with plain elements that keep their text.
const stubs = {
  PDSBadge: { template: '<span data-badge><slot /></span>' },
  PDSIcon: { props: ['label'], template: '<svg role="img" :aria-label="label" />' },
}

describe('RepoCard', () => {
  it('summarizes a repository that needs attention', async () => {
    const wrapper = await mountSuspended(RepoCard, { props: { repo: brokenRepo, githubLoading: false }, global: { stubs } })

    try {
      const text = wrapper.text()
      expect(text).toContain('widgets')
      expect(text).toContain('feature/login')
      expect(text).toContain('↑2')
      expect(text).toContain('2 changed')
      expect(text).toContain('1 PR')
      expect(text).toContain('CI failing')
      expect(text).toContain('CI is failing on develop')
      expect(wrapper.find('svg[aria-label="Critical"]').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('shows a calm state for a clean repository and explains missing GitHub data', async () => {
    const wrapper = await mountSuspended(RepoCard, { props: { repo: cleanRepo, githubLoading: false }, global: { stubs } })

    try {
      expect(wrapper.text()).toContain('Nothing needs your attention.')
      expect(wrapper.text()).toContain('No GitHub data')
      expect(wrapper.find('svg[aria-label="All clear"]').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('shows a loading hint while GitHub data is on its way', async () => {
    const wrapper = await mountSuspended(RepoCard, { props: { repo: { ...cleanRepo, githubError: null }, githubLoading: true }, global: { stubs } })

    try {
      expect(wrapper.text()).toContain('GitHub loading…')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('emits select when clicked', async () => {
    const wrapper = await mountSuspended(RepoCard, { props: { repo: brokenRepo, githubLoading: false }, global: { stubs } })

    try {
      await wrapper.get('button').trigger('click')
      expect(wrapper.emitted('select')).toHaveLength(1)
    }
    finally {
      wrapper.unmount()
    }
  })
})
