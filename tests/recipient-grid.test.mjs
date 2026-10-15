import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGridBirthDate, parseSpreadsheetPaste } from "../src/lib/recipient-grid.ts";
import { prepareRecipientBody, prepareDraftRows, sameDraft, visibleCareNumber } from "../server/recipient-drafts.mjs";

test("Excel paste preserves cell order, empty cells, Korean text and quoted line breaks", () => {
  assert.deepEqual(parseSpreadsheetPaste('김미소\t19440510\t\t3\t01012345678\t서울\r\n이미래\t\t\t\t\t부산\r\n'), [
    ["김미소", "19440510", "", "3", "01012345678", "서울"], ["이미래", "", "", "", "", "부산"]
  ]);
  assert.deepEqual(parseSpreadsheetPaste('김미소\t"첫 줄\n둘째 줄"\t"따옴표 ""포함"""'), [["김미소", "첫 줄\n둘째 줄", '따옴표 "포함"']]);
  assert.throws(() => parseSpreadsheetPaste('"닫히지 않음'), /따옴표/);
});

test("birth dates normalize common Excel text formats without changing identifiers", () => {
  for (const value of ["19440510", "1944.5.10", "1944/05/10", "1944-05-10"]) assert.equal(normalizeGridBirthDate(value), "1944-05-10");
  assert.equal(normalizeGridBirthDate(""), "");
  assert.equal(normalizeGridBirthDate("잘못된 값"), "잘못된 값");
});

test("name-only drafts leave personal data empty and keep internal unique numbers out of API views", () => {
  const draft = prepareRecipientBody({ id: "row-a", name: "김미소", isDraft: true });
  assert.equal(draft.birthDate, "");
  assert.equal(draft.address, "");
  assert.equal(visibleCareNumber(draft.longTermCareNumber), "");
  assert.notEqual(draft.longTermCareNumber, prepareRecipientBody({ id: "row-b", name: "김미소", isDraft: true }).longTermCareNumber);
  assert.equal(prepareRecipientBody({ id: "a", name: "김미소" }).isDraft, false);
  assert.throws(() => prepareRecipientBody({ id: "a", isDraft: true, birthDate: "1944-02-30" }), /날짜/);
  assert.throws(() => prepareRecipientBody({ id: "a", isDraft: true, longTermCareNumber: "__draft__:a" }), /인정번호/);
});

test("batch validation rejects invalid sizes, repeated row IDs and care numbers", () => {
  assert.throws(() => prepareDraftRows({ rows: [] }), /100/);
  assert.throws(() => prepareDraftRows({ rows: Array(101).fill({ id: "a" }) }), /100/);
  assert.throws(() => prepareDraftRows({ rows: [{ id: "a" }, { id: "a" }] }), /식별자/);
  assert.throws(() => prepareDraftRows({ rows: [{ id: "a", longTermCareNumber: "L1" }, { id: "b", longTermCareNumber: "L1" }] }), /중복/);
  assert.throws(() => prepareDraftRows({ rows: [{ id: "a", careGrade: "9등급" }] }), /등급/);
  assert.equal(prepareDraftRows({ rows: [{ id: "a", name: "동명이인" }, { id: "b", name: "동명이인" }] }).length, 2);
});

test("retries only match unchanged drafts and never overwrite completed or edited records", () => {
  const input = prepareRecipientBody({ id: "a", name: "김미소", isDraft: true });
  const existing = { ...input, longTermCareNumber: "" };
  assert.equal(sameDraft(existing, input), true);
  assert.equal(sameDraft({ ...existing, name: "수정됨" }, input), false);
  assert.equal(sameDraft({ ...existing, isDraft: false }, input), false);
});
