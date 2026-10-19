const minimum = '1000-01-01', maximum = '9999-12-31';
const iso = date => {
  if (date.getUTCFullYear() < 1000) return minimum;
  if (date.getUTCFullYear() > 9999) return maximum;
  return date.toISOString().slice(0, 10);
};
const parse = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < minimum || value > maximum || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('날짜를 확인해 주세요.');
  return new Date(value+'T12:00:00Z');
};
const shift = (value, days) => { const date = parse(value); date.setUTCDate(date.getUTCDate()+days); return iso(date); };
export function workCalendarRange(value, mode) {
  const date = parse(value);
  if (mode === 'day') return { from: value, to: value, dates: [value] };
  if (!['week','month'].includes(mode)) throw new Error('보기 방식을 확인해 주세요.');
  if (mode === 'month') date.setUTCDate(1);
  date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  const dates = [];
  for (let i = 0; i < (mode === 'week' ? 7 : 42); i++) {
    const next = new Date(date); next.setUTCDate(next.getUTCDate()+i);
    if (next.getUTCFullYear() >= 1000 && next.getUTCFullYear() <= 9999) dates.push(iso(next));
  }
  return { from: dates[0], to: dates.at(-1), dates };
}
export function moveWorkCalendar(value, mode, direction) {
  if (![-1,1].includes(direction)) throw new Error('이동 방향을 확인해 주세요.');
  const date = parse(value);
  if (mode === 'day' || mode === 'week') return shift(value, direction*(mode === 'week' ? 7 : 1));
  if (mode !== 'month') throw new Error('보기 방식을 확인해 주세요.');
  const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+direction);
  if (date.getUTCFullYear() < 1000) return minimum;
  if (date.getUTCFullYear() > 9999) return maximum;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return iso(date);
}
export function workAssigneeInitial(name) {
  if (!name) return '?';
  const code = name.codePointAt(0);
  return code >= 0xac00 && code <= 0xd7a3 ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((code-0xac00)/588)] : [...name][0];
}

// Collapse record kinds across the displayed week, rather than per date.
// Actual work by one colleague must not hide another colleague's plan.
export function weeklyWorkRecords(data) {
  const executions = data.executions.filter(e => e.status === 'recorded');
  const performed = new Set(executions.filter(e => e.taskId).map(e => JSON.stringify([e.taskId, e.assigneeId])));
  const plans = data.plans.filter(p => p.status === 'planned' && !performed.has(JSON.stringify([p.taskId, p.assigneeId])));
  const scheduled = new Set([...plans, ...executions].map(row => row.taskId).filter(Boolean));
  return { plans, executions, deadlines: data.deadlines.filter(task => !scheduled.has(task.id)) };
}
