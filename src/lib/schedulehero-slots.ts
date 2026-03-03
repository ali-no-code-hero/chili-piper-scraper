/**
 * Normalize ScheduleHero campaign_time_slots API response to a flat list of slots in Central Time.
 * API returns meeting_slots as ISO strings (e.g. "2026-03-03T13:45:00.000-06:00") and booking_date.
 */

export interface ScheduleHeroSlotPayload {
  booking_date: string;
  meeting_slots: string[];
  time_zone?: string;
}

export interface NormalizedSlot {
  date: string;
  time: string;
  timeZone: string;
}

const TIMEZONE = 'America/Chicago';

/**
 * Format an ISO date-time string to date YYYY-MM-DD and time "h:mm AM/PM" (12-hour).
 * Input is already in Central (e.g. -06:00); we just parse and format.
 */
function formatSlotTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return { date, time };
}

/**
 * Convert one day's payload from campaign_time_slots to normalized slots.
 */
export function normalizeDaySlots(payload: ScheduleHeroSlotPayload): NormalizedSlot[] {
  const date = payload.booking_date || '';
  const list = payload.meeting_slots || [];
  const timeZone = payload.time_zone || TIMEZONE;

  return list.map((iso) => {
    const { date: d, time: t } = formatSlotTime(iso);
    return {
      date: d || date,
      time: t,
      timeZone
    };
  });
}

/**
 * Aggregate multiple day payloads and return a single flat list plus totals.
 */
export function normalizeScheduleHeroSlots(
  payloads: ScheduleHeroSlotPayload[]
): { slots: NormalizedSlot[]; total_slots: number; total_days: number } {
  const slots: NormalizedSlot[] = [];
  const seenDays = new Set<string>();

  for (const p of payloads) {
    const daySlots = normalizeDaySlots(p);
    for (const s of daySlots) {
      slots.push(s);
      seenDays.add(s.date);
    }
  }

  return {
    slots,
    total_slots: slots.length,
    total_days: seenDays.size
  };
}
