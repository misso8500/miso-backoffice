import { test } from "node:test";
import assert from "node:assert/strict";
import { groupEmploymentContracts, formatEmploymentPeriod, isValidEmploymentPeriod } from "../src/lib/employment-contracts.ts";
import { getEmploymentContractStatus, getEmploymentCurrentYear } from "../src/lib/employment-contracts.ts";

const contract = (id, number, start, createdAt = "2026-01-01") => ({
  id, workerName: "동명이인", residentRegistrationNumber: number,
  contractStartDate: start, createdAt
});

test("groups yearly contracts by normalized identity and puts latest start first", () => {
  const old = contract("old", "900101-1234567", "2025-01-01");
  const latest = contract("latest", "9001011234567", "2026-01-01");
  const other = contract("other", "900101-2234567", "2024-01-01");
  const input = [old, other, latest];
  assert.deepEqual(groupEmploymentContracts(input), [[latest, old], [other]]);
  assert.deepEqual(input, [old, other, latest]);
});

test("missing identity does not merge unrelated workers", () => {
  assert.equal(groupEmploymentContracts([
    contract("a", "", "2026-01-01"), contract("b", "", "2026-01-01")
  ]).length, 2);
});

test("ties use creation date and period display handles legacy missing end dates", () => {
  const first = contract("a", "9001011234567", "2026-01-01", "2026-01-02");
  const last = contract("b", "9001011234567", "2026-01-01", "2026-01-03");
  assert.equal(groupEmploymentContracts([first, last])[0][0].id, "b");
  assert.equal(formatEmploymentPeriod({ ...first, contractEndDate: "2026-12-31" }), "20260101~20261231");
  assert.equal(formatEmploymentPeriod(first), "20260101~종료일 미등록");
});

test("requires real calendar dates and chronological periods", () => {
  assert.equal(isValidEmploymentPeriod("2026-01-01", "2026-12-31"), true);
  assert.equal(isValidEmploymentPeriod("2026-01-01", "2026-01-01"), true);
  for (const dates of [["", ""], ["2026-02-30", "2026-12-31"], ["2026-12-31", "2026-01-01"], ["20260101", "20261231"]]) {
    assert.equal(isValidEmploymentPeriod(...dates), false);
  }
});

test("validity follows the current year rather than today's month and day", () => {
  for (const [start, end] of [["2026-01-01", "2026-01-31"], ["2026-12-01", "2026-12-31"], ["2025-12-01", "2027-01-01"]]) {
    assert.deepEqual(getEmploymentContractStatus({ enabled: true, contractStartDate: start, contractEndDate: end }, 2026),
      { valid: true, label: "유효함" });
  }
});

test("other years, disabled contracts and malformed periods are invalid", () => {
  const old = { enabled: true, contractStartDate: "2025-01-01", contractEndDate: "2025-12-31" };
  assert.deepEqual(getEmploymentContractStatus(old, 2026), { valid: false, label: "계약종료/2025년도 건" });
  assert.equal(getEmploymentContractStatus({ ...old, contractStartDate: "2027-01-01", contractEndDate: "2027-12-31" }, 2026).label, "계약종료/2027년도 건");
  assert.deepEqual(getEmploymentContractStatus({ ...old, enabled: false }, 2025), { valid: false, label: "비활성화" });
  assert.equal(getEmploymentContractStatus({ ...old, contractEndDate: "2025-02-30" }, 2025).valid, false);
});

test("legacy open periods belong to their start year and year rollover uses Seoul time", () => {
  const legacy = { enabled: true, contractStartDate: "2025-01-01" };
  assert.equal(getEmploymentContractStatus(legacy, 2025).valid, true);
  assert.equal(getEmploymentContractStatus(legacy, 2026).valid, false);
  assert.equal(getEmploymentCurrentYear(new Date("2025-12-31T14:59:59Z")), 2025);
  assert.equal(getEmploymentCurrentYear(new Date("2025-12-31T15:00:00Z")), 2026);
});
