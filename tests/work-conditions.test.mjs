import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkConditions } from "../server/work-conditions.mjs";
import { getMatchingSummary, getEmploymentContractStatus } from "../src/lib/employment-contracts.ts";

const term = (id) => ({ id, wageType: "시급", wageAmount: 14000,
  nonTaxableMealAllowance: 0, nonTaxableVehicleAllowance: 0, otherNonTaxablePay: 0 });
const condition = (id, recipientId, patch = {}) => ({ termId: id, recipientId, serviceType: "방문요양", familyCare: false,
  matchingStatus: "active", statusDate: "", effectiveStartDate: "2026-01-01", effectiveEndDate: "2026-12-31",
  workDays: "월·수·금", workStartTime: "09:00", workEndTime: "12:00", breakMinutes: 0,
  monthlyHourLimit: 59.5, vehicleSupportPerVisit: 20000, changeReason: "", documentStatus: "needs_confirmation", ...patch });
const base = { enabled: true, contractStartDate: "2026-01-01", contractEndDate: "2026-12-31", contractTerms: [term("a"), term("b")] };
const input = () => ({ monthlyTravelAllowance: 100000, conditions: [condition("a", "recipient-a"), condition("b", "recipient-b", { vehicleSupportPerVisit: 0, familyCare: true })] });

test("recipient-specific per-visit support and worker monthly travel allowance remain separate", () => {
  const result = normalizeWorkConditions(input(), base);
  assert.equal(result.monthlyTravelAllowance, 100000);
  assert.equal(result.conditions[0].vehicleSupportPerVisit, 20000);
  assert.equal(result.conditions[1].vehicleSupportPerVisit, 0);
  assert.equal(result.conditions[1].familyCare, true);
  assert.deepEqual(result.history, []);
});

test("unmatched contracts can be saved without a recipient, matched ones require one", () => {
  const data = input();
  data.conditions[0].recipientId = "";
  assert.throws(() => normalizeWorkConditions(data, base), /수급자/);
  data.conditions[0].matchingStatus = "pending";
  assert.equal(normalizeWorkConditions(data, base).conditions[0].recipientId, "");
});

test("rejects invalid periods, statuses, work times, amounts and overlapping recipient conditions", () => {
  for (const patch of [
    { effectiveStartDate: "2025-12-31" }, { effectiveEndDate: "2026-02-30" },
    { matchingStatus: "paused", statusDate: "" }, { statusDate: "2027-01-01" },
    { workStartTime: "25:00" }, { workEndTime: "08:00" }, { breakMinutes: 180 },
    { monthlyHourLimit: 0 }, { monthlyHourLimit: 745 }, { vehicleSupportPerVisit: -1 },
    { vehicleSupportPerVisit: 1.5 }, { familyCare: "false" }, { documentStatus: "wrong" }
  ]) {
    const data = input(); data.conditions[0] = { ...data.conditions[0], ...patch };
    assert.throws(() => normalizeWorkConditions(data, base), JSON.stringify(patch));
  }
  const data = input(); data.conditions[1].recipientId = "recipient-a";
  assert.throws(() => normalizeWorkConditions(data, base), /겹칩니다/);
  data.conditions[0].effectiveEndDate = "2026-06-30";
  data.conditions[1].effectiveStartDate = "2026-07-01";
  assert.equal(normalizeWorkConditions(data, base).conditions.length, 2);
});

test("history is generated server-side, captures old wages and does not grow on unchanged saves", () => {
  const existing = { ...base, workConditions: normalizeWorkConditions(input(), base) };
  const changed = { ...base, contractTerms: [ { ...term("a"), wageAmount: 15000 }, term("b") ] };
  const data = input(); data.history = [{ forged: true }];
  const result = normalizeWorkConditions(data, changed, existing);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].contractTerms[0].wageAmount, 14000);
  assert.equal(result.history[0].conditions[0].vehicleSupportPerVisit, 20000);
  const saved = { ...changed, workConditions: result };
  assert.equal(normalizeWorkConditions(data, changed, saved).history.length, 1);
  assert.equal(normalizeWorkConditions(undefined, base, existing), existing.workConditions);
});

test("matching counts distinct currently active recipients and observes pause/end effective dates", () => {
  const data = input();
  const contract = { ...base, workConditions: normalizeWorkConditions(data, base) };
  assert.equal(getMatchingSummary(contract, "2026-10-13").count, 2);
  contract.workConditions.conditions[0].matchingStatus = "paused";
  contract.workConditions.conditions[0].statusDate = "2026-10-15";
  assert.equal(getMatchingSummary(contract, "2026-10-14").count, 2);
  assert.equal(getMatchingSummary(contract, "2026-10-15").count, 1);
  assert.match(getMatchingSummary(contract, "2026-10-15").review, /中断|중단/);
  assert.equal(getMatchingSummary(contract, "2027-01-01").count, 0);
});

test("year-valid but unmatched rich contracts are held outside operational valid list", () => {
  const data = input(); data.conditions.forEach((item) => { item.recipientId = ""; item.matchingStatus = "pending"; });
  const currentYear = new Date().getFullYear();
  const contract = { ...base, contractStartDate: `${currentYear}-01-01`, contractEndDate: `${currentYear}-12-31`,
    workConditions: normalizeWorkConditions(data, base) };
  assert.deepEqual(getEmploymentContractStatus(contract, currentYear), { valid: false, label: "매칭 대기" });
  assert.equal(getMatchingSummary(base).label, "매칭 정보 확인 필요");
});
