import type { Achievement, Summary } from '#shared/types/focus'

/** One day on the summary page: what we achieved (if written) and the FYI summaries of that day. */
export interface SummaryDay {
  date: string
  achievement: Achievement | null
  fyis: Summary[]
}

/** The last `days` days that have an achievements entry or an FYI summary, newest first. */
export function summaryDays(achievements: Achievement[], summaries: Summary[], days = 14): SummaryDay[] {
  const byDate = new Map<string, SummaryDay>()
  const day = (date: string) => {
    const d = byDate.get(date) ?? { date, achievement: null, fyis: [] }
    byDate.set(date, d)
    return d
  }
  for (const a of achievements) {
    const d = day(a.date)
    if (!d.achievement || a.updated > d.achievement.updated) d.achievement = a
  }
  for (const s of summaries) day(s.date).fyis.push(s)
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, days)
}

/** "Write a summary" was pressed and nothing newer than that has arrived yet (an FYI summary or an achievements update). */
export function summaryPending(requestedAt: string | null | undefined, summaries: Summary[], achievements: Achievement[]): boolean {
  if (!requestedAt) return false
  return !summaries.some(s => s.created > requestedAt) && !achievements.some(a => a.updated > requestedAt)
}
