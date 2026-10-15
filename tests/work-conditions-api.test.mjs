import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";

test("SQLite API persists recipient conditions and history, and rolls back failed saves", { timeout: 20000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "miso-work-conditions-"));
  const databasePath = join(directory, "test.sqlite");
  const authServer = createServer((request, response) => {
    response.writeHead(request.headers.authorization === "Bearer test-token" ? 200 : 401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "test-user", email: "test@example.com", email_confirmed_at: "2026-01-01",
      app_metadata: { provider: "google" }, identities: [{ provider: "google" }], user_metadata: { full_name: "테스트" } }));
  });
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    await new Promise((resolve) => authServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => { authServer.once("error", reject); authServer.listen(0, "127.0.0.1", resolve); });
  // Reserve an available port for the child API; no real app/database is used.
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  child = spawn(process.execPath, ["server/api.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), MISO_BACKOFFICE_DB_PATH: databasePath,
      SUPABASE_URL: `http://127.0.0.1:${authServer.address().port}`, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      AUTH_ALLOWED_EMAILS: "test@example.com" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API startup timed out: ${stderr}`)), 10000);
    child.stdout.on("data", (chunk) => { if (chunk.toString().includes("API running")) { clearTimeout(timer); resolve(); } });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${stderr}`)); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  const call = async (path, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, { method,
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  const recipients = (await call("recipients")).data;
  await t.test("recipient document routes require login and validate recipient, folder and periods", async () => {
    const path = `recipients/${recipients[0].id}/documents`;
    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/${path}`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await call('recipients/missing/documents')).status, 404);
    assert.equal((await call(path)).data.version, null);
    const body = { folderId: 'unapproved_folder_12345', periods: [], pages: [], version: null };
    assert.equal((await call(path, 'PUT', body)).status, 403);
    body.periods = [{ id: 'test', startDate: '2026-02-30', endDate: '2028-01-01' }];
    assert.equal((await call(path, 'PUT', body)).status, 400);
    assert.equal((await call(path)).data.version, null);
  });
  const legacy = (await call("employment-contracts")).data[0];
  assert.ok(legacy && recipients.length >= 2);
  const term = (id) => ({ id, wageType: "시급", wageAmount: 14000, nonTaxableMealAllowance: 0, nonTaxableVehicleAllowance: 0, otherNonTaxablePay: 0 });
  const condition = (termId, recipientId, perVisit) => ({ termId, recipientId, serviceType: "방문요양", familyCare: false,
    matchingStatus: "active", statusDate: "", effectiveStartDate: "2026-01-01", effectiveEndDate: "2026-12-31",
    workDays: "월·수·금", workStartTime: "09:00", workEndTime: "12:00", breakMinutes: 0,
    monthlyHourLimit: 59.5, vehicleSupportPerVisit: perVisit, changeReason: "", documentStatus: "needs_confirmation" });
  const input = { ...legacy, id: "api-work-condition-test", contractStartDate: "2026-01-01", contractEndDate: "2026-12-31",
    insuranceSnapshots: [], contractTerms: [term("test-term-a"), term("test-term-b")],
    workConditions: { monthlyTravelAllowance: 100000, conditions: [condition("test-term-a", recipients[0].id, 20000), condition("test-term-b", recipients[1].id, 0)], history: [] } };
  const created = await call("employment-contracts", "POST", input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  let loaded = await call(`employment-contracts/${input.id}`);
  assert.equal(loaded.data.workConditions.conditions[0].vehicleSupportPerVisit, 20000);
  assert.equal(loaded.data.workConditions.monthlyTravelAllowance, 100000);
  assert.deepEqual(loaded.data.contractTerms.map((item) => item.id), ["test-term-a", "test-term-b"]);
  const stale = structuredClone(loaded.data);
  loaded.data.contractTerms[0].wageAmount = 15000;
  const updated = await call(`employment-contracts/${input.id}`, "PUT", loaded.data);
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.workConditions.history.length, 1);
  assert.equal(updated.data.workConditions.history[0].contractTerms[0].wageAmount, 14000);
  const conflict = await call(`employment-contracts/${input.id}`, "PUT", stale);
  assert.equal(conflict.status, 409);
  assert.match(conflict.data.error, /다른 사용자가/);
  const invalid = structuredClone(updated.data);
  invalid.contractTerms[0].wageAmount = 16000;
  invalid.workConditions.conditions[0].recipientId = "nonexistent-recipient";
  assert.equal((await call(`employment-contracts/${input.id}`, "PUT", invalid)).status, 400);
  loaded = await call(`employment-contracts/${input.id}`);
  assert.equal(loaded.data.workConditions.conditions[0].recipientId, recipients[0].id);
  assert.equal(loaded.data.workConditions.history.length, 1);
  assert.equal(loaded.data.contractTerms[0].wageAmount, 15000);
  const connection = new DatabaseSync(databasePath);
  const persisted = JSON.parse(connection.prepare("SELECT work_conditions FROM employment_contracts WHERE id = ?").get(input.id).work_conditions);
  connection.close();
  assert.equal(persisted.conditions[1].vehicleSupportPerVisit, 0);
  assert.equal(persisted.history.length, 1);

  await t.test("minimal recipient rows can be saved, retried, completed and atomically rejected", async () => {
    const rows = [{ id: "grid-a", name: "기본 이름" }, { id: "grid-b", name: "부분 입력", birthDate: "1944-05-10", phone: "01012345678" }];
    const bulk = await call("recipients/bulk-drafts", "POST", { rows });
    assert.equal(bulk.status, 200, JSON.stringify(bulk.data));
    assert.equal(bulk.data.recipients.length, 2);
    const first = bulk.data.recipients[0];
    assert.equal(first.isDraft, true);
    assert.equal(first.longTermCareNumber, "");
    assert.equal(first.serviceEndDate, "");
    assert.equal((await call("recipients/bulk-drafts", "POST", { rows })).status, 200);
    assert.equal((await call("recipients")).data.filter((item) => item.id === first.id).length, 1);
    const partiallySaved = await call(`recipients/${first.id}`, "PUT", { ...first, address: "추가한 주소" });
    assert.equal(partiallySaved.status, 200, JSON.stringify(partiallySaved.data));
    assert.equal(partiallySaved.data.isDraft, true);
    assert.equal(partiallySaved.data.longTermCareNumber, "");
    assert.equal((await call(`recipients/${first.id}`, "PUT", { ...first, isDraft: false })).status, 400);
    assert.equal((await call(`recipients/${first.id}`)).data.address, "추가한 주소");
    const completed = await call(`recipients/${first.id}`, "PUT", { ...recipients[0], id: first.id, name: first.name,
      isDraft: false, longTermCareNumber: "GRID-COMPLETE-001" });
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal((await call(`recipients/${first.id}`)).data.isDraft, false);
    assert.equal((await call("recipients/bulk-drafts", "POST", { rows })).status, 409);
    const failed = await call("recipients/bulk-drafts", "POST", { rows: [
      { id: "grid-rollback", name: "저장되면 안 됨" },
      { id: "grid-conflict", name: "중복 번호", longTermCareNumber: recipients[0].longTermCareNumber }
    ] });
    assert.equal(failed.status, 409);
    assert.equal((await call("recipients/grid-rollback")).status, 404);
    assert.equal((await call("recipients/grid-conflict")).status, 404);
  });

  await t.test("employment table rows support name-only save, partial conditions, registration and rollback", async () => {
    const rows = [{ id: "employment-grid-a", workerName: "이름만 입력" }, { id: "employment-grid-b", workerName: "기간만 입력", contractStartDate: "2026-01-01" }];
    const saved = await call("employment-contracts/bulk-drafts", "POST", { rows });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const first = saved.data.contracts[0];
    assert.equal(first.isDraft, true);
    assert.equal(first.residentRegistrationNumber, "");
    assert.equal(first.contractStartDate, "");
    assert.equal(first.wageAmount, 0);
    assert.equal((await call("employment-contracts/bulk-drafts", "POST", { rows })).status, 200);
    assert.equal((await call("employment-contracts")).data.filter((item) => item.id === first.id).length, 1);
    const partial = { ...first, workConditions: { monthlyTravelAllowance: 50000, history: [], conditions: [{
      ...condition(first.contractTerms[0].id, "", 20000), matchingStatus: "pending", effectiveStartDate: "", effectiveEndDate: "",
      workDays: "", workStartTime: "", workEndTime: ""
    }] } };
    const updated = await call(`employment-contracts/${first.id}`, "PUT", partial);
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.isDraft, true);
    assert.equal(updated.data.workConditions.monthlyTravelAllowance, 50000);
    assert.equal(updated.data.workConditions.conditions[0].workStartTime, "");
    assert.equal((await call(`employment-contracts/${first.id}`, "PUT", { ...updated.data, isDraft: false })).status, 400);
    const complete = { ...legacy, id: first.id, workerName: first.workerName, isDraft: false, updatedAt: updated.data.updatedAt,
      workplaceType: "office", insuranceSnapshots: [], contractStartDate: "2026-01-01", contractEndDate: "2026-12-31",
      contractTerms: [term("grid-complete-term")], workConditions: { monthlyTravelAllowance: 50000, history: [],
        conditions: [{ ...condition("grid-complete-term", "", 20000), matchingStatus: "pending" }] } };
    const completed = await call(`employment-contracts/${first.id}`, "PUT", complete);
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.isDraft, false);
    assert.equal((await call(`employment-contracts/${first.id}`)).data.workConditions.conditions[0].vehicleSupportPerVisit, 20000);
    assert.equal((await call("employment-contracts/bulk-drafts", "POST", { rows: [
      { id: "employment-grid-rollback", workerName: "취소 대상" }, rows[0]
    ] })).status, 409);
    assert.equal((await call("employment-contracts/employment-grid-rollback")).status, 404);
  });
});
