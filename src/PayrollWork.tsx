import { useState } from 'react';
import { blankWorkRow, careGroup, classifyWorkRow, payrollBirth, readPayrollWizard, reviewWorkRows, type WorkRow } from './lib/payroll-work';
import type { EmploymentContract, Recipient } from './types';

const totalMinutes = (row: WorkRow) => (row.minutes ?? 0) + (row.source ? 0 : row.holiday ?? 0);

type Props = {
  month: string; rows: WorkRow[]; contracts: EmploymentContract[]; recipients: Recipient[];
  classify: boolean; onChange: (rows: WorkRow[]) => void; onBusy: (busy: boolean) => void;
};

export default function PayrollWork({ month, rows, contracts, recipients, classify, onChange, onBusy }: Props) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readPayrollWizard>> | null>(null);
  const [paste, setPaste] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [message, setMessage] = useState('');
  const match = (row: WorkRow) => classifyWorkRow(row, month, contracts, recipients);
  const patch = (id: string, value: Partial<WorkRow>) =>
    onChange(rows.map(row => row.id === id ? { ...row, ...value } : row));
  const existingSources = new Set(rows.map(row => row.source).filter(Boolean));
  const importRows = preview?.rows.filter(row => !existingSources.has(row.source)) ?? [];
  const monthMismatch = preview && [preview.sheetMonth, preview.titleMonth].some(key => key && key !== month);
  const { groups, reviewed } = reviewWorkRows(rows, month, contracts, recipients);
  const pending = reviewed.filter(item => item.issue).length;
  const verified = reviewed.filter(item => !item.issue);
  const verifiedIds = new Set(verified.map(item => item.row.id));
  const shown = classify && onlyIssues ? reviewed.filter(item => item.issue) : reviewed;
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
    if (newRows.length) { onChange([...rows, ...newRows]); setPaste(''); setMessage(`${newRows.length}행을 추가했습니다.`); }
  }

  return <section className="payroll-work">
    {!classify && <>
      <div className="payroll-actions">
        <button type="button" className="secondary-button" onClick={() => onChange([...rows, { ...blankWorkRow(), date: month + '-01' }])}>근무 행 추가</button>
        <label>급여마법사 가져오기<input type="file" accept=".xlsx" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void importFile(file);
        }} /></label>
      </div>
      {preview && <div className="payroll-source">
        <p>{preview.sheet} · 가져올 행 {importRows.length}개 · 이미 가져온 행 {preview.rows.length - importRows.length}개</p>
        {monthMismatch && <p role="alert">귀속월 {month} · 시트명 {preview.sheetMonth || '미표기'} · 본문 {preview.titleMonth || '미표기'}. 적용할 귀속월을 확인해 주세요.</p>}
        <div className="payroll-actions">
          <button type="button" className="primary-button" disabled={!importRows.length} onClick={() => {
            onChange([...rows, ...importRows.map(match)]); setPreview(null);
            setMessage(`${importRows.length}행을 월별 시간표에 추가했습니다.`);
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
      <p>급여마법사 행에는 원본 근무시간 합계와 별도 휴일 시간을 표시합니다. 일별 입력 행은 일반·휴일 시간을 각각 입력합니다.</p>
    </>}
    {classify && <div className="payroll-actions">
      <button type="button" className="secondary-button" disabled={!rows.length} onClick={() => onChange(rows.map(match))}>일치하는 수급자·계약 일괄 연결</button>
      <label className="payroll-inline"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)} />확인 필요만 보기</label>
    </div>}
    {!classify && message && <p role="status">{message}</p>}
    <p aria-live="polite">전체 {rows.length}행 · 분류 완료 {verified.length}행 · 확인 필요 {pending}행</p>
    {classify && <p>분류 완료 근무 합계 {verified.reduce((sum, item) => sum + totalMinutes(item.row), 0).toLocaleString('ko-KR')}분 · 휴일 {verified.reduce((sum, item) => sum + (item.row.holiday ?? 0), 0).toLocaleString('ko-KR')}분 · 고정급 {verified.filter(item => item.row.fixed).length}행</p>}
    {shown.length > 0 && <div className="payroll-table"><table>
      <caption>{classify ? '근로자·수급자·계약 분류' : '월 전체 근무시간표'}</caption>
      <thead><tr>{(classify
        ? ['근무일·원본', '요양보호사', '생년월일', '요양구분', '수급자 연결', '근로계약 연결', '확인 상태']
        : ['근무일·원본', '수급자', '요양보호사', '생년월일', '요양구분', '근무(분)', '휴일(분)', '']).map((name, index) => <th key={index} scope="col">{name}</th>)}</tr></thead>
      <tbody>{shown.map(({ row, references, issue }, index) => {
        const suffix = ` ${index + 1}행`;
        const text = (key: 'worker' | 'recipient' | 'birth' | 'care', label: string) =>
          <input aria-label={label + suffix} type={key === 'birth' ? 'date' : 'text'} value={row[key]} onChange={event =>
            patch(row.id, { [key]: event.target.value, contractId: '', ...(key === 'recipient' ? { recipientId: '' } : {}) })} />;
        const minutes = (key: 'minutes' | 'holiday', label: string) =>
          <input aria-label={label + suffix} type="number" min={0} step={1} value={row[key] ?? ''} onChange={event =>
            patch(row.id, { [key]: Number.isNaN(event.target.valueAsNumber) ? null : event.target.valueAsNumber })} />;
        const linkedPerson = recipients.find(person => person.id === row.recipientId);
        const personOptions = references.people.length ? references.people : recipients.filter(person => person.enabled);
        const options = linkedPerson && !personOptions.some(person => person.id === linkedPerson.id) ? [linkedPerson, ...personOptions] : personOptions;
        return <tr key={row.id}>
          <td>{classify ? row.date || '월 합계' : row.source ? '월 합계' : <input aria-label={'근무일' + suffix} type="date" value={row.date} min={month + '-01'} max={`${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`} onChange={event => patch(row.id, { date: event.target.value, contractId: '' })} />}
            {row.source && <small>{row.source}</small>}</td>
          {classify ? <>
            <td>{row.worker || '미입력'}</td><td>{row.birth || '미입력'}</td><td>{text('care', '요양구분')}{row.fixed && <small>고정급</small>}</td>
            <td>{row.recipient && <small>{row.recipient}</small>}<select aria-label={'수급자 연결' + suffix} value={row.recipientId} onChange={event => patch(row.id, { recipientId: event.target.value, contractId: '' })}>
              <option value="">수급자 선택</option>
              {options.map(person => <option key={person.id} value={person.id}>{person.name}{person.operationalName ? ` (${person.operationalName})` : ''}</option>)}
            </select></td>
            <td><select aria-label={'근로계약 연결' + suffix} value={row.contractId} onChange={event => patch(row.id, { contractId: event.target.value })}>
              <option value="">근로계약 선택</option>
              {references.candidates.map(contract => <option key={contract.id} value={contract.id}>{contract.employmentType} · {contract.contractStartDate} · {contract.wageType} {contract.wageAmount.toLocaleString('ko-KR')}원{references.linked.includes(contract) ? ' · 수급자 연결' : ''}</option>)}
            </select></td>
            <td>{issue || '분류 완료'}</td>
          </> : <>
            <td>{text('recipient', '수급자')}</td><td>{text('worker', '요양보호사')}</td><td>{text('birth', '생년월일')}</td><td>{text('care', '요양구분')}</td>
            <td>{row.fixed ? '고정급' : minutes('minutes', row.source ? '월 근무 합계 분' : '일반 근무 분')}</td><td>{minutes('holiday', '휴일 근무 분')}</td>
            <td><button type="button" className="secondary-button" aria-label={'근무 행 삭제' + suffix} onClick={() => onChange(rows.filter(item => item.id !== row.id))}>삭제</button></td>
          </>}
        </tr>;
      })}</tbody>
    </table></div>}
    {classify && verified.length > 0 && <details className="payroll-source">
      <summary>분류별 근무 합계</summary>
      <ul>{[...groups.values()].map(group => {
        const matched = group.filter(row => verifiedIds.has(row.id));
        if (!matched.length) return null;
        const first = matched[0];
        return <li key={first.id}>{first.worker} · {first.recipient || '상근직'} · {careGroup(first.care)} · {
          first.fixed ? '고정급' : `근무 ${matched.reduce((sum, row) => sum + totalMinutes(row), 0)}분 · 휴일 ${matched.reduce((sum, row) => sum + (row.holiday ?? 0), 0)}분`
        }</li>;
      })}</ul>
    </details>}
  </section>;
}
