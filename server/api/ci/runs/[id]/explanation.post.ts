import { ciStore } from '../../../../lib/ci-store.ts'
import { explainRun } from '../../../../lib/ci-explain.ts'

/** `POST /api/ci/runs/<id>/explanation`: "Why did this fail?". Asks Claude (20-60 s) unless the run was explained before. */
export default defineEventHandler(async (event) => {
  assertLocalAction(event)
  return await explainRun(ciStore(), Number(getRouterParam(event, 'id'))).catch((caught: Error) => {
    throw createError({ statusCode: 502, statusMessage: caught.message })
  })
})
