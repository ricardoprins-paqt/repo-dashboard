import type { FocusPrsResponse } from '#shared/types/focus'

let cache: FocusPrsResponse | null = null

/** The last PR lists for the focus page (a minute old at most; a changed repo setting clears it). */
export const focusPrsCache = () => cache
export const setFocusPrsCache = (value: FocusPrsResponse) => {
  cache = value
}
export const resetFocusPrs = () => {
  cache = null
}
