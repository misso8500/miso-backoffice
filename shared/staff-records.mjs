export function monthDays(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '1000-01') throw Object.assign(new Error('월을 확인해 주세요.'), { status: 400 });
  const [year, number] = month.split('-').map(Number), last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
export function documentDraft(kind, month, profile, executions = []) {
  return { profile: { name: profile.name, organization: profile.organization, jobTitle: profile.jobTitle, startTime: profile.startTime, endTime: profile.endTime, hours: profile.hours }, rows: monthDays(month).map(date => ({ date, reviewed: false, kind: 'pending', start: '', end: '', hours: 0, leaveDays: 1, note: '', signature: '', morning: executions.filter(e => e.date === date && e.period === 'morning').map(e => e.content).join('\n'), afternoon: executions.filter(e => e.date === date && e.period === 'afternoon').map(e => e.content).join('\n'), unknown: executions.filter(e => e.date === date && e.period === 'unknown').map(e => e.content).join('\n'), morningNote: '', afternoonNote: '', other: '' })), imported: executions.map(e => `${e.id}:${e.version}`), kind };
}
export function appendExecutionCandidates(payload, executions) {
  const next = structuredClone(payload), imported = new Set(next.imported ?? []);
  // Changed/voided source records require review; never replace edited text automatically.
  const importedIds = new Set([...imported].map(key => key.split(':')[0]));
  for (const execution of executions) {
    if (importedIds.has(execution.id)) continue;
    const row = next.rows.find(row => row.date === execution.date); if (!row) continue;
    const key = execution.period === 'morning' ? 'morning' : execution.period === 'afternoon' ? 'afternoon' : 'unknown';
    row[key] = [row[key], execution.content].filter(Boolean).join('\n'); row.reviewed = false;
    imported.add(`${execution.id}:${execution.version}`); importedIds.add(execution.id);
  }
  next.imported = [...imported]; return next;
}
export function leaveTotals(granted, openingUsed, plans, attendanceRows = []) {
  const used = new Map(), reserved = new Map();
  for (const row of attendanceRows) if (row.kind === 'leave') used.set(row.date, Math.max(used.get(row.date) ?? 0, row.leaveDays));
  for (const plan of plans) for (const row of plan.dates) {
    const target = plan.status === 'used' ? used : plan.status === 'confirmed' ? reserved : null;
    if (target) target.set(row.date, Math.max(target.get(row.date) ?? 0, row.days));
  }
  const consumed = openingUsed + [...used.values()].reduce((sum, value) => sum + value, 0);
  const planned = [...reserved.entries()].reduce((sum, [date, value]) => sum + Math.max(0, value - (used.get(date) ?? 0)), 0);
  return { granted, used: consumed, remaining: granted - consumed, planned, available: granted - consumed - planned };
}
