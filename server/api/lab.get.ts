import { readLab } from '../lib/lab.ts'

/**
 * `GET /api/lab`
 * The lab loop: what the product owner session built, what it is doing now, the backlog and the last ticks.
 */
export default defineEventHandler(() => readLab())
