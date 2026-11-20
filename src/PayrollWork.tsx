import { useState } from 'react';
import { blankWorkInputs, blankWorkRow, classifyWorkRow, contractWorkTypes, coversWorkPeriod, payrollBirth, readPayrollWizard, reviewWorkRows, sameWorkType, workKey, workMatches, type WorkRow } from './lib/payroll-work';
import type { EmploymentContract, Recipient } from './types';

const maxRows = 5000;
const pageSize = 100;
export type ServiceRosterRow = {
  id: string; name: string; checked: boolean;
  workers?: { workerId: string; workerName?: string; birthDate?: string; serviceType: string }[];
};

type Props = {
  month: string; rows: WorkRow[]; contracts: EmploymentContract[]; recipients: Recipient[];
  roster: ServiceRosterRow[] | null; initialQuery: string; onReview: () => void; onChange: (rows: WorkRow[]) => void; onBusy: (busy: boolean) => void;
};

export default function PayrollWork({ month, rows, contracts, recipients, roster, initialQuery, onReview, onChange, onBusy }: Props) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readPayrollWizard>> | null>(null);
  const [paste, setPaste] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [rowCount, setRowCount] = useState('1');
  const [page, setPage] = useState(0);
  const count = Number(rowCount);
  const remaining = maxRows - rows.length;
  const match = (row: WorkRow) => classifyWorkRow(row, month, contracts, recipients);
  const patch = (id: string, value: Partial<WorkRow>) =>
    onChange(rows.map(row => row.id === id ? { ...row, ...value } : row));
  const existingSources = new Set(rows.map(row => row.source).filter(Boolean));
  const importRows = preview?.rows.filter(row => !existingSources.has(row.source)) ?? [];
  const monthMismatch = preview && [preview.sheetMonth, preview.titleMonth].some(key => key && key !== month);
  const { reviewed } = reviewWorkRows(rows, month, contracts, recipients);
  const pending = reviewed.filter(item => item.issue).length;
  const shown = reviewed.filter(({ row, issue }) => (!onlyIssues || issue) &&
    `${row.recipient} ${row.worker}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * pageSize;
  const editor = reviewed.find(item => item.row.id === selected);
  const serviceRows = roster?.filter(item => item.checked) ?? [];
  const missingWorkers = serviceRows.filter(item => !item.workers?.length);
  const existing = new Set(rows.map(workKey));
  const candidates = serviceRows.flatMap(person => (person.workers ?? []).map(worker => {
    const contract = contracts.find(item => item.id === worker.workerId);
    const recipient = recipients.find(item => item.id === person.id);
    const row = { ...blankWorkRow(), recipientId: person.id, recipient: recipient?.name ?? person.name,
      worker: contract?.workerName ?? worker.workerName ?? '', birth: payrollBirth(contract?.workerBirthDate ?? worker.birthDate ?? ''),
      care: worker.serviceType };
    const types = contract && contractWorkTypes(contract, row, month, recipient);
    const type = types && types.find(type => sameWorkType(type, row.care));
    return match({ ...row, care: type || row.care });
  })).filter(row => {
    const key = workKey(row);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  function append(newRows: WorkRow[]) {
    if (newRows.length > remaining) {
      setMessage('귀속월별로 최대 5,000행을 저장할 수 있습니다.');
      return false;
    }
    onChange([...rows, ...newRows]);
    setPage(Math.floor(rows.length / pageSize));
    setMessage(`${newRows.length}행을 추가했습니다.`);
    return true;
  }
  function addImports(newRows: WorkRow[]) {
    const imported = newRows.map(match);
    const replacements = new Map<string, WorkRow>();
    const added = imported.filter(row => {
      const placeholder = rows.find(item => !item.source && !item.date && !item.fixed && item.minutes === null &&
        item.holiday === null && !item.inputs && item.longevityEligible == null && item.intensiveEligible == null &&
        !replacements.has(item.id) && workKey(item) === workKey(row));
      if (!placeholder) return true;
      replacements.set(placeholder.id, { ...row, id: placeholder.id });
      return false;
    });
    if (added.length > remaining) {
      setMessage('귀속월별로 최대 5,000행을 저장할 수 있습니다.');
      return;
    }
    onChange([...rows.map(row => replacements.get(row.id) ?? row), ...added]);
    setPreview(null);
    setMessage(`${added.length}건 추가 · 기존 빈 기록 ${replacements.size}건 채움`);
  }
  async function importFile(file: File) {
    setMessage(''); setPreview(null); onBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 xlsx 파일을 선택해 주세요.');
      setPreview(await readPayrollWizard(await file.arrayBuffer(), month));
    } catch (error) { setMessage(error instanceof Error ? error.message : '엑셀을 읽지 못했습니다.'); }
    finally { onBusy(false); }
  }

  function addPasted() {
    const lines = paste.trim().split(/\r?\n/).filter(line => line.trim());
    const newRows: WorkRow[] = [];
    for (const line of lines) {
      const [date = '', recipient = '', worker = '', birth = '', care = '', regular = '', holiday = ''] = line.split('\t').map(value => value.trim());
      if (date === '근무일') continue;
      const numbers = [regular, holiday].map(value => value === '' ? null : Number(value));
      if (!date.startsWith(month + '-') || !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date || !recipient || !worker ||
          numbers.some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 1440)) ||
          (numbers[0] ?? 0) + (numbers[1] ?? 0) > 1440) {
        setMessage('붙여넣을 행의 근무일, 수급자, 요양보호사와 분 단위 시간을 확인해 주세요.');
        return;
      }
      newRows.push(match({ ...blankWorkRow(), date, recipient, worker, birth: payrollBirth(birth), care, minutes: numbers[0], holiday: numbers[1] }));
    }
    if (newRows.length && append(newRows)) setPaste('');
  }

  return <section className="payroll-work">
    <>
      <header className="payroll-stage-heading">
        <div><h2>서비스 시간 확인</h2><p>수급자와 담당 요양보호사를 불러온 뒤 실제 제공 시간을 입력하세요.</p></div>
        <button type="button" className="primary-button" disabled={!rows.length} onClick={onReview}>급여 검토로 이동</button>
      </header>
      <div className="payroll-actions payroll-stage-toolbar">
        <button type="button" className="secondary-button" disabled={!candidates.length} onClick={() => append(candidates)}>
          월 서비스 대상 불러오기{candidates.length ? ` (${candidates.length}건)` : ''}
        </button>
        <button type="button" className="secondary-button" disabled={!remaining} onClick={() => {
          const row = blankWorkRow();
          if (append([row])) setSelected(row.id);
        }}>직접 추가</button>
        <details className="payroll-import"><summary>엑셀·여러 행 추가</summary>
          <label>급여마법사 가져오기<input type="file" accept=".xlsx" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (file) void importFile(file);
          }} /></label>
          <div className="payroll-actions">
            <label>추가할 행 수<input type="number" min={1} max={Math.max(1, remaining)} step={1} value={rowCount}
              onChange={event => setRowCount(event.target.value)} /></label>
            <button type="button" className="secondary-button" disabled={!Number.isSafeInteger(count) || count < 1 || count > remaining}
              onClick={() => append(Array.from({ length: count }, blankWorkRow))}>근무 행 추가</button>
          </div>
        </details>
      </div>
      {roster === null && <p role="status">월 서비스 대상 목록을 불러오지 못했습니다. 엑셀 또는 직접 입력으로 계속할 수 있습니다.</p>}
      {!!missingWorkers.length && <details className="payroll-source"><summary>담당 요양보호사 미연결 {missingWorkers.length}건</summary>
        <p>{missingWorkers.map(item => item.name).join(', ')}</p><p>방문요양 서비스 관리에서 요양보호사를 연결하거나 직접 추가하세요.</p>
      </details>}
      {preview && <div className="payroll-source">
        <p>{preview.sheet} · 가져올 행 {importRows.length}개 · 이미 가져온 행 {preview.rows.length - importRows.length}개</p>
        {monthMismatch && <p role="alert">귀속월 {month} · 시트명 {preview.sheetMonth || '미표기'} · 본문 {preview.titleMonth || '미표기'}. 적용할 귀속월을 확인해 주세요.</p>}
        <div className="payroll-actions">
          <button type="button" className="primary-button" disabled={!importRows.length} onClick={() => {
            addImports(importRows);
          }}>{monthMismatch ? `${month} 귀속월로 가져오기` : '시간표에 가져오기'}</button>
          <button type="button" className="secondary-button" onClick={() => setPreview(null)}>닫기</button>
        </div>
      </div>}
      <details className="payroll-source">
        <summary>엑셀 행 붙여넣기</summary>
        <label>근무일(YYYY-MM-DD), 수급자, 요양보호사, 생년월일, 요양구분, 일반(분), 휴일(분) 순서로 붙여넣기
          <textarea rows={3} value={paste} onChange={event => setPaste(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" disabled={!paste.trim()} onClick={addPasted}>붙여넣은 행 추가</button>
      </details>
    </>
    {message && <p role="status">{message}</p>}
    <div className="payroll-list-tools">
      <label>수급자·요양보호사 검색<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <label className="payroll-inline"><input type="checkbox" checked={onlyIssues} onChange={event => { setOnlyIssues(event.target.checked); setPage(0); }} />확인 필요만</label>
      <span aria-live="polite">반영 가능 {rows.length - pending}건 · 확인 필요 {pending}건</span>
    </div>
    <div className="payroll-table payroll-compact"><table>
      <caption className="payroll-visually-hidden">{month} 서비스 시간 확인</caption>
      <thead><tr><th scope="col">수급자</th><th scope="col">요양보호사</th><th scope="col">근무시간(분)</th><th scope="col">확인 상태</th><th scope="col">상세</th></tr></thead>
      <tbody>{shown.slice(firstIndex, firstIndex + pageSize).map(({ row, issue }) =>
        <tr key={row.id} className={selected === row.id ? 'is-selected' : undefined}>
          <th scope="row">{row.recipient || '미선택'}<small>{row.date || '월 합계'}</small></th>
          <td>{row.worker || '미선택'}{row.care && <small>{row.care}</small>}</td>
          <td>{row.fixed ? '고정급' : <input data-payroll-time type="number" min={0} step={1} placeholder="미입력"
            aria-label={`${row.recipient || '수급자 미선택'} ${row.worker || '요양보호사 미선택'} ${row.date || '월 합계'} 근무시간(분)`}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.currentTarget.closest('tr')?.nextElementSibling?.querySelector<HTMLInputElement>('[data-payroll-time]')?.focus();
            }}
            value={row.minutes ?? ''} onChange={event => {
              const value = event.target.valueAsNumber;
              if (!event.target.value) patch(row.id, { minutes: null });
              else if (Number.isSafeInteger(value) && value >= 0 && value <= 9999999999) patch(row.id, { minutes: value });
            }} />}{row.source && <small>엑셀 합계</small>}{!!row.holiday && <small>휴일 {row.holiday}분</small>}</td>
          <td><span className={`payroll-status ${issue ? 'is-pending' : ''}`}>{issue || '반영 가능'}</span></td>
          <td><button type="button" className="secondary-button" aria-expanded={selected === row.id} onClick={() => setSelected(selected === row.id ? '' : row.id)}>상세</button></td>
        </tr>
      )}{!shown.length && <tr><td colSpan={5}>{rows.length ? '조건에 맞는 기록이 없습니다.' : '월 서비스 대상을 불러오거나 엑셀에서 근무 기록을 추가하세요.'}</td></tr>}</tbody>
    </table></div>
    {pageCount > 1 && <div className="payroll-actions">
      <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button>
      <span>{firstIndex + 1}–{Math.min(firstIndex + pageSize, shown.length)} / {shown.length}건</span>
      <button type="button" className="secondary-button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>다음</button>
    </div>}
    {editor && <WorkDetails key={editor.row.id} month={month} row={editor.row} contracts={contracts} recipients={recipients}
      onChange={value => patch(editor.row.id, value)} onClose={() => setSelected('')}
      onRemove={() => { onChange(rows.filter(row => row.id !== editor.row.id)); setSelected(''); }} />}
  </section>;
}

function WorkDetails({ month, row, contracts, recipients, onChange, onClose, onRemove }: {
  month: string; row: WorkRow; contracts: EmploymentContract[]; recipients: Recipient[];
  onChange: (value: Partial<WorkRow>) => void; onClose: () => void; onRemove: () => void;
}) {
  const person = recipients.find(item => item.id === row.recipientId);
  const contract = contracts.find(item => item.id === row.contractId);
  const period = row.date || month;
  const choices = contracts.filter(item => !item.isDraft && item.contractStartDate &&
    coversWorkPeriod(item.contractStartDate, item.contractEndDate, period));
  const linked = choices.filter(item => contractWorkTypes(item, row, month, person).length > 0);
  const lastDay = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;
  function update(next: Partial<WorkRow>) {
    const draft = { ...row, ...next };
    const recipient = recipients.find(item => item.id === draft.recipientId);
    const selected = contracts.find(item => item.id === draft.contractId);
    const types = selected ? contractWorkTypes(selected, draft, month, recipient) : [];
    if (types.length === 1 && next.care === undefined && !sameWorkType(types[0], draft.care)) draft.care = types[0];
    onChange(classifyWorkRow(draft, month, contracts, recipients));
  }
  function numeric(label: string, value: number | null | undefined, change: (value: number | null) => void) {
    return <label>{label}<input type="number" min={0} max={9999999999} step={1} value={value ?? ''} onChange={event => {
      const amount = event.target.valueAsNumber;
      if (!event.target.value) change(null);
      else if (Number.isSafeInteger(amount) && amount >= 0 && amount <= 9999999999) change(amount);
    }} /></label>;
  }
  function flag(label: string, value: boolean | null | undefined, change: (value: boolean | null) => void) {
    return <label>{label}<select value={value == null ? '' : String(value)} onChange={event => change(event.target.value === '' ? null : event.target.value === 'true')}>
      <option value="">미확인</option><option value="true">예</option><option value="false">아니요</option>
    </select></label>;
  }
  function inputs(value: Partial<NonNullable<WorkRow['inputs']>>) {
    onChange({ inputs: { ...(row.inputs ?? blankWorkInputs()), ...value } });
  }
  const references = workMatches(row, month, contracts, recipients);
  return <dialog className="payroll-detail-dialog" ref={node => { if (node && !node.open) node.showModal(); }}
    aria-labelledby="payroll-work-detail-title" onCancel={onClose}>
    <div className="payroll-stage-heading"><h3 id="payroll-work-detail-title">{row.recipient || '서비스 기록'}{row.worker ? ` · ${row.worker}` : ''}</h3>
      <button type="button" className="secondary-button" onClick={onClose}>닫기</button></div>
    {row.source && <p>엑셀 원본 {row.source}</p>}
    <div className="payroll-grid">
      <label>수급자<select value={row.recipientId} onChange={event => {
        const chosen = recipients.find(item => item.id === event.target.value);
        if (chosen) update({ recipientId: chosen.id, recipient: chosen.name, contractId: '' });
        else onChange({ recipientId: '', contractId: '' });
      }}><option value="">수급자 선택</option>{recipients.filter(item => !item.isDraft || item.id === row.recipientId).map(item =>
        <option key={item.id} value={item.id}>{item.name} · {item.birthDate}{item.enabled ? '' : ' · 비활성'}</option>)}</select></label>
      <label>요양보호사·적용 계약<select value={row.contractId} onChange={event => {
        const chosen = contracts.find(item => item.id === event.target.value);
        if (chosen) update({ contractId: chosen.id, worker: chosen.workerName, birth: payrollBirth(chosen.workerBirthDate ?? '') });
        else onChange({ contractId: '' });
      }}><option value="">계약 선택</option>{[...new Set([...linked, ...references.candidates, ...(contract ? [contract] : []), ...choices])].map(item =>
        <option key={item.id} value={item.id}>{item.workerName} · {item.contractStartDate} · {item.wageType}{linked.includes(item) ? ' · 수급자 연결' : ''}</option>)}</select></label>
      <label>근무 구분<input value={row.care} onChange={event => update({ care: event.target.value })} /></label>
      {row.fixed ? <p>월 고정급</p> : numeric(row.source ? '엑셀 근무 합계(분)' : '일반 근무시간(분)', row.minutes, minutes => onChange({ minutes }))}
      {numeric('휴일 근무시간(분)', row.holiday, holiday => onChange({ holiday }))}
    </div>
    <details className="payroll-source"><summary>근무일·횟수·수당 참고</summary>
      <div className="payroll-grid">
        {!row.source && !row.fixed && <label>근무일 (비워 두면 월 합계)<input type="date" value={row.date} min={month + '-01'} max={lastDay}
          onChange={event => update({ date: event.target.value, contractId: '' })} /></label>}
        {!person && <label>원본 수급자 이름<input value={row.recipient} onChange={event => onChange({ recipient: event.target.value, recipientId: '', contractId: '' })} /></label>}
        {!contract && <><label>원본 근로자 이름<input value={row.worker} onChange={event => onChange({ worker: event.target.value })} /></label>
          <label>생년월일<input type="date" value={row.birth} onChange={event => onChange({ birth: event.target.value })} /></label></>}
        {numeric('실제 근무횟수', row.inputs?.visits, visits => inputs({ visits }))}
        {numeric('기준 근무횟수', row.inputs?.expected, expected => inputs({ expected }))}
        {numeric('차량운행 횟수', row.inputs?.vehicle, vehicle => inputs({ vehicle }))}
        {flag('만근 여부', row.inputs?.fullAttendance, fullAttendance => inputs({ fullAttendance }))}
        {flag('장기근속장려금 대상', row.longevityEligible, longevityEligible => onChange({ longevityEligible }))}
        {flag('중증수급자 가산금 대상', row.intensiveEligible, intensiveEligible => onChange({ intensiveEligible }))}
      </div>
    </details>
    <footer className="payroll-actions">
      <button type="button" className="primary-button" onClick={onClose}>입력 완료</button>
      <button type="button" className="secondary-button" onClick={() => update({})}>자동 연결 다시 확인</button>
      <button type="button" className="secondary-button" onClick={() => { if (window.confirm('이 근무 기록을 삭제할까요?')) onRemove(); }}>기록 삭제</button>
    </footer>
  </dialog>;
}
