export const emptyRfidSettings = () => ({ totalDays: null, totalHours: null, pattern: 'weekdays', dates: [], notes: '' });
export function rfidMonthDates(month) {
  const count = new Date(`${month}-01T12:00:00Z`);
  count.setUTCMonth(count.getUTCMonth() + 1, 0);
  return Array.from({ length: count.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
export function rfidScheduled(date, settings, recipient) {
  if (recipient.serviceStartDate && date < recipient.serviceStartDate || recipient.serviceEndDate && date > recipient.serviceEndDate) return false;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return settings.pattern === 'custom' ? settings.dates.includes(date) : settings.pattern === 'monSat' ? weekday !== 0 : weekday > 0 && weekday < 6;
}
