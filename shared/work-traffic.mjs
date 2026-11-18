export const trafficLabels = { red: '확인 필요', yellow: '진행 중', green: '점검 완료', idle: '예정' };
export function monthDates(month) {
  const last = new Date(`${month}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
const complete = run => run.steps.length > 0 && run.steps.every(s => s.completedAt);
export function isTrafficRunVisible(run, kind, month) {
  const start = month + '-01';
  return run.date.slice(0, 7) === month || (kind === 'event' && run.date < start &&
    (!complete(run) || run.steps.some(step => step.completedAt?.slice(0, 10) >= start)));
}
const overdueRun = (run, today) => run.steps.some(s => !s.completedAt && (s.dueDate ?? run.dueDate ?? run.date) < today);
export function trafficBoard(templates, runs, month, today) {
  const dates = monthDates(month), end = dates.at(-1);
  const runsByTemplate = new Map();
  for (const run of runs) {
    if (!runsByTemplate.has(run.templateId)) runsByTemplate.set(run.templateId, []);
    runsByTemplate.get(run.templateId).push(run);
  }
  return templates.map(template => {
    const linked = runsByTemplate.get(template.id) ?? [];
    const schedule = template.schedule;
    const revisions = [...(template.scheduleHistory ?? []), { schedule, dueDay: template.dueDay }].filter(r => r.schedule).sort((a,b) => a.schedule.startDate.localeCompare(b.schedule.startDate));
    const configFor = date => revisions.filter(r => r.schedule.startDate <= date).at(-1);
    const expected = dates.filter(date => {
      const config = configFor(date);
      if (!config || config.schedule.enabled === false || template.kind === 'event') return false;
      return template.kind === 'monthly' ? Number(date.slice(-2)) === Math.min(config.dueDay ?? 25, dates.length) : config.schedule.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
    });
    const selected = linked.filter(r => isTrafficRunVisible(r, template.kind, month));
    const runsByDate = new Map();
    for (const run of selected) {
      if (!runsByDate.has(run.date)) runsByDate.set(run.date, []);
      runsByDate.get(run.date).push(run);
    }
    const monthlyDone = template.kind === 'monthly' && selected.some(r => !r.related.length && complete(r));
    const cells = dates.map(date => {
      const actual = runsByDate.get(date) ?? [];
      const required = expected.includes(date);
      const primaryDone = monthlyDone || (template.kind !== 'monthly' && actual.some(r => !r.related.length && complete(r)));
      const missing = required && !primaryDone;
      const pending = actual.some(r => !complete(r));
      const missingOverdue = missing && date < today && !actual.some(r => (r.dueDate ?? r.date) >= today);
      const state = missingOverdue || actual.some(r => overdueRun(r,today)) ? 'red' : (pending && date <= today) || (missing && date === today) ? 'yellow' : actual.length && !pending && !missing ? 'green' : 'idle';
      return { date, state, required, completed: required ? primaryDone : actual.length > 0 && actual.every(complete), runIds: actual.map(r => r.id) };
    });
    const due = expected.filter(d => d <= today);
    const completed = cells.filter(c => c.required && c.completed && c.date <= today).length;
    const overdue = cells.some(c => c.state === 'red') || selected.some(r => overdueRun(r,today));
    const allRunsDone = selected.filter(r => r.date <= today || r.kind === 'monthly').every(complete);
    const state = overdue ? 'red' : (due.length > completed || !allRunsDone) ? 'yellow' : (due.length > 0 || selected.length > 0) && month <= today.slice(0,7) ? 'green' : 'idle';
    return { template, state, expected: expected.length, due: due.length, completed, runs: selected, cells, asOf: today > end ? end : today };
  });
}
