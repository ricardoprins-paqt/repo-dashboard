import type { CardsResponse } from '#shared/types/focus'

/** `GET /api/cards`: Ricardo's focus cards, from the status service. */
export default defineEventHandler(async (): Promise<CardsResponse> => {
  try {
    const data = await $fetch<{ cards: CardsResponse['cards'] }>(`${inboxApi()}/api/cards`, { timeout: 15000 })
    return { available: true, cards: data.cards ?? [] }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, cards: [] }
  }
})
