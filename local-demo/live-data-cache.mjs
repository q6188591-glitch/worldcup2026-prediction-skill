function scheduleStartAt(dateText, year = 2026) {
  const parts = String(dateText || "").match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!parts) return null;
  const [, month, day, hour, minute] = parts.map(Number);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function filterUpcomingMatches(matches, now = new Date()) {
  return (Array.isArray(matches) ? matches : [])
    .filter((match) => {
      if (match?.status === "FT") return false;
      const startsAt = scheduleStartAt(match?.date);
      return startsAt ? startsAt.getTime() > now.getTime() : false;
    })
    .sort((a, b) => scheduleStartAt(a.date) - scheduleStartAt(b.date));
}

export function selectScheduleMatches(liveMatches, cachedMatches, now = new Date()) {
  const live = filterUpcomingMatches(liveMatches, now);
  return live.length ? live : filterUpcomingMatches(cachedMatches, now);
}
