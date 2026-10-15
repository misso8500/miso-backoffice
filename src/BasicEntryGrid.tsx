import { useState, type ClipboardEvent } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { saveRecipientDraftRows, saveEmploymentDraftRows, type RecipientDraftRow, type EmploymentDraftRow } from "./storage";
import type { Recipient, EmploymentContract } from "./types";
import { normalizeGridBirthDate, parseSpreadsheetPaste, recipientGridColumns } from "./lib/recipient-grid";

type EntryRow = RecipientDraftRow & EmploymentDraftRow;
const employmentColumns = ["workerName", "residentRegistrationNumber", "workerPhone", "primaryBank", "bankAccountNumber", "contractStartDate", "contractEndDate"] as const;
const newRow = (): EntryRow => ({ id: crypto.randomUUID(), name: "", birthDate: "", longTermCareNumber: "", careGrade: "", phone: "", address: "",
  workerName: "", residentRegistrationNumber: "", workerPhone: "", primaryBank: "", bankAccountNumber: "", contractStartDate: "", contractEndDate: "" });
export default function BasicEntryGrid({ existing = [], existingContracts = [], mode = "recipients", onSaved, onContractsSaved, onClose }: {
  existing?: Recipient[]; existingContracts?: EmploymentContract[]; mode?: "recipients" | "employment";
  onSaved?: (recipients: Recipient[]) => void; onContractsSaved?: (contracts: EmploymentContract[]) => void; onClose: () => void;
}) {
  const employment = mode === "employment";
  const columns = employment ? employmentColumns : recipientGridColumns;
  const labels = employment ? ["근로자 이름 *", "주민번호", "연락처", "은행", "계좌번호", "계약 시작일", "계약 종료일"]
    : ["이름 *", "생년월일", "장기요양인정번호", "등급", "연락처", "주소"];
  const unit = employment ? "건" : "명";
  const [rows, setRows] = useState<EntryRow[]>(() => Array.from({ length: 10 }, newRow));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const filled = rows.filter((row) => columns.some((field) => row[field].trim()));
  const close = () => { if (!saving && (!filled.length || window.confirm("아직 저장하지 않은 표 내용이 있습니다. 닫을까요?"))) onClose(); };
  const change = (id: string, field: typeof columns[number], value: string) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setErrors((current) => ({ ...current, [id]: "" })); setMessage("");
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    try {
      const pasted = parseSpreadsheetPaste(text);
      if (rowIndex + pasted.length > 100) throw new Error("한 번에 최대 100행까지 입력할 수 있습니다.");
      if (pasted.some((row) => row.length + columnIndex > columns.length)) throw new Error(`복사한 열이 표보다 많습니다. ${columns.length}개 열의 순서를 확인해 주세요.`);
      setRows((current) => {
        const next = current.map((row) => ({ ...row }));
        while (next.length < rowIndex + pasted.length) next.push(newRow());
        pasted.forEach((row, offset) => row.forEach((value, column) => { next[rowIndex + offset][columns[columnIndex + column]] = value; }));
        return next;
      });
      setErrors({}); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "붙여넣기를 확인해 주세요."); }
  };
  const save = async () => {
    const problems: Record<string, string> = {};
    const numbers = new Set<string>();
    const normalized = filled.map((row) => {
      const next = { ...row };
      columns.forEach((field) => { next[field] = row[field].trim(); });
      if (employment) {
        next.contractStartDate = normalizeGridBirthDate(next.contractStartDate);
        next.contractEndDate = normalizeGridBirthDate(next.contractEndDate);
        const digits = next.residentRegistrationNumber.replace(/[-\s]/g, "");
        if (!next.workerName) problems[row.id] = "근로자 이름을 입력해 주세요.";
        else if (digits && !/^\d{7}(\d{6})?$/.test(digits)) problems[row.id] = "주민번호는 앞 7자리 또는 전체 13자리를 입력해 주세요.";
        else if ([next.contractStartDate, next.contractEndDate].some((date) => date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))) problems[row.id] = "계약 날짜를 확인해 주세요. 예: 20260101";
        else if (next.contractStartDate && next.contractEndDate && next.contractStartDate > next.contractEndDate) problems[row.id] = "종료일은 시작일보다 빠를 수 없습니다.";
        if (digits) next.residentRegistrationNumber = `${digits.slice(0, 6)}-${digits.slice(6)}`;
        return next;
      }
      next.birthDate = normalizeGridBirthDate(next.birthDate);
      if (/^[1-5]$/.test(next.careGrade)) next.careGrade += "등급";
      if (!next.name) problems[row.id] = "이름을 입력해 주세요.";
      else if (next.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(next.birthDate) || !Number.isFinite(Date.parse(next.birthDate)) || new Date(next.birthDate).toISOString().slice(0, 10) !== next.birthDate)) problems[row.id] = "생년월일을 확인해 주세요. 예: 19440510";
      else if (next.careGrade && !["1등급", "2등급", "3등급", "4등급", "5등급", "인지지원등급"].includes(next.careGrade)) problems[row.id] = "등급은 1~5 또는 인지지원등급으로 입력해 주세요.";
      else if (next.longTermCareNumber && (numbers.has(next.longTermCareNumber) || existing.some((recipient) => recipient.longTermCareNumber === next.longTermCareNumber && recipient.id !== row.id))) problems[row.id] = "인정번호가 다른 행 또는 기존 수급자와 중복됩니다.";
      if (next.longTermCareNumber) numbers.add(next.longTermCareNumber);
      return next;
    });
    setErrors(problems);
    if (Object.keys(problems).length) { setMessage("표시된 행을 확인한 뒤 다시 저장해 주세요. 아직 저장되지 않았습니다."); return; }
    if (!normalized.length) { setMessage("이름을 한 명 이상 입력해 주세요."); return; }
    setSaving(true); setMessage("");
    try {
      if (employment) onContractsSaved?.(await saveEmploymentDraftRows(normalized));
      else onSaved?.(await saveRecipientDraftRows(normalized));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다."); }
    finally { setSaving(false); }
  };

  return <div className="detail-backdrop recipient-grid-backdrop">
    <section className="recipient-grid-panel" role="dialog" aria-modal="true" aria-labelledby="recipient-grid-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key === "Tab") {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="recipient-grid-header"><div><h2 id="recipient-grid-title">{employment ? "근로계약 표 입력" : "수급자 표 입력"}</h2>
        <p>이름만 입력해도 저장됩니다. 나머지는 아는 만큼 입력하고 상세 화면에서 보완해 주세요.</p></div>
        <button type="button" className="icon-button" disabled={saving} aria-label="표 입력 닫기" onClick={close}><X size={22} /></button></header>
      <p className="condition-note">엑셀의 제목 행을 제외하고 복사한 뒤 첫 셀에 붙여넣을 수 있습니다. 열 순서는 {labels.map((label) => label.replace(" *", "")).join(" → ")}입니다. Tab 키로 다음 칸으로 이동합니다.</p>
      <p className="condition-note">연락처·계좌·식별번호는 엑셀에서 텍스트 형식으로 관리해 앞자리 0이 사라지지 않게 해 주세요. 비어 있는 행은 저장하지 않습니다.</p>
      {message && <p className="form-error" role="alert">{message}</p>}
      <fieldset disabled={saving} className="recipient-grid-fields">
        <div className="recipient-grid-scroll"><table className="recipient-input-table"><thead><tr><th scope="col">행</th>
          {labels.map((label) => <th key={label} scope="col">{label}</th>)}<th scope="col">확인 / 삭제</th></tr></thead>
          <tbody>{rows.map((row, rowIndex) => {
            const similar = employment
              ? row.workerName.trim() && existingContracts.some((contract) => contract.workerName === row.workerName.trim() && contract.id !== row.id)
              : row.name.trim() && existing.some((recipient) => recipient.name === row.name.trim() && recipient.id !== row.id);
            return <tr key={row.id} className={errors[row.id] ? "has-error" : ""}><th scope="row">{rowIndex + 1}</th>
              {columns.map((field, columnIndex) => <td key={field}><input autoFocus={rowIndex === 0 && columnIndex === 0}
                aria-label={`${rowIndex + 1}행 ${labels[columnIndex]}`} aria-invalid={Boolean(errors[row.id])}
                value={row[field]} placeholder={field === "birthDate" ? "19440510" : field === "careGrade" ? "3등급" : field.startsWith("contract") ? "20260101" : undefined}
                onChange={(event) => change(row.id, field, event.target.value)} onPaste={(event) => paste(event, rowIndex, columnIndex)} /></td>)}
              <td><div className="recipient-grid-row-tools"><small>{errors[row.id] || (similar ? employment ? "같은 이름의 계약이 있습니다. 추가 계약인지 확인해 주세요." : "같은 이름이 있습니다. 동명이인인지 확인해 주세요." : "")}</small>
                <button type="button" className="icon-button" aria-label={`${rowIndex + 1}행 삭제`} onClick={() => setRows((current) => current.length === 1 ? [newRow()] : current.filter((item) => item.id !== row.id))}><Trash2 size={15} /></button></div></td>
            </tr>;
          })}</tbody></table></div>
        <button type="button" className="secondary-button" disabled={rows.length >= 100} onClick={() => setRows((current) => [...current, ...Array.from({ length: Math.min(10, 100 - current.length) }, newRow)])}><Plus size={16} /> 10행 추가</button>
      </fieldset>
      <footer className="recipient-grid-footer"><span>{filled.length}{unit} 입력 · 저장 후 ‘정보 입력 중’으로 표시됩니다.</span>
        <button type="button" className="secondary-button" disabled={saving} onClick={close}>취소</button>
        <button type="button" className="primary-button" disabled={saving || !filled.length} onClick={() => void save()}><Save size={17} />{saving ? "저장 중…" : `${filled.length}${unit} 저장`}</button>
      </footer>
    </section>
  </div>;
}
