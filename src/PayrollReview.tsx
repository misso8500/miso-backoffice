import { useState } from 'react';
import { insuranceNames } from './lib/payroll';
import { allowanceAmount, allowanceNames, blankReview, reviewTotals, reviewWorkers, type Allowance, type Review } from './lib/payroll-review';
import type { WorkRow } from './lib/payroll-work';
import type { EmploymentContract, Recipient } from './types';

const tabs = ['계산 요약', '계약·휴일근무', '수당', '사회보험·세금', '가족요양 공제'] as const;
type Fee = { copay: number; recipientLink: { recipientId: string | null } };
const won = (value: number) => value.toLocaleString('ko-KR') + '원';

function Money({ label, value, change }: { label: string; value: number | null; change: (value: number | null) => void }) {
  return <input aria-label={label} type="number" min={0} max={9999999999} step={1} placeholder="미확인"
    value={value ?? ''} onChange={event => {
      const amount = event.target.valueAsNumber;
      if (!event.target.value) change(null);
      else if (Number.isSafeInteger(amount) && amount >= 0 && amount <= 9999999999) change(amount);
    }} />;
}

export default function PayrollReview({ month, rows, contracts, recipients, copays, reviews, onChange, onClassify }: {
  month: string; rows: WorkRow[]; contracts: EmploymentContract[]; recipients: Recipient[];
  copays: Fee[]; reviews: Review[]; onChange: (reviews: Review[]) => void; onClassify: () => void;
}) {
  const [tab, setTab] = useState<typeof tabs[number]>('계산 요약');
  const [onlyPending, setOnlyPending] = useState(false);
  const workers = reviewWorkers(rows, month, contracts, recipients);
  const reviewMap = new Map(reviews.map(item => [item.workerKey, item]));
  const fees = new Map(copays.map(item => [item.recipientLink.recipientId, item.copay]));
  const familyDeductions = new Map<string, number>();
  for (const worker of workers) {
    for (const id of worker.family.keys()) {
      if (reviewMap.get(worker.key)?.copays[id]?.status === '공제') familyDeductions.set(id, (familyDeductions.get(id) ?? 0) + 1);
    }
  }
  const completeRows = workers.reduce((sum, worker) => sum + worker.rows.length, 0);
  const records = workers.map(worker => {
    const review = reviewMap.get(worker.key) ?? blankReview(worker.key);
    const totals = reviewTotals(worker, review);
    const duplicate = [...worker.family.keys()].some(id => (familyDeductions.get(id) ?? 0) > 1 && review.copays[id]?.status === '공제');
    const basis = worker.basis + ':' + [...worker.family.keys()].map(id => fees.get(id) ?? '').join(',');
    return { worker, review, totals, duplicate, basis, confirmed: totals.complete && !duplicate && review.basis === basis };
  });
  const shown = onlyPending ? records.filter(item => !item.confirmed) : records;
  const titles = tab === '계산 요약' ? ['기본급', '휴일 지급액', '수당 합계', '지급총액', '세금·보험 공제', '가족요양 공제', '실지급 예상액', '검토']
    : tab === '계약·휴일근무' ? ['수급자·계약', '기본급 기준', '휴일근무·시간당 추가 지급액']
    : tab === '수당' ? [...allowanceNames]
    : tab === '사회보험·세금' ? [...insuranceNames, '소득세', '지방소득세'] : ['수급자·본인부담금', '공제 확인'];
  const edit = (review: Review, value: Partial<Review>, basis = '') =>
    onChange([...reviews.filter(item => item.workerKey !== review.workerKey), { ...review, ...value, basis }]);

  return <section className="payroll-work">
    <nav className="payroll-tabs" aria-label="급여 검토 항목">{tabs.map(item => <button key={item} type="button" className="secondary-button"
      aria-pressed={item === tab} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <div className="payroll-actions">
      <span>근무 {completeRows}행 반영 · 분류 확인 필요 {rows.length - completeRows}행 · 검토 완료 {records.filter(item => item.confirmed).length}/{records.length}명</span>
      {rows.length > completeRows && <button type="button" className="secondary-button" onClick={onClassify}>분류 확인</button>}
      <label className="payroll-inline"><input type="checkbox" checked={onlyPending} onChange={event => setOnlyPending(event.target.checked)} />검토 필요만 보기</label>
    </div>
    {!rows.length && <p>월 전체 근무시간표를 작성하고 계약을 연결하면 급여 검토를 시작할 수 있습니다.</p>}
    {tab === '계산 요약' && <p>검토 중인 금액은 입력된 항목으로 계산한 예상액입니다.</p>}
    {tab === '계약·휴일근무' && <p>근무시간은 급여마법사의 월 합계 또는 일별 일반·휴일 시간의 합계입니다. 휴일 지급액은 시간당 추가 지급액으로 따로 계산합니다.</p>}
    {!!shown.length && <div className="payroll-table payroll-review"><table>
      <caption>{tab}</caption>
      <thead><tr><th scope="col">근로자</th>{titles.map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{shown.map(({ worker, review, totals, duplicate, confirmed, basis }) => {
        const rowHeading = <th scope="row">{worker.name}<small>{worker.birth}</small></th>;
        if (tab === '계산 요약') return <tr key={worker.key}>{rowHeading}
          {[totals.base, totals.holiday, totals.allowances, totals.gross, totals.deductions, totals.copay, totals.net].map((value, index) => <td key={index}>{won(value)}</td>)}
          <td>{confirmed ? '검토 완료' : duplicate ? '본인부담금 중복 공제' : worker.pending ? '근무 분류 확인 필요' :
            totals.complete ? '확정 대기' : '금액·대상 확인 필요'}
            {totals.complete && !duplicate && !confirmed && <button type="button" className="secondary-button" onClick={() => edit(review, {}, basis)}>검토 완료 처리</button>}
          </td></tr>;
        if (tab === '계약·휴일근무') return worker.groups.length ? worker.groups.map(group => {
          const rates = review.rates[group.key] ?? { base: null, holiday: null };
          const update = (change: Partial<typeof rates>) => edit(review, { rates: { ...review.rates, [group.key]: { ...rates, ...change } } });
          const suffix = worker.name + ' ' + (group.recipient || '상근');
          return <tr key={worker.key + group.key}>{rowHeading}
            <td>{group.recipient || '상근직'} · {group.care}<small>{group.contract?.contractStartDate} · 근무 {group.minutes}분</small></td>
            <td><label>{group.fixed ? '당월 고정급' : '계약 시급'}<Money label={suffix + ' 기본급 기준'} value={rates.base} change={base => update({ base })} /></label>
              {group.suggested !== null && <button type="button" className="secondary-button" onClick={() => update({ base: group.suggested })}>계약 {won(group.suggested)} 적용</button>}</td>
            <td>{group.holiday ? <>
              <details><summary>휴일근무 {group.holiday}분</summary>
                <ul>{group.rows.filter(row => row.holiday).map(row => <li key={row.id}>{row.date || '월 합계 · 일자 미제공'} · {row.holiday}분</li>)}</ul>
              </details>
              <Money label={suffix + ' 휴일 시간당 추가 지급액'} value={rates.holiday} change={holiday => update({ holiday })} />
            </> : '휴일근무 기록 없음'}</td></tr>;
        }) : <tr key={worker.key}>{rowHeading}<td colSpan={3}>분류 확인 필요</td></tr>;
        if (tab === '수당') return <tr key={worker.key}>{rowHeading}{review.allowances.map((item, index) => {
          const name = allowanceNames[index];
          const label = worker.name + ' ' + name;
          const update = (change: Partial<Allowance>) => edit(review, { allowances: review.allowances.map((value, i) => i === index ? { ...value, ...change } : value) });
          return <td key={name}><select aria-label={label + ' 지급 방식'} value={item.mode} onChange={event => update({ mode: event.target.value as Allowance['mode'] })}>
            <option value="">미확인</option><option value="none">해당 없음</option><option value="fixed">일괄 지급</option><option value="count">횟수 × 단가</option>
          </select>
            {item.mode === 'fixed' && <Money label={label + ' 지급액'} value={item.amount} change={amount => update({ amount })} />}
            {item.mode === 'count' && <><Money label={label + ' 횟수'} value={item.count} change={count => update({ count })} />
              <Money label={label + ' 단가'} value={item.rate} change={rate => update({ rate })} /><small>{won(allowanceAmount(item))}</small></>}
            {name === '차량·동행수당' && worker.rows.some(row => row.inputs?.vehicle != null) &&
              <small>마법사 운행 {worker.rows.reduce((sum, row) => sum + (row.inputs?.vehicle ?? 0), 0)}회</small>}
            {name === '근로자의 날 수당' && worker.rows.some(row => row.inputs?.laborDay != null) &&
              <small>마법사 근무 {worker.rows.reduce((sum, row) => sum + (row.inputs?.laborDay ?? 0), 0)}시간</small>}
            {name === '장기근속장려금' && worker.rows.some(row => row.inputs?.longevity != null) &&
              <small>마법사 연차비율 {[...new Set(worker.rows.flatMap(row => row.inputs?.longevity != null ? [row.inputs.longevity] : []))].join(', ')}</small>}
          </td>;
        })}</tr>;
        if (tab === '사회보험·세금') {
          const references = [...new Set(worker.groups.flatMap(({ contract }) => contract ? [
            contract.insuranceStatus, ...contract.insuranceSnapshots.filter(item =>
              (!item.effectiveStartDate || item.effectiveStartDate.slice(0, 7) <= month) &&
              (!item.effectiveEndDate || item.effectiveEndDate.slice(0, 7) >= month)).map(item => item.status)
          ].filter(Boolean) : []))];
          return <tr key={worker.key}><th scope="row">{worker.name}<small>{worker.birth}</small>
            <small>가입 {review.insurance.filter(item => item.status === '가입').length}개 · 미확인 {review.insurance.filter(item => !item.status).length}개</small>
            {references.length > 0 && <small>계약 참고 {references.join(' · ')}</small>}</th>{review.insurance.map((item, index) => {
          const name = insuranceNames[index];
          const label = worker.name + ' ' + name;
          const update = (change: Partial<typeof item>) => edit(review, { insurance: review.insurance.map((value, i) => i === index ? { ...value, ...change } : value) });
          return <td key={name}><select aria-label={label + ' 가입상태'} value={item.status} onChange={event => update({ status: event.target.value })}>
            <option value="">미확인</option><option>가입</option><option>미가입</option><option>해당 없음</option>
          </select>{index < 4 && item.status === '가입' && <Money label={label + ' 근로자 공제액'} value={item.amount} change={amount => update({ amount })} />}
            {index === 4 && <small>가입 상태 확인</small>}</td>;
        })}
          <td><Money label={worker.name + ' 소득세'} value={review.incomeTax} change={incomeTax => edit(review, { incomeTax })} /></td>
          <td><Money label={worker.name + ' 지방소득세'} value={review.localTax} change={localTax => edit(review, { localTax })} /></td></tr>;
        }
        if (!worker.family.size) return <tr key={worker.key}>{rowHeading}<td colSpan={2}>가족요양 기록 없음</td></tr>;
        return [...worker.family].map(([id, familyRows]) => {
          const current = review.copays[id] ?? { status: '', amount: null };
          const update = (change: Partial<typeof current>) => edit(review, { copays: { ...review.copays, [id]: { ...current, ...change } } });
          const source = fees.get(id);
          const imported = [...new Set(familyRows.flatMap(row => row.inputs?.copay != null ? [row.inputs.copay] : []))];
          const name = recipients.find(person => person.id === id)?.name ?? familyRows[0].recipient;
          return <tr key={worker.key + id}>{rowHeading}<td>{name}
            <small>{source === undefined ? '연결된 본인부담금 자료 없음' : '본인부담금 조회 ' + won(source)}</small>
            {!!imported.length && <small>급여마법사 입력 {imported.map(won).join(', ')}</small>}</td>
            <td><select aria-label={worker.name + ' ' + name + ' 공제 여부'} value={current.status} onChange={event => update({ status: event.target.value })}>
              <option value="">미확인</option><option>공제</option><option>미공제</option>
            </select>
              {current.status === '공제' && <><Money label={worker.name + ' ' + name + ' 공제액'} value={current.amount} change={amount => update({ amount })} />
                {source !== undefined && <button type="button" className="secondary-button" onClick={() => update({ amount: source })}>조회 금액 적용</button>}
                {imported.length === 1 && <button type="button" className="secondary-button" onClick={() => update({ amount: imported[0] })}>마법사 금액 적용</button>}
                {(familyDeductions.get(id) ?? 0) > 1 && <small>같은 수급자의 공제가 여러 근로자에게 표시됩니다.</small>}</>}
            </td></tr>;
        });
      })}</tbody>
    </table></div>}
  </section>;
}
