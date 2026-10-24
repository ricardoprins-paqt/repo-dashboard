import { readFun } from '../lib/fun.ts'

/**
 * `GET /api/fun`
 * The fun loop: what the product owner session built, what it is doing now, the backlog and the last ticks.
 */
export default defineEventHandler(() => readFun())
