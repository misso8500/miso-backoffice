import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createSqliteWorkStore, createPostgresWorkStore } from '../server/work-task-stores.mjs';
import { emptyRfidSettings, rfidMonthDates, rfidScheduled } from '../shared/work-rfid.mjs';

test('RFID schedule handles leap months, weekdays, Saturdays, designated dates and service bounds', () => {
  assert.equal(rfidMonthDates('2024-02').length, 29);
  assert.equal(rfidMonthDates('2026-02').length, 28);
  const recipient = { serviceStartDate: '2026-10-03', serviceEndDate: '2026-10-30' }, settings = emptyRfidSettings();
  assert.equal(rfidScheduled('2026-10-02', settings, recipient), false);
  assert.equal(rfidScheduled('2026-10-03', settings, recipient), false);
  assert.equal(rfidScheduled('2026-10-03', { ...settings, pattern: 'monSat' }, recipient), true);
  assert.equal(rfidScheduled('2026-10-04', { ...settings, pattern: 'monSat' }, recipient), false);
  assert.equal(rfidScheduled('2026-10-05', settings, recipient), true);
  assert.equal(rfidScheduled('2026-10-31', { ...settings, pattern: 'monSat' }, recipient), false);
  assert.equal(rfidScheduled('2026-10-04', { ...settings, pattern: 'custom', dates: ['2026-10-04'] }, recipient), true);
});

for (const mode of ['sqlite', 'postgres-adapter']) test(`${mode}: RFID monthly settings and checks persist independently with conflict protection`, async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec("CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,service_start_date TEXT,service_end_date TEXT,enabled INTEGER); INSERT INTO recipients VALUES('a','A','','2000-01-01','2999-12-31',1),('b','B','','','',1);");
  const bridge = { async connect() { return { async query(sql, params = []) {
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)) { db.exec(sql); return { rows: [] }; }
    const values = [], converted = sql.replace(/ FOR UPDATE$/, '').replace(/\$(\d+)/g, (_, n) => { values.push(params[Number(n) - 1]); return '?'; });
    const rows = db.prepare(converted).all(...values); return { rows, rowCount: rows.length };
  }, release() {} }; } };
  if (mode === 'postgres-adapter') db.exec(readFileSync(new URL('../server/work-task-schema.sql', import.meta.url), 'utf8') + readFileSync(new URL('../server/work-journal-schema.sql', import.meta.url), 'utf8'));
  const store = mode === 'sqlite' ? createSqliteWorkStore(db, () => true) : createPostgresWorkStore(bridge, () => true);
  const current = { me: { id: 'tester' } };
  assert.equal((await store.rfidMonth('2000-02')).rows[0].document.version, 0);
  db.prepare("INSERT INTO recipient_service_months VALUES(?, ?, 1, ?, ?)").run('2000-02', '["a"]', 'tester', 'now');
  assert.equal((await store.rfidMonth('2000-02')).rows.find(r => r.id === 'a').selected, true);
  const input = { recipientId: 'a', version: 0, kind: 'settings', settings: { ...emptyRfidSettings(), totalDays: 20, totalHours: 60, pattern: 'custom', dates: ['2000-02-01'], notes: '서비스 내용' } };
  const settings = await store.saveRfid('2000-02', input, current);
  const checked = await store.saveRfid('2000-02', { recipientId: 'a', version: 1, kind: 'day', date: '2000-02-01', checked: true, note: '시간 확인' }, current);
  assert.deepEqual(checked.document.settings, settings.document.settings);
  assert.equal(checked.document.records['2000-02-01'].checked, true);
  assert.equal(checked.document.records['2000-02-01'].updatedBy, 'tester');
  await assert.rejects(async () => store.saveRfid('2000-02', { ...input, version: 1 }, current), { status: 409 });
  const revised = await store.saveRfid('2000-02', { ...input, version: 2, settings: { ...input.settings, totalHours: 65 } }, current);
  assert.equal(revised.document.records['2000-02-01'].note, '시간 확인');
  const reopened = await store.saveRfid('2000-02', { recipientId: 'a', version: 3, kind: 'day', date: '2000-02-01', checked: false, note: '재확인 필요' }, current);
  assert.equal(reopened.document.records['2000-02-01'].checked, false);
  assert.equal((await store.rfidMonth('2000-03')).rows[0].document.version, 0);
  assert.equal((await store.rfidMonth('2000-02')).rows.find(r => r.id === 'b').document.version, 0);
  db.prepare("UPDATE recipients SET enabled=0 WHERE id='a'").run();
  assert.equal((await store.rfidMonth('2000-02')).rows.find(r => r.id === 'a').document.records['2000-02-01'].note, '재확인 필요');
  for (const invalid of [{ ...input, settings: { ...input.settings, totalDays: 30 } }, { ...input, settings: { ...input.settings, dates: ['2000-02-30'] } }, { recipientId: 'a', version: 4, kind: 'day', date: '2000-02-30', checked: true, note: '' }, { recipientId: 'a', version: 4, kind: 'day', date: '2999-02-01', checked: true, note: '' }]) {
    await assert.rejects(async () => store.saveRfid(invalid.date?.startsWith('2999') ? '2999-02' : '2000-02', invalid, current), { status: 400 });
  }
  await assert.rejects(async () => store.saveRfid('2000-02', { ...input, recipientId: 'missing' }, current), { status: 404 });
  db.exec("CREATE TRIGGER reject_rfid BEFORE UPDATE ON work_rfid_months BEGIN SELECT RAISE(ABORT,'rollback'); END");
  await assert.rejects(async () => store.saveRfid('2000-02', { ...input, version: 4 }, current), /rollback/);
  assert.equal((await store.rfidMonth('2000-02')).rows.find(r => r.id === 'a').document.version, 4);
  assert.match(readFileSync(new URL('../server/postgres/schema.sql', import.meta.url), 'utf8'), /ALTER TABLE work_rfid_months ENABLE ROW LEVEL SECURITY/);
});
