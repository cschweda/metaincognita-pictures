export interface FrameSchedule {
  days: number[]
  start: string | null
  end: string | null
}

/**
 * Whether a schedule applies at this moment on the frame's own clock. No days means every day, and
 * no times means all day. A window that crosses midnight belongs to the day it started.
 */
export function inSchedule(schedule: FrameSchedule | null | undefined, now: Date): boolean {
  if (!schedule) return false
  const { days, start, end } = schedule
  const dayMatches = (day: number) => days.length === 0 || days.includes(day)
  const today = now.getDay()
  if (!start || !end || start === end) return dayMatches(today)

  const time = now.toTimeString().slice(0, 5)
  if (start < end) return dayMatches(today) && time >= start && time < end
  return time >= start ? dayMatches(today) : time < end && dayMatches((today + 6) % 7)
}
