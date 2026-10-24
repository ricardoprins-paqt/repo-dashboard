import type { H3Event } from 'h3'

/** The status service (lss-tools proxy/status) keeps the tasks and inbox items; the dashboard only shows and forwards. */
export const inboxApi = () => process.env.PAQT_WS_API || 'http://127.0.0.1:8079'

const isLocal = (value: string) => {
  const host = value.includes('://') ? new URL(value).host : value
  const name = host.replace(/:\d+$/, '')
  return name === 'localhost' || name === '127.0.0.1' || name.endsWith('.localhost')
}

/**
 * An answer gets typed into a Claude session, so only this dashboard may send one: a local Host, a local Origin when the browser
 * sends one, and the X-LSS-Action header that a page on another site cannot add without a CORS preflight.
 */
export function assertLocalAction(event: H3Event) {
  const host = getRequestHeader(event, 'host') ?? ''
  const origin = getRequestHeader(event, 'origin')
  if (!isLocal(host) || (origin && !isLocal(origin)) || getRequestHeader(event, 'x-lss-action') !== '1') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
