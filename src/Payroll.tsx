import { useEffect, useState } from 'react';
import { loadEmploymentContracts, loadRecipients, requestJson } from './storage';
import { calculatePayroll, insuranceNames, shiftMinutes, type Entry, type PayrollMonth, type Shift } from './lib/payroll';
import type { EmploymentContract, Recipient } from './types';
import PayrollWork, { type ServiceRosterRow } from './PayrollWork';
import PayrollReview from './PayrollReview';
import { allowanceAmount, allowanceNames, payrollReviewRecords, type Review } from './lib/payroll-review';
import { loadWorkContext, type WorkContext } from './lib/work-tasks';
import type { WorkRow } from './lib/payroll-work';
import './Payroll.css';

type Copay = { name: string; copay: number; payment: { amount: number } | null; recipientLink: { recipientId: string | null } };
const won = (value: number) => value.toLocaleString('ko-KR');
const inPeriod = (day: string, start?: string, end?: string) => (!start || day >= start) && (!end || day <= end);
const monthOverlap = (month: string, start?: string, end?: string) =>
  (!start || start.slice(0, 7) <= month) && (!end || end.slice(0, 7) >= month);
const period = (start?: string, end?: string) => [start || '시작일 미등록', end || '종료일 미등록'].join(' ~ ');

function makeEntry(contract: EmploymentContract): Entry {
  const types = [...new Set(contract.contractTerms.map(term => term.wageType))];
  const mode = types.length === 1 ? types[0] : types.length === 0 ? contract.wageType : '혼합';
  return {
    contractId: contract.id, type: contract.employmentType, mode,
    base: null, holidayRate: null, deductions: null, shifts: [],
    allowances: [
      { name: '비과세 식대', amount: contract.nonTaxableMealAllowance },
      { name: '비과세 차량보조금', amount: contract.nonTaxableVehicleAllowance },
      { name: '과세 추가수당', amount: contract.taxableExtraPay },
      { name: '월 교통비', amount: contract.workConditions?.monthlyTravelAllowance ?? 0 },
    ].filter(item => item.amount > 0).map(item => ({ ...item, amount: null })),
    insurance: insuranceNames.map(() => ({ status: '', amount: null })), insuranceMemo: ''
  };
}

function NumberField({ label, value, change, max = 9999999999 }: {
  label: string; value: number | null; change: (value: number | null) => void; max?: number;
}) {
  return <input aria-label={label} type="number" min={0} max={max} step={1} placeholder="미입력" value={value ?? ''}
    onChange={e => change(e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} />;
}

async function exportWorkbook(month: string, entries: Entry[], contracts: EmploymentContract[], recipients: Recipient[], copays: Copay[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const ledger = workbook.addWorksheet('급여대장');
  const hours = workbook.addWorksheet('수급자별 근무');
  const extras = workbook.addWorksheet('특수수당');
  const fees = workbook.addWorksheet('본인부담금');
  ledger.addRow(['귀속월', '요양보호사', '계약 ID', '근무형태', '임금형태', '일반 근무(분)', '휴일 근무(분)', '기본급', '휴일 지급액', '특수수당', '지급합계',
    ...insuranceNames.flatMap(name => [name + ' 가입상태', name + ' 공제액']), '기타 공제', '공제합계', '실지급액', '보험 메모']);
  hours.addRow(['요양보호사', '계약 ID', '수급자', '수급자 ID', '근무일', '일반(분)', '휴일(분)', '일반 시급', '휴일 시급', '출근', '퇴근', '휴게(분)', '일반 기본급 반영액', '휴일 지급 반영액', '업무 메모']);
  extras.addRow(['요양보호사', '계약 ID', '수당명', '금액']);
  fees.addRow(['귀속월', '수급자', '수급자 ID', '연결된 요양보호사', '본인부담금', '실제 수납액', '매핑 상태']);
  const relationships = new Map<string, Set<string>>();
  for (const entry of entries) {
    const worker = contracts.find(contract => contract.id === entry.contractId)?.workerName ?? entry.contractId;
    const result = calculatePayroll(entry);
    ledger.addRow([month, worker, entry.contractId, entry.type, entry.mode, result.regular, result.holiday, result.base,
      result.holidayPay, result.allowances, result.gross, ...entry.insurance.flatMap(item => [item.status, item.amount]),
      entry.deductions ?? 0, result.deductions, result.net, entry.insuranceMemo]);
    for (const [index, shift] of entry.shifts.entries()) {
      hours.addRow([worker, entry.contractId, recipients.find(recipient => recipient.id === shift.recipientId)?.name,
        shift.recipientId, shift.date, shift.regular, shift.holiday, entry.mode !== '월급' ? shift.rate : null, entry.holidayRate,
        shift.start, shift.end, shift.breakMinutes, result.shiftAmounts[index].regularPay, result.shiftAmounts[index].holidayPay, shift.note]);
      const workers = relationships.get(shift.recipientId) ?? new Set<string>();
      workers.add(worker);
      relationships.set(shift.recipientId, workers);
    }
    for (const item of entry.allowances) extras.addRow([worker, entry.contractId, item.name, item.amount]);
  }
  for (const [id, workers] of relationships) {
    const copay = copays.find(item => item.recipientLink.recipientId === id);
    fees.addRow([month, recipients.find(recipient => recipient.id === id)?.name ?? id, id, [...workers].join(', '),
      copay?.copay, copay?.payment?.amount, copay ? '연결' : '연결 자료 없음']);
  }
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach(column => { column.width = 19; });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `급여대장-${month}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportReviewedWorkbook(month: string, records: ReturnType<typeof payrollReviewRecords>) {
  const { default: { Workbook } } = await import('exceljs');
  const workbook = new Workbook();
  const ledger = workbook.addWorksheet('급여대장');
  const hours = workbook.addWorksheet('근무·계약 근거');
  ledger.addRow(['귀속월', '근로자', '생년월일', '기본급', '휴일 지급액', ...allowanceNames, '지급총액',
    ...insuranceNames, '소득세', '지방소득세', '가족요양 공제', '실지급액']);
  hours.addRow(['근로자', '수급자', '근무 구분', '계약 ID', '계약 시작일', '근무시간 합계(분)', '휴일 근무(분)', '기본급 단가', '휴일 추가 단가']);
  for (const { worker, review, totals } of records) {
    ledger.addRow([month, worker.name, worker.birth, totals.base, totals.holiday, ...review.allowances.map(allowanceAmount),
      totals.gross, ...review.insurance.map((item, index) => index === 4 ? item.status : item.status === '가입' ? item.amount : 0),
      review.incomeTax, review.localTax, totals.copay, totals.net]);
    for (const group of worker.groups) {
      const rates = review.rates[group.key];
      hours.addRow([worker.name, group.recipient, group.care, group.contract?.id, group.contract?.contractStartDate,
        group.minutes, group.holiday, rates?.base, rates?.holiday]);
    }
  }
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach(column => { column.width = 19; });
  }
  const data = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `급여대장-${month}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Payroll({ onDirty, onBusy }: { onDirty: (value: boolean) => void; onBusy: (value: boolean) => void }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()));
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [workRows, setWorkRows] = useState<WorkRow[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [copays, setCopays] = useState<Copay[]>([]);
  const [roster, setRoster] = useState<ServiceRosterRow[] | null>([]);
  const [context, setContext] = useState<WorkContext | null>(null);
  const [workQuery, setWorkQuery] = useState('');
  const [choice, setChoice] = useState('');
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'work' | 'review' | 'schedule' | 'ledger'>('work');
  const [focusShift, setFocusShift] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = data !== null && (JSON.stringify(data.entries) !== JSON.stringify(entries) || JSON.stringify(data.workRows ?? []) !== JSON.stringify(workRows) || JSON.stringify(data.reviews ?? []) !== JSON.stringify(reviews));
  const path = '/api/work/payroll?month=' + month;
  useEffect(() => {
    let ignore = false;
    loadWorkContext().then(value => { if (!ignore) setContext(value); }).catch(() => {});
    return () => { ignore = true; };
  }, []);
  useEffect(() => {
    if (!month) return;
    let ignore = false;
    setData(null); setError(''); setNotice(''); setSelected(''); setChoice('');
    Promise.all([requestJson<PayrollMonth>(path), loadEmploymentContracts(), loadRecipients(),
      requestJson<{ rows: Copay[] }>('/api/work/copay?month=' + month),
      requestJson<{ rows: ServiceRosterRow[] }>('/api/work/service-month?month=' + month)
        .then(value => Array.isArray(value.rows) ? value.rows : null).catch(() => null)])
      .then(([saved, contracts, recipients, fees, roster]) => {
        if (ignore) return;
        setData(saved); setEntries(saved.entries); setWorkRows(saved.workRows ?? []); setReviews(saved.reviews ?? []); setContracts(contracts);
        setRecipients(recipients); setCopays(fees.rows); setRoster(roster); setSelected(saved.entries[0]?.contractId ?? '');
      }).catch(error => { if (!ignore) setError(error.message); });
    return () => { ignore = true; };
  }, [month, path, retry]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);

  useEffect(() => {
    if (view === 'schedule' && focusShift !== null) {
      document.getElementById(`payroll-shift-${focusShift}`)?.focus();
      setFocusShift(null);
    }
  }, [view, focusShift]);

  const entry = entries.find(item => item.contractId === selected);
  const contract = contracts.find(item => item.id === selected);
  const patch = (change: Partial<Entry>) => {
    setEntries(previous => previous.map(item => item.contractId === selected ? { ...item, ...change } : item));
    setNotice('');
  };
  const updateShift = (index: number, change: Partial<Shift>) => {
    if (!entry) return;
    patch({ shifts: entry.shifts.map((shift, i) => i === index ? { ...shift, ...change } : shift) });
  };
  async function save() {
    if (!data) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await requestJson<PayrollMonth>(path, { method: 'PUT', body: JSON.stringify({ version: data.version, entries, workRows, reviews }) });
      setData(saved); setEntries(saved.entries); setWorkRows(saved.workRows ?? []); setReviews(saved.reviews ?? []); setNotice('저장했습니다.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try { await exportWorkbook(month, entries, contracts, recipients, copays); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '엑셀 생성에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  const available = contracts.filter(item => !item.isDraft && item.contractStartDate && monthOverlap(month, item.contractStartDate, item.contractEndDate) &&
    !entries.some(entry => entry.contractId === item.id));
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = `${month}-${new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()}`;
  const mapped = [...new Set(entry?.shifts.map(shift => shift.recipientId) ?? [])].filter(Boolean);
  const results = entries.map(item => ({ item, totals: calculatePayroll(item), source: contracts.find(contract => contract.id === item.contractId) }));
  const selectedTotals = entry ? calculatePayroll(entry) : null;
  const exportable = results.length > 0 && results.every(({ totals, source }) => totals.complete && source);
  const monthlyRecords = view === 'review' ? payrollReviewRecords(workRows, month, contracts, recipients, copays, reviews) : [];
  const monthlyExportable = monthlyRecords.length > 0 && monthlyRecords.every(item => item.confirmed) &&
    monthlyRecords.reduce((sum, item) => sum + item.worker.rows.length, 0) === workRows.length;
  async function downloadReviewed() {
    setBusy(true); setError('');
    try { await exportReviewedWorkbook(month, monthlyRecords); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '엑셀 생성에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <section className="payroll">
    <div className="payroll-actions">
      <label>급여 귀속월<input type="month" value={month} disabled={busy} onChange={e => {
        if (e.target.value && (!dirty || window.confirm('저장하지 않은 급여 입력을 닫고 월을 이동할까요?'))) { setMonth(e.target.value); setWorkQuery(''); }
      }} /></label>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => {
        if (!dirty || window.confirm('저장하지 않은 급여 입력을 닫고 다시 조회할까요?')) setRetry(value => value + 1);
      }}>다시 조회</button>
      <button type="button" className="primary-button" disabled={!dirty || busy} onClick={() => void save()}>저장</button>
      {view === 'review' && <button type="button" className="secondary-button" disabled={!data || dirty || busy || !monthlyExportable}
        title="모든 근무 기록과 급여를 확인하고 저장하면 다운로드할 수 있습니다." onClick={() => void downloadReviewed()}>급여대장 엑셀</button>}
      {view === 'ledger' && <button type="button" className="secondary-button" disabled={!data || dirty || busy || !exportable} onClick={() => void download()}>기존 급여대장 엑셀</button>}
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">급여 자료를 불러오는 중입니다.</p>}
    {data && <fieldset disabled={busy} className="payroll-content">
      <legend className="payroll-visually-hidden">급여 입력</legend>
      <nav className="payroll-tabs payroll-stages" aria-label="급여대장 업무">
        <button type="button" className="secondary-button" aria-pressed={view === 'work'} onClick={() => { setWorkQuery(''); setView('work'); }}>서비스 시간 확인</button>
        <button type="button" className="secondary-button" aria-pressed={view === 'review'} onClick={() => setView('review')}>급여 검토·출력</button>
        <details className="payroll-legacy"><summary>이전 입력 방식</summary><div className="payroll-actions">
          <button type="button" className="secondary-button" aria-pressed={view === 'schedule'} onClick={() => setView('schedule')}>기존 계약별 입력</button>
          <button type="button" className="secondary-button" aria-pressed={view === 'ledger'} onClick={() => setView('ledger')}>기존 급여대장 산출</button>
        </div></details>
      </nav>
      {view === 'work' &&
        <PayrollWork key={month + workQuery} month={month} rows={workRows} contracts={contracts} recipients={recipients} roster={roster} initialQuery={workQuery}
          onReview={() => setView('review')} onChange={rows => { setWorkRows(rows); setNotice(''); }} onBusy={setBusy} />}
      {view === 'review' && <PayrollReview key={month} month={month} rows={workRows} contracts={contracts} recipients={recipients}
        copays={copays} reviews={reviews} context={context} onChange={next => { setReviews(next); setNotice(''); }}
        onClassify={worker => { setWorkQuery(worker ?? ''); setView('work'); }} />}
      {view === 'schedule' && <>
      <div className="payroll-actions">
        {entries.length > 0 && <label>시간표 근무자<select value={selected} onChange={e => setSelected(e.target.value)}>
          {entries.map(item => {
            const source = contracts.find(contract => contract.id === item.contractId);
            return <option key={item.contractId} value={item.contractId}>{source ? `${source.workerName} · ${source.contractStartDate}` : item.contractId}</option>;
          })}
        </select></label>}
        <label>근로계약서 선택<select value={choice} onChange={e => setChoice(e.target.value)}>
          <option value="">추가할 근로계약서 선택</option>
          {available.map(item => <option key={item.id} value={item.id}>{item.workerName} · {item.employmentType} · {period(item.contractStartDate, item.contractEndDate)}{item.enabled ? '' : ' · 비활성'}</option>)}
        </select></label>
        <button type="button" className="secondary-button" disabled={!choice} onClick={() => {
          const source = available.find(item => item.id === choice);
          if (source) { setEntries([...entries, makeEntry(source)]); setSelected(source.id); setChoice(''); setNotice(''); }
        }}>시간표에 추가</button>
      </div>
      {entry && <section className="payroll-editor">
        <div className="payroll-actions">
          <h2>{contract?.workerName ?? entry.contractId}</h2>
          {contract && <span>계약 기간 {period(contract.contractStartDate, contract.contractEndDate)}</span>}
          <button type="button" className="secondary-button" onClick={() => setView('ledger')}>이 시간표의 급여 산출 보기</button>
          <button className="secondary-button" type="button" onClick={() => {
            if (!window.confirm('이 계약의 급여 입력을 대장에서 삭제할까요?')) return;
            const next = entries.filter(item => item.contractId !== selected);
            setEntries(next); setSelected(next[0]?.contractId ?? ''); setNotice('');
          }}>대장에서 삭제</button>
        </div>
        <div className="payroll-grid">
          <label>근무형태<input value={entry.type} onChange={e => patch({ type: e.target.value })} /></label>
          <label>임금형태<select value={entry.mode} onChange={e => patch({ mode: e.target.value })}>
            <option value="">선택</option><option>시급</option><option>월급</option><option>혼합</option>
          </select></label>
          {entry.mode !== '시급' && <label>당월 기본급(원)<NumberField label="당월 기본급" value={entry.base} change={base => patch({ base })} /></label>}
          <label>휴일 시간당 추가 계산액(원)<NumberField label="휴일 시간당 추가 계산액" value={entry.holidayRate} change={holidayRate => patch({ holidayRate })} /></label>
          <label>기타 공제액(원)<NumberField label="기타 공제액" value={entry.deductions} change={deductions => patch({ deductions })} /></label>
        </div>
        {contract && <details className="payroll-source" open>
          <summary>근로계약 및 담당 업무</summary>
          <dl>
            <dt>직무</dt><dd>{contract.jobTitle || '미등록'}</dd>
            <dt>계약 근무형태</dt><dd>{contract.employmentType || '미등록'}</dd>
            <dt>계약 일정</dt><dd>{[contract.workDays, contract.workStartTime && contract.workEndTime ? `${contract.workStartTime}~${contract.workEndTime}` : '', contract.breakMinutes ? `휴게 ${contract.breakMinutes}분` : ''].filter(Boolean).join(' · ') || '미등록'}</dd>
            <dt>근무지</dt><dd>{contract.workplace || (contract.workplaceType === 'recipient_home' ? '수급자 자택' : '기관')}</dd>
          </dl>
          <p>계약 임금 {contract.contractTerms.length ? contract.contractTerms.map(term => `${term.wageType} ${won(term.wageAmount)}원`).join(' / ') : `${contract.wageType} ${won(contract.wageAmount)}원`}</p>
        </details>}
        <div className="payroll-actions"><h3>수급자별 근무시간</h3><button type="button" className="secondary-button" onClick={() =>
          patch({ shifts: [...entry.shifts, { date: contract?.contractStartDate.startsWith(month + '-') ? contract.contractStartDate : month + '-01', recipientId: '', regular: 0, holiday: 0, rate: null }] })}>근무 추가</button></div>
        <div className="payroll-table"><table>
          <thead><tr>{['근무일', '수급자·업무', '출퇴근·휴게', '일반(분)', '휴일(분)', ...(entry.mode !== '월급' ? ['일반 시급(원)'] : []), '기본급 반영', '휴일 지급 반영', ''].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{entry.shifts.map((shift, i) => {
            const condition = contract?.workConditions?.conditions.filter(item => item.recipientId === shift.recipientId &&
              inPeriod(shift.date, item.effectiveStartDate, item.effectiveEndDate));
            const matchingTerms = contract?.contractTerms.filter(term => term.wageType === '시급' &&
              (condition?.length ? condition.some(item => item.termId === term.id) : true)) ?? [];
            const suggested = matchingTerms.length === 1 ? matchingTerms[0].wageAmount
              : !matchingTerms.length && !contract?.contractTerms.length && contract?.wageType === '시급' ? contract.wageAmount : null;
            const recipient = recipients.find(item => item.id === shift.recipientId);
            const amount = selectedTotals?.shiftAmounts[i];
            const actual = shift.start && shift.end ? shiftMinutes(shift.start, shift.end, shift.breakMinutes ?? 0) : null;
            return <tr key={i}>
              <td><input id={`payroll-shift-${i}`} aria-label="근무일" type="date" value={shift.date} min={month + '-01'} max={lastDay} onChange={e => updateShift(i, { date: e.target.value })} /></td>
              <td><select aria-label="근무 수급자" value={shift.recipientId} onChange={e => updateShift(i, { recipientId: e.target.value })}>
                <option value="">수급자 선택</option>
                {shift.recipientId && !recipients.some(item => item.id === shift.recipientId) && <option value={shift.recipientId}>{shift.recipientId}</option>}
                {recipients.map(item => <option value={item.id} key={item.id}>{item.operationalName ? `${item.name} (${item.operationalName})` : item.name}{contract?.recipientAssignments.some(assignment => assignment.recipientId === item.id) ? ' · 계약 연결' : ''}</option>)}
              </select>
              <details>
                <summary>업무 상세</summary>
                {recipient && <p>{recipient.serviceType || '서비스 미등록'} · {recipient.careGrade || '등급 미등록'}</p>}
                {condition?.map((item, index) => <p key={index}>{item.familyCare ? '가족요양' : item.serviceType || '서비스 미등록'} · {period(item.effectiveStartDate, item.effectiveEndDate)}
                  {[item.workDays, item.workStartTime && item.workEndTime ? `${item.workStartTime}~${item.workEndTime}` : '', item.breakMinutes ? `휴게 ${item.breakMinutes}분` : ''].filter(Boolean).map(value => ` · ${value}`).join('')}</p>)}
                {recipient?.caregiverRequirements && <p>요양보호사 유의사항 {recipient.caregiverRequirements}</p>}
                <label>업무 메모<textarea maxLength={500} value={shift.note ?? ''} onChange={e => updateShift(i, { note: e.target.value })} /></label>
              </details></td>
              <td><div className="payroll-time">
                <label>출근<input type="time" value={shift.start ?? ''} onChange={e => updateShift(i, { start: e.target.value })} /></label>
                <label>퇴근<input type="time" value={shift.end ?? ''} onChange={e => updateShift(i, { end: e.target.value })} /></label>
                <label>휴게(분)<NumberField label="휴게 분" max={1439} value={shift.breakMinutes ?? 0} change={breakMinutes => updateShift(i, { breakMinutes: breakMinutes ?? 0 })} /></label>
              </div>
                {actual !== null && <div className="payroll-actions">
                  <span>실근무 {actual}분{actual !== shift.regular + shift.holiday ? ' · 배분 확인' : ''}</span>
                  <button type="button" className="secondary-button" disabled={actual <= 0} onClick={() => updateShift(i, { regular: actual, holiday: 0 })}>일반에 반영</button>
                  <button type="button" className="secondary-button" disabled={actual <= 0} onClick={() => updateShift(i, { regular: 0, holiday: actual })}>휴일에 반영</button>
                </div>}
              </td>
              <td><NumberField label="일반 근무 분" value={shift.regular} max={1440} change={regular => updateShift(i, { regular: regular ?? 0 })} /></td>
              <td><NumberField label="휴일 근무 분" value={shift.holiday} max={1440} change={holiday => updateShift(i, { holiday: holiday ?? 0 })} /></td>
              {entry.mode !== '월급' && <td><NumberField label="일반 시급" value={shift.rate} change={rate => updateShift(i, { rate })} />
                {suggested !== null && <button type="button" className="secondary-button" onClick={() => updateShift(i, { rate: suggested })}>계약 {won(suggested)}원 적용</button>}</td>}
              <td>{entry.mode === '월급' ? '월 기본급에 포함' : shift.regular && shift.rate === null ? '시급 확인' : won(amount?.regularPay ?? 0) + '원'}</td>
              <td>{shift.holiday && entry.holidayRate === null ? '단가 확인' : won(amount?.holidayPay ?? 0) + '원'}</td>
              <td><button type="button" className="secondary-button" onClick={() => patch({ shifts: entry.shifts.filter((_, index) => index !== i) })}>삭제</button></td>
            </tr>;
          })}</tbody>
        </table></div>

        <div className="payroll-actions"><h3>특수 수당</h3><button type="button" className="secondary-button" onClick={() =>
          patch({ allowances: [...entry.allowances, { name: '', amount: null }] })}>수당 추가</button></div>
        {entry.mode === '혼합' && <p>월 기본급에 포함된 일반 근무 행의 시급에는 0원을 입력해 주세요.</p>}
        {contract?.allowanceMemo && <p>계약서 수당 메모 {contract.allowanceMemo}</p>}
        {contract && <p>계약서 수당 기준 {[['식대', contract.nonTaxableMealAllowance], ['차량보조금', contract.nonTaxableVehicleAllowance],
          ['과세 추가수당', contract.taxableExtraPay], ['월 교통비', contract.workConditions?.monthlyTravelAllowance ?? 0]]
          .map(([name, amount]) => `${name} ${won(Number(amount))}원`).join(' · ')}</p>}
        {entry.allowances.map((item, i) => {
          const update = (change: Partial<typeof item>) => patch({ allowances: entry.allowances.map((current, index) => index === i ? { ...current, ...change } : current) });
          return <div key={i} className="payroll-actions">
            <label>수당명<input value={item.name} onChange={e => update({ name: e.target.value })} /></label>
            <label>당월 금액(원)<NumberField label="수당 금액" value={item.amount} change={amount => update({ amount })} /></label>
            <button type="button" className="secondary-button" onClick={() => patch({ allowances: entry.allowances.filter((_, index) => index !== i) })}>삭제</button>
          </div>;
        })}

        <h3>사회보험 가입내역</h3>
        {contract && <ul>
          {contract.insuranceStatus && <li>계약서 가입정보 {contract.insuranceStatus}</li>}
          {contract.insuranceSnapshots.filter(item => monthOverlap(month, item.effectiveStartDate, item.effectiveEndDate)).map((item, i) =>
            <li key={item.id ?? i}>{period(item.effectiveStartDate, item.effectiveEndDate)} · {item.status}{item.memo ? ` · ${item.memo}` : ''}</li>)}
        </ul>}
        <div className="payroll-grid">{insuranceNames.map((name, i) => {
          const item = entry.insurance[i];
          const update = (change: Partial<typeof item>) => patch({ insurance: entry.insurance.map((current, index) => index === i ? { ...current, ...change } : current) });
          return <div key={name}>
            <label>{name}<select aria-label={name + ' 가입상태'} value={item.status} onChange={e => update({ status: e.target.value })}>
              <option value="">확인 필요</option><option>가입</option><option>미가입</option><option>해당 없음</option>
            </select></label>
            <label>공제액(원)<NumberField label={name + ' 공제액'} value={item.amount} change={amount => update({ amount })} /></label>
          </div>;
        })}</div>
        <label>사회보험 메모<input value={entry.insuranceMemo} maxLength={500} onChange={e => patch({ insuranceMemo: e.target.value })} /></label>

        <h3>본인부담금 매핑</h3>
        <p>동일 귀속월의 본인부담금 자료를 근무 수급자의 등록 ID로 연결합니다.</p>
        {mapped.length === 0 ? <p>근무 수급자를 선택하면 연결 내역이 표시됩니다.</p> : <ul>{mapped.map(id => {
          const fee = copays.find(item => item.recipientLink.recipientId === id);
          const name = recipients.find(item => item.id === id)?.name ?? id;
          return <li key={id}>{name} · {fee ? `본인부담금 ${won(fee.copay)}원 · ${fee.payment ? `수납 ${won(fee.payment.amount)}원` : '수납 기록 없음'}` : '연결 자료 없음'}</li>;
        })}</ul>}
      </section>}
      </>}
      {view === 'ledger' && <>
      {results.length > 0 && <div className="payroll-table"><table>
        <caption>근무시간표에서 산출한 급여대장</caption>
        <thead><tr>{['요양보호사 · 계약', '일반(분)', '휴일(분)', '기본급', '휴일 지급액', '특수수당', '지급합계', '공제합계', '실지급액', '검토'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{results.map(({ item, totals, source }) => <tr key={item.contractId}>
          <th scope="row"><button type="button" className="secondary-button" aria-pressed={selected === item.contractId} onClick={() => setSelected(item.contractId)}>
            {source ? `${source.workerName} · ${source.contractStartDate}` : item.contractId}
          </button></th>
          {[totals.regular, totals.holiday, totals.base, totals.holidayPay, totals.allowances, totals.gross, totals.deductions, totals.net].map((value, i) => <td key={i}>{won(value)}</td>)}
          <td>{totals.complete && source ? '입력 완료' : '입력 확인'}</td>
        </tr>)}</tbody>
      </table></div>}
        {results.length === 0 && <p>근무시간표에 근로계약서를 추가하면 급여대장이 표시됩니다.</p>}
        {entry && selectedTotals && <section className="payroll-editor">
          <div className="payroll-actions">
            <h2>{contract?.workerName ?? entry.contractId} 산출 근거</h2>
            <button type="button" className="secondary-button" onClick={() => setView('schedule')}>이 근무자의 시간표 수정</button>
          </div>
          <dl className="payroll-breakdown">
            <dt>기본급</dt><dd>당월 고정 기본급 {won(selectedTotals.monthlyBase)}원 + 일반 근무 반영액 {won(selectedTotals.hourlyBase)}원</dd>
            <dt>휴일 지급액</dt><dd>{selectedTotals.holiday}분 × {entry.holidayRate === null ? '미입력' : won(entry.holidayRate) + '원'} ÷ 60 = {won(selectedTotals.holidayPay)}원</dd>
            <dt>특수수당</dt><dd>{entry.allowances.map(item => `${item.name || '수당명 미입력'} ${item.amount === null ? '미입력' : won(item.amount) + '원'}`).join(' + ') || '0원'}</dd>
            <dt>공제합계</dt><dd>사회보험 {won(selectedTotals.insurance)}원 + 기타 공제 {won(entry.deductions ?? 0)}원 = {won(selectedTotals.deductions)}원</dd>
            <dt>실지급액</dt><dd>{won(selectedTotals.gross)}원 − {won(selectedTotals.deductions)}원 = {won(selectedTotals.net)}원</dd>
          </dl>
          {entry.shifts.length > 0 && <div className="payroll-table"><table>
            <caption>시간표 행별 반영 내역</caption>
            <thead><tr>{['근무일', '수급자', '일반(분)', '일반 시급', '기본급 반영', '휴일(분)', '휴일 지급 반영'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{entry.shifts.map((shift, index) => <tr key={index}>
              <th scope="row"><button type="button" className="secondary-button" onClick={() => { setFocusShift(index); setView('schedule'); }}>{shift.date || '근무일 미입력'}</button></th>
              <td>{recipients.find(item => item.id === shift.recipientId)?.name ?? (shift.recipientId || '수급자 미선택')}</td>
              <td>{shift.regular}</td>
              <td>{entry.mode === '월급' ? '월급' : shift.rate === null ? '미입력' : won(shift.rate) + '원'}</td>
              <td>{entry.mode === '월급' ? '월 기본급에 포함' : won(selectedTotals.shiftAmounts[index].regularPay) + '원'}</td>
              <td>{shift.holiday}</td>
              <td>{won(selectedTotals.shiftAmounts[index].holidayPay)}원</td>
            </tr>)}</tbody>
          </table></div>}
        </section>}
      </>}
      {entries.length > 0 && !exportable && <p>근무형태, 임금, 수당, 보험 가입상태와 공제액을 모두 확인하면 저장 후 엑셀을 내려받을 수 있습니다.</p>}
    </fieldset>}
  </section>;
}
