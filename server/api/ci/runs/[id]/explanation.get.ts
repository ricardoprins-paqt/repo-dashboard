import { ciStore } from '../../../../lib/ci-store.ts'

/** `GET /api/ci/runs/<id>/explanation`: the stored AI explanation of a failed run, or 404. */
export default defineEventHandler((event) => {
  const explanation = ciStore().explanation(Number(getRouterParam(event, 'id')))
  if (!explanation) throw createError({ statusCode: 404, statusMessage: 'Not explained yet' })
  return explanation
})
