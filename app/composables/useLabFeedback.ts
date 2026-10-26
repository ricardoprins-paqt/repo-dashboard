import type { LabFeedback } from '#shared/types/lab'

type Target = 'idea' | 'experiment'
type Kind = LabFeedback['kind']

const SAYS: Record<Kind, (f: LabFeedback) => string> = {
  'rating': f => `${f.value} stars`,
  'not-now': () => 'not now',
  'reject': () => 'rejected',
  'note': () => 'feedback',
  'like': () => 'like: review it',
}

/**
 * Ricardo's feedback on one lab idea or experiment: send it (POST /api/lab-feedback; the lab PO applies it), and what to show
 * meanwhile: his open feedback ("goes to the PO shortly" / "is with the PO") or, once applied, the PO's note.
 */
export function useLabFeedback(target: Target, id: () => string, all: () => LabFeedback[] | null | undefined, onSent: () => void) {
  const sending = ref(false)
  const error = ref<string | null>(null)
  const mine = computed(() => (all() ?? []).filter(f => f.target_type === target && f.target_id === id()))
  const open = computed(() => mine.value.filter(f => f.status !== 'applied'))
  const applied = computed(() => mine.value.filter(f => f.status === 'applied' && f.applied_note).at(-1) ?? null)
  // His current verdict (like / reject / not now) and note, until the PO applied them. While still pending, a new click
  // replaces them (the status service does that); once delivered, a new click is sent as a correction.
  const VERDICTS = ['like', 'reject', 'not-now']
  const verdict = computed(() => open.value.filter(f => VERDICTS.includes(f.kind)).at(-1) ?? null)
  const note = computed(() => open.value.filter(f => f.kind === 'note').at(-1) ?? null)
  const choiceText = computed(() => {
    const v = verdict.value
    if (!v) return ''
    return v.status === 'pending'
      ? 'You can still change it until it goes out.'
      : 'It is with the product owner; a new choice is sent as a correction.'
  })
  const openText = computed(() => {
    if (!open.value.length) return ''
    const what = open.value.map(f => SAYS[f.kind](f) + (f.text ? `: "${f.text}"` : '')).join(' · ')
    if (open.value.some(f => f.status === 'delivered')) return `Your feedback (${what}) is with the product owner.`
    // Ratings wait until the clicking stopped (lss-tools feedbackDue); everything else goes at the next dispatcher run.
    const when = open.value.some(f => f.kind === 'rating') ? 'about two minutes after your last star' : 'within a minute'
    return `Your feedback (${what}) goes to the product owner ${when}.`
  })

  async function send(kind: Kind, extra: { value?: number, text?: string } = {}) {
    sending.value = true
    error.value = null
    try {
      await $fetch('/api/lab-feedback', { method: 'POST', body: { [target]: id(), kind, ...extra }, headers: { 'X-LSS-Action': '1' } })
      onSent()
      return true
    }
    catch (e) {
      error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message
      return false
    }
    finally {
      sending.value = false
    }
  }

  return { sending, error, open, applied, openText, send, verdict, note, choiceText }
}
