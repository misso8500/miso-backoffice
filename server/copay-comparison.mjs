export function previousCopayMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}
const fields = ['grade', 'rate', 'limit', 'usage', 'copay', 'extra', 'total'];
const value = (row, key) => key === 'total' ? row.sourceTotal ?? row.copay + (row.extra || 0) : key === 'extra' ? row.extra || 0 : key === 'grade' ? String(row.grade).trim().replace(/등급$/, '') : key === 'rate' ? Number(String(row.rate).replace('%', '')) : row[key] ?? null;
export function compareCopayRows(rows, previousRows, previousMonth, hasPreviousMonth) {
  const byId = new Map();
  for (const row of previousRows) if (row.recipientId) byId.set(row.recipientId, [...(byId.get(row.recipientId) || []), row]);
  return rows.map(row => {
    const candidates = byId.get(row.recipientId) || [];
    const status = !row.recipientId ? 'unlinked' : !hasPreviousMonth ? 'no_previous_month' : candidates.length > 1 ? 'ambiguous' : !candidates.length ? 'no_previous_recipient' : 'compared';
    const previous = status === 'compared' ? candidates[0] : null;
    const changes = {};
    if (previous) for (const key of fields) if (value(row, key) !== value(previous, key)) changes[key] = { previous: value(previous, key), current: value(row, key) };
    return { ...row, comparison: { status, previousMonth, changes } };
  });
}
