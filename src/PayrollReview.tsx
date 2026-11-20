import { useState } from 'react';
import { insuranceNames } from './lib/payroll';
import { allowanceAmount, allowanceNames, payrollReviewRecords, type Allowance, type Review } from './lib/payroll-review';
import type { WorkRow } from './lib/payroll-work';
import type { WorkContext } from './lib/work-tasks';
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

export default function PayrollReview({ month, rows, contracts, recipients, copays, reviews, context, onChange, onClassify }: {
  month: string; rows: WorkRow[]; contracts: EmploymentContract[]; recipients: Recipient[];
  copays: Fee[]; reviews: Review[]; context: WorkContext | null; onChange: (reviews: Review[]) => void; onClassify: (worker?: string) => void;
}) {
  const [tab, setTab] = useState<typeof tabs[number]>('계산 요약');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const fees = new Map(copays.map(item => [item.recipientLink.recipientId, item.copay]));
  const records = payrollReviewRecords(rows, month, contracts, recipients, copays, reviews);
  const completeRows = records.reduce((sum, item) => sum + item.worker.rows.length, 0);
  const visible = records.filter(({ review, confirmed }) => filter === 'all' ||
    (filter === 'mine' ? review.assigneeId === context?.me.id && !confirmed : Boolean(review.returnedReason)));
  const focused = visible.find(item => item.worker.key === selected);
  const shown = focused ? [focused] : [];
  const memberName = (id?: string) => context?.assignees.find(item => item.id === id)?.name ??
    context?.members?.find(item => item.id === id)?.name ?? '미배정';
  const status = (item: typeof records[number]) => item.confirmed ? '확정' : item.review.returnedReason ? '수정 요청' :
    item.worker.pending ? '서비스 확인 필요' : item.review.assigneeId ? '검토 요청' : '작성 중';
  const titles = tab === '계약·휴일근무' ? ['수급자·계약', '기본급 기준', '휴일근무·시간당 추가 지급액']
    : tab === '수당' ? [...allowanceNames]
    : tab === '사회보험·세금' ? [...insuranceNames, '소득세', '지방소득세'] : ['수급자·본인부담금', '공제 확인'];
  const edit = (review: Review, value: Partial<Review>, basis = '') =>
    onChange([...reviews.filter(item => item.workerKey !== review.workerKey), {
      ...review, rates: reviews.find(item => item.workerKey === review.workerKey)?.rates ?? {}, ...value, basis
    }]);

  return <section className="payroll-work">
    <header className="payroll-stage-heading">
      <div><h2>급여 검토·출력</h2><p>확인된 근무시간과 적용 계약으로 기본급을 계산합니다.</p></div>
      {rows.length > completeRows && <button type="button" className="secondary-button" onClick={() => onClassify()}>서비스 확인 필요 {rows.length - completeRows}건</button>}
    </header>
    <div className="payroll-list-tools">
      <label>검토 업무<select value={filter} onChange={event => { setFilter(event.target.value); setSelected(''); }}>
        <option value="all">전체 근로자</option>{context && <option value="mine">내 검토 업무</option>}<option value="returned">수정 요청</option>
      </select></label>
      <span>확정 {records.filter(item => item.confirmed).length} / {records.length}명</span>
    </div>
    <div className="payroll-table payroll-compact"><table>
      <thead><tr><th scope="col">근로자</th><th scope="col">검토 담당</th><th scope="col">예상 실지급액</th><th scope="col">진행 상태</th><th scope="col">상세</th></tr></thead>
      <tbody>{visible.map(item => <tr key={item.worker.key} className={selected === item.worker.key ? 'is-selected' : undefined}>
        <th scope="row">{item.worker.name}<small>{item.worker.birth}</small></th>
        <td>{memberName(item.review.assigneeId)}</td><td>{item.totals.complete ? won(item.totals.net) : '입력 대기'}</td>
        <td><span className={`payroll-status ${item.confirmed ? '' : 'is-pending'}`}>{status(item)}</span></td>
        <td><button type="button" className="secondary-button" aria-expanded={selected === item.worker.key}
          onClick={() => { setSelected(selected === item.worker.key ? '' : item.worker.key); setReason(''); setTab('계산 요약'); }}>검토</button></td>
      </tr>)}
      {!visible.length && <tr><td colSpan={5}>{rows.length ? '이 조건에 해당하는 검토 업무가 없습니다.' : '서비스 시간을 먼저 확인하세요.'}</td></tr>}</tbody>
    </table></div>
    {focused && <dialog className="payroll-detail-dialog payroll-review-dialog" ref={node => { if (node && !node.open) node.showModal(); }}
      aria-label={focused.worker.name + ' 급여 검토'} onCancel={() => setSelected('')}>
      <header className="payroll-stage-heading"><h3>{focused.worker.name} 급여 검토</h3><button className="secondary-button" type="button" onClick={() => setSelected('')}>닫기</button></header>
      {focused.review.returnedReason && <div className="payroll-actions">
        <p role="status">수정 요청 · {focused.review.returnedReason}</p>
        <button type="button" className="secondary-button" onClick={() => onClassify(focused.worker.name)}>이 근로자의 서비스 기록 열기</button>
        {context?.me.id === focused.review.requestedBy && <button type="button" className="primary-button"
          disabled={!!focused.worker.pending} onClick={() => edit(focused.review, { returnedReason: '' })}>다시 검토 요청</button>}
      </div>}
      {focused.review.requestedBy && <p>요청자 {memberName(focused.review.requestedBy)}{focused.confirmed && focused.review.confirmedBy ? ` · 확인자 ${memberName(focused.review.confirmedBy)}` : ''}</p>}
      {context && <div className="payroll-actions">
        <label>검토 담당자<select value={focused.review.assigneeId ?? ''} onChange={event => {
          edit(focused.review, { assigneeId: event.target.value, requestedBy: event.target.value ? context.me.id : '', returnedReason: '' });
        }}><option value="">미배정</option>{context.assignees.filter(item => item.id !== context.me.id || item.id === focused.review.assigneeId).map(item =>
          <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>수정 요청 사유<input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" className="secondary-button" disabled={!reason.trim() || (!!focused.review.assigneeId && focused.review.assigneeId !== context.me.id)}
          onClick={() => { edit(focused.review, { returnedReason: reason.trim() }); setReason(''); }}>수정 요청</button>
      </div>}
      <nav className="payroll-tabs" aria-label="급여 검토 항목">{tabs.map(item => <button key={item} type="button" className="secondary-button"
        aria-pressed={item === tab} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {tab === '계산 요약' && <div className="payroll-summary">
      <dl>
        {([['기본급', focused.totals.base], ['휴일 지급액', focused.totals.holiday], ['수당 합계', focused.totals.allowances],
          ['지급총액', focused.totals.gross], ['세금·보험 공제', focused.totals.deductions], ['가족요양 공제', focused.totals.copay],
          ['예상 실지급액', focused.totals.net]] as const).map(([label, amount]) =>
          <div key={label}><dt>{label}</dt><dd>{won(amount)}</dd></div>)}
      </dl>
      <div className="payroll-actions">
        {!focused.totals.complete && <p>{focused.worker.pending ? '서비스 시간 확인이 남아 있습니다.' : '휴일 단가·수당·공제 대상과 금액을 확인하세요.'}</p>}
        {focused.duplicate && <p role="alert">본인부담금이 여러 근로자에게 공제되었습니다.</p>}
        {focused.totals.complete && !focused.duplicate && !focused.confirmed && !focused.review.returnedReason &&
          (!focused.review.assigneeId || focused.review.assigneeId === context?.me.id) &&
          <button type="button" className="primary-button" onClick={() => {
            edit(focused.review, { confirmedBy: context?.me.id ?? '' }, focused.basis);
            setSelected('');
          }}>검토 완료 처리</button>}
        {focused.confirmed && <span className="payroll-status">검토 완료</span>}
      </div>
    </div>}
    {tab === '계약·휴일근무' && <p>근무시간은 급여마법사의 월 합계 또는 직접 입력한 일반·휴일 시간의 합계입니다. 휴일 지급액은 시간당 추가 지급액으로 따로 계산합니다.</p>}
    {tab === '수당' && <button type="button" className="secondary-button" onClick={() => edit(focused.review, {
      allowances: focused.review.allowances.map(item => item.mode ? item : { ...item, mode: 'none' })
    })}>미확인 수당 모두 해당 없음</button>}
    {tab !== '계산 요약' && <div className={`payroll-table payroll-review${tab === '수당' || tab === '사회보험·세금' ? ' payroll-review-fields' : ''}`}><table>
      <caption>{tab}</caption>
      <thead><tr><th scope="col">근로자</th>{titles.map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{shown.map(({ worker, review, duplicate }) => {
        const rowHeading = <th scope="row">{worker.name}<small>{worker.birth}</small></th>;
        if (tab === '계약·휴일근무') return worker.groups.length ? worker.groups.map(group => {
          const rates = review.rates[group.key] ?? { base: null, holiday: null };
          const update = (change: Partial<typeof rates>) => edit(review, { rates: { ...reviews.find(item => item.workerKey === review.workerKey)?.rates, [group.key]: { ...rates, ...change } } });
          const suffix = worker.name + ' ' + (group.recipient || '상근');
          return <tr key={worker.key + group.key}>{rowHeading}
            <td>{group.recipient || '상근직'} · {group.care}<small>{group.contract?.contractStartDate} · 근무 {group.minutes}분</small>
              {group.rows.some(row => row.inputs?.visits != null || row.inputs?.expected != null || row.inputs?.fullAttendance != null) &&
                <details><summary>근무횟수·만근 기록</summary><ul>
                  {group.rows.filter(row => row.inputs?.visits != null || row.inputs?.expected != null || row.inputs?.fullAttendance != null).map(row =>
                    <li key={row.id}>{row.date || '월 합계'} · 실제 {row.inputs?.visits ?? '미입력'} / 기준 {row.inputs?.expected ?? '미입력'} · {
                      row.inputs?.fullAttendance == null ? '만근 미확인' : row.inputs.fullAttendance ? '만근' : '미만근'
                    }</li>)}
                </ul></details>}
            </td>
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
          return <td key={name}><strong>{name}</strong><select aria-label={label + ' 지급 방식'} value={item.mode} onChange={event => update({ mode: event.target.value as Allowance['mode'] })}>
            <option value="">미확인</option><option value="none">해당 없음</option><option value="fixed">일괄 지급</option><option value="count">횟수 × 단가</option>
          </select>
            {item.mode === 'fixed' && <Money label={label + ' 지급액'} value={item.amount} change={amount => update({ amount })} />}
            {item.mode === 'count' && <><Money label={label + ' 횟수'} value={item.count} change={count => update({ count })} />
              <Money label={label + ' 단가'} value={item.rate} change={rate => update({ rate })} /><small>{won(allowanceAmount(item))}</small></>}
            {name === '차량·동행수당' && worker.rows.some(row => row.inputs?.vehicle != null) &&
              <small>시간표 운행 {worker.rows.reduce((sum, row) => sum + (row.inputs?.vehicle ?? 0), 0)}회</small>}
            {name === '근로자의 날 수당' && worker.rows.some(row => row.inputs?.laborDay != null) &&
              <small>마법사 근무 {worker.rows.reduce((sum, row) => sum + (row.inputs?.laborDay ?? 0), 0)}시간</small>}
            {name === '장기근속장려금' && worker.rows.some(row => row.inputs?.longevity != null) &&
              <small>마법사 연차비율 {[...new Set(worker.rows.flatMap(row => row.inputs?.longevity != null ? [row.inputs.longevity] : []))].join(', ')}</small>}
            {(() => {
              const key = name === '장기근속장려금' ? 'longevityEligible' : name === '중증 수급자 가산' ? 'intensiveEligible' : null;
              if (!key) return null;
              const recorded = worker.rows.filter(row => row[key] != null);
              if (!recorded.length) return null;
              return <small>시간표 기록 해당 {recorded.filter(row => row[key]).length}행 · 미해당 {recorded.filter(row => !row[key]).length}행</small>;
            })()}
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
          return <td key={name}><strong>{name}</strong><select aria-label={label + ' 가입상태'} value={item.status} onChange={event => update({ status: event.target.value })}>
            <option value="">미확인</option><option>가입</option><option>미가입</option><option>해당 없음</option>
          </select>{index < 4 && item.status === '가입' && <Money label={label + ' 근로자 공제액'} value={item.amount} change={amount => update({ amount })} />}
            {index === 4 && <small>가입 상태 확인</small>}</td>;
        })}
          <td><strong>소득세</strong><Money label={worker.name + ' 소득세'} value={review.incomeTax} change={incomeTax => edit(review, { incomeTax })} /></td>
          <td><strong>지방소득세</strong><Money label={worker.name + ' 지방소득세'} value={review.localTax} change={localTax => edit(review, { localTax })} /></td></tr>;
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
                {duplicate && <small>같은 수급자의 공제가 여러 근로자에게 표시됩니다.</small>}</>}
            </td></tr>;
        });
      })}</tbody>
    </table></div>}
    </dialog>}
  </section>;
}
