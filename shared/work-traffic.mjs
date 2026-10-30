export const trafficLabels = { red: '확인 필요', yellow: '진행 중', green: '점검 완료', idle: '예정' };
export function monthDates(month) {
  const last = new Date(`${month}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
const complete = run => run.steps.length > 0 && run.steps.every(s => s.completedAt);
const overdueRun = (run, today) => run.steps.some(s => !s.completedAt && (s.dueDate ?? run.dueDate ?? run.date) < today);
export function trafficBoard(templates, runs, month, today) {
  const dates = monthDates(month), end = dates.at(-1);
  return templates.map(template => {
    const linked = runs.filter(r => r.templateId === template.id);
    const schedule = template.schedule;
    const revisions = [...(template.scheduleHistory ?? []), { schedule, dueDay: template.dueDay }].filter(r => r.schedule).sort((a,b) => a.schedule.startDate.localeCompare(b.schedule.startDate));
    const configFor = date => revisions.filter(r => r.schedule.startDate <= date).at(-1);
    const expected = dates.filter(date => {
      const config = configFor(date);
      if (!config || config.schedule.enabled === false || template.kind === 'event') return false;
      return template.kind === 'monthly' ? Number(date.slice(-2)) === Math.min(config.dueDay ?? 25, dates.length) : config.schedule.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
    });
    const selected = linked.filter(r => r.date.slice(0, 7) === month || (template.kind === 'event' && r.date < month+'-01' && (!complete(r) || r.steps.some(s => s.completedAt?.slice(0, 10) >= month+'-01'))));
    const cells = dates.map(date => {
      const actual = linked.filter(r => r.date === date);
      const required = expected.includes(date);
      const primaryDone = (template.kind === 'monthly' ? linked.filter(r=>r.date.slice(0,7)===month) : actual).some(r => !r.related.length && complete(r));
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
