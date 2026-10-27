export const recurrenceToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function recurrenceDates(rule, month, leaveDates = []) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '1000-01') throw new Error('생성할 월을 확인해 주세요.');
  const [year, number] = month.split('-').map(Number), last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  if (rule.kind === 'monthly') return [`${month}-${String(Math.min(rule.dueDay, last)).padStart(2, '0')}`];
  const dates = [];
  for (let day = 1; day <= last; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`, weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 6 && !rule.includeSaturday || weekday === 0 && !rule.includeSunday || !rule.includeLeave && leaveDates.includes(date)) continue;
    dates.push(date);
  }
  return dates;
}
export function recurrenceTitle(template, date) {
  return template.replaceAll('<YYMMDD>', date.slice(2).replaceAll('-', '')).replaceAll('<YYYYMMDD>', date.replaceAll('-', '')).replaceAll('<YYYY-MM-DD>', date);
}
