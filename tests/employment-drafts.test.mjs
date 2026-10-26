import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareEmploymentBody, prepareEmploymentDraftRows, sameEmploymentDraft } from "../server/employment-drafts.mjs";
import { getEmploymentContractStatus, formatEmploymentPeriod } from "../src/lib/employment-contracts.ts";
import { normalizeWorkConditions } from "../server/work-conditions.mjs";

test("name-only contracts keep unknown dates, identity and bank details empty", () => {
  const [row] = prepareEmploymentDraftRows({ rows: [{ id: "a", workerName: "근로자" }] });
  const draft = prepareEmploymentBody(row);
  assert.equal(draft.isDraft, true);
  for (const key of ["residentRegistrationNumber", "primaryBank", "bankAccountNumber", "contractStartDate", "contractEndDate", "workStartTime", "workEndTime"]) assert.equal(draft[key], "");
  assert.equal(draft.wageAmount, 0);
  assert.deepEqual(draft.contractTerms, []);
  assert.equal(prepareEmploymentBody({ workerName: "기존" }).isDraft, false);
});

test("employment batch size, row identity and provided calendar dates are validated", () => {
  for (const rows of [[], Array(101).fill({ id: "a" }), [{ id: "a" }, { id: "a" }]]) assert.throws(() => prepareEmploymentDraftRows({ rows }));
  assert.throws(() => prepareEmploymentBody({ isDraft: true, contractStartDate: "2026-02-30" }), /날짜/);
  assert.equal(prepareEmploymentBody({ isDraft: true, contractStartDate: "2026-01-01" }).contractEndDate, "");
});

test("draft contracts never count as valid even when their period is in the current year", () => {
  assert.deepEqual(getEmploymentContractStatus({ enabled: true, isDraft: true, contractStartDate: "2026-01-01", contractEndDate: "2026-12-31" }, 2026), { valid: false, label: "정보 입력 중" });
  assert.equal(formatEmploymentPeriod({ contractStartDate: "" }), "시작일 미등록~종료일 미등록");
  assert.equal(sameEmploymentDraft({ isDraft: true, workerName: "김근로" }, { workerName: "김근로" }), true);
  assert.equal(sameEmploymentDraft({ isDraft: false, workerName: "김근로" }, { workerName: "김근로" }), false);
  assert.equal(sameEmploymentDraft({ isDraft: true, workerName: "김근로", workerPhone: "변경" }, { workerName: "김근로" }), false);
});

test("incomplete work conditions can be saved as drafts but must be completed before registration", () => {
  const contract = { isDraft: true, contractStartDate: "", contractEndDate: "", contractTerms: [{ id: "t", wageType: "시급", wageAmount: 0 }] };
  const input = { monthlyTravelAllowance: 50000, conditions: [{ termId: "t", recipientId: "", serviceType: "방문요양", familyCare: false,
    matchingStatus: "pending", statusDate: "", effectiveStartDate: "", effectiveEndDate: "", workDays: "", workStartTime: "", workEndTime: "",
    breakMinutes: 0, monthlyHourLimit: 59.5, vehicleSupportPerVisit: 20000, changeReason: "나중에 보완", documentStatus: "needs_confirmation" }] };
  const saved = normalizeWorkConditions(input, contract);
  assert.equal(saved.conditions[0].vehicleSupportPerVisit, 20000);
  assert.equal(saved.conditions[0].workDays, "");
  assert.throws(() => normalizeWorkConditions(input, { ...contract, isDraft: false }), /기간/);
  assert.throws(() => normalizeWorkConditions(undefined, { ...contract, isDraft: false }, { ...contract, workConditions: saved }), /기간/);
});
