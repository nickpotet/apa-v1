import { useState, useEffect } from 'react';
import { LONG_DAYS, SCHEDULE, LAST_ENTRY_MIN } from '../config/venueConfig';

export type VenueStatus =
  | { kind: 'open';     closesAt: string }
  | { kind: 'lastCall'; closesAt: string }
  | { kind: 'siesta';   opensAt: string }
  | { kind: 'closed';   opensAt: string };

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

function nextOpenTime(now: Date): string {
  // If after today's last session, return tomorrow morning's open time.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sch = LONG_DAYS.has(tomorrow.getDay()) ? SCHEDULE.long : SCHEDULE.short;
  return sch.mOpen;
}

function compute(now: Date): VenueStatus {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = LONG_DAYS.has(day) ? SCHEDULE.long : SCHEDULE.short;

  const mO = toMin(s.mOpen);
  const mC = toMin(s.mClose);
  const aO = toMin(s.aOpen);
  const aC = toMin(s.aClose);
  const lc = LAST_ENTRY_MIN;

  if (mins < mO)        return { kind: 'closed',   opensAt: s.mOpen };
  if (mins < mC - lc)   return { kind: 'open',     closesAt: s.mClose };
  if (mins < mC)        return { kind: 'lastCall', closesAt: s.mClose };
  if (mins < aO)        return { kind: 'siesta',   opensAt: s.aOpen };
  if (mins < aC - lc)   return { kind: 'open',     closesAt: s.aClose };
  if (mins < aC)        return { kind: 'lastCall', closesAt: s.aClose };
  return { kind: 'closed', opensAt: nextOpenTime(now) };
}

export function useVenueStatus(): VenueStatus {
  const [status, setStatus] = useState<VenueStatus>(() => compute(new Date()));
  useEffect(() => {
    const id = setInterval(() => setStatus(compute(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return status;
}
