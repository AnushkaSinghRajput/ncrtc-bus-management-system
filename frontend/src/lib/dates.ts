/** Local calendar date as YYYY-MM-DD (avoid UTC shift from toISOString). */
export function toLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-start week of 7 local YYYY-MM-DD strings. */
export function weekDateStrings(from: Date = new Date()): string[] {
  const monday = new Date(from);
  const day = from.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(from.getDate() + diff);
  monday.setHours(12, 0, 0, 0); // noon avoids DST edge weirdness
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}
