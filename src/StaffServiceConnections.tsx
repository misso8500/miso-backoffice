import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import PageHeading from './PageHeading';
import RecipientServiceMonth from './RecipientServiceMonth';
import type { EmploymentContract, Recipient } from './types';
import { conditionOverlapsMonth } from './lib/staff-directory';
import { matchingStatusLabels } from './EmploymentConditionsEditor';
import { workToday } from './lib/work-tasks';
import './StaffDirectory.css';

const money = (amount: number) => amount.toLocaleString('ko-KR') + '원';

export default function StaffServiceConnections({ contracts, recipients, loading, error, onDirty, onBusy, onManageStaff, onEdit, onReload }: {
  contracts: EmploymentContract[]; recipients: Recipient[]; loading: boolean; error: string | null;
  onDirty: (value: boolean) => void; onBusy: (value: boolean) => void; onManageStaff: () => void;
  onEdit: (contract: EmploymentContract) => void; onReload: () => void;
}) {
  const [tab, setTab] = useState<'monthly' | 'conditions'>('monthly');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(workToday().slice(0, 7));
  const [onlyApplicable, setOnlyApplicable] = useState(true);
  const trackDirty = useCallback((value: boolean) => { setDirty(value); onDirty(value); }, [onDirty]);
  const trackBusy = useCallback((value: boolean) => { setBusy(value); onBusy(value); }, [onBusy]);
  function switchTab(next: typeof tab) {
    if (next === tab || busy || (dirty && !window.confirm('적용하지 않은 월별 배정 변경을 닫을까요?'))) return;
    setTab(next);
  }
  const byId = new Map(recipients.map(recipient => [recipient.id, recipient]));
  const recipientName = (id: string) => byId.get(id)?.name ?? '수급자 정보 확인 필요';
  const applicable = contracts.filter(contract => contract.workConditions?.conditions.some(condition => conditionOverlapsMonth(contract, condition, month)));
  const visible = (onlyApplicable ? applicable : contracts).filter(contract => {
    const names = [
      contract.workerName,
      ...(contract.workConditions?.conditions.map(condition => condition.recipientId && recipientName(condition.recipientId)) ?? []),
      ...contract.recipientAssignments.map(item => item.recipientName || recipientName(item.recipientId))
    ];
    return names.some(name => name.toLowerCase().includes(query.trim().toLowerCase()));
  });
  return <section className="recipient-directory-workspace">
    <PageHeading title="서비스 계약 연결" description="수급자별 근무 조건을 기록하고, 계약을 기준으로 월별 서비스 대상과 담당 요양보호사를 채웁니다." />
    <nav className="app-navigation-tabs recipient-directory-tabs" aria-label="서비스 계약 연결 보기">
      <button type="button" aria-current={tab === 'monthly' ? 'page' : undefined} disabled={busy} onClick={() => switchTab('monthly')}>월별 배정</button>
      <button type="button" aria-current={tab === 'conditions' ? 'page' : undefined} disabled={busy} onClick={() => switchTab('conditions')}>수급자별 근무 조건</button>
    </nav>
    {error && <div className="error-banner" role="alert">{error}<button type="button" className="secondary-button" onClick={onReload}>다시 불러오기</button></div>}
    {tab === 'monthly' ? <RecipientServiceMonth connectionContracts={contracts} onManageStaff={onManageStaff}
      onDirty={trackDirty} onBusy={trackBusy} /> :
      <section className="staff-service-conditions" aria-label="수급자별 근무 조건">
        <div className="list-toolbar">
          <div><h2>수급자별 근무 조건</h2><span>근로자와 수급자별 적용 약정</span></div>
          <div className="toolbar-controls">
            <label className="directory-period-filter">계약 적용월<input className="filter-select" type="month" value={month}
              onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
            <label className="valid-toggle"><input type="checkbox" checked={onlyApplicable} onChange={event => setOnlyApplicable(event.target.checked)} /> 이 달 적용 조건만</label>
            <button type="button" className="secondary-button" onClick={onManageStaff}>직원 기초정보</button>
            <label className="search-box"><Search size={18} /><input type="search" aria-label="수급자·근로자 검색" placeholder="수급자·근로자 검색"
              value={query} onChange={event => setQuery(event.target.value)} /></label>
          </div>
        </div>
        {loading && <p role="status">계약 정보를 불러오는 중입니다.</p>}
        <div className="recipient-directory-list directory-table"><table>
          <thead><tr><th scope="col">근로자 · 계약 기간</th><th scope="col">수급자 · 적용 상태</th>
            <th scope="col">임금 · 지원비</th><th scope="col">약정 관리</th></tr></thead>
          <tbody>{visible.flatMap(contract => {
            const all = contract.workConditions?.conditions ?? [];
            const conditions = onlyApplicable ? all.filter(condition => conditionOverlapsMonth(contract, condition, month)) : all;
            const period = `${contract.contractStartDate || '시작일 미등록'} ~ ${contract.contractEndDate || '종료일 미등록'}`;
            const edit = <button type="button" className="secondary-button" onClick={() => onEdit(contract)}>조건 추가·수정</button>;
            if (!conditions.length) return <tr key={contract.id}>
              <th scope="row">{contract.workerName}<small>{period}</small></th>
              <td>{contract.recipientAssignments.map(item => item.recipientName || recipientName(item.recipientId)).join(', ') || '수급자 미지정'}
                <small>수급자별 약정 확인 필요</small></td>
              <td>{contract.wageType || '임금'} {money(contract.wageAmount)}</td>
              <td>{edit}</td>
            </tr>;
            return conditions.map(condition => {
              const term = contract.contractTerms.find(item => item.id === condition.termId);
              return <tr key={contract.id + ':' + condition.termId}>
                <th scope="row">{contract.workerName}<small>{period}</small></th>
                <td><strong>{condition.recipientId ? recipientName(condition.recipientId) : '수급자 미지정'}</strong>
                  <small>{condition.familyCare ? '가족요양' : condition.serviceType} · {matchingStatusLabels[condition.matchingStatus]}</small>
                  <small>{condition.effectiveStartDate} ~ {condition.effectiveEndDate}</small>
                  {condition.changeReason && <small>{condition.changeReason}</small>}</td>
                <td>{term ? `${term.wageType} ${money(term.wageAmount)}` : '임금 미입력'}
                  <small>운전동행 {money(condition.vehicleSupportPerVisit)}/회{term?.otherNonTaxablePay ? ` · 기타 ${money(term.otherNonTaxablePay)}` : ''}</small>
                  <small>근로자 월 교통비 {money(contract.workConditions?.monthlyTravelAllowance ?? 0)}</small></td>
                <td>{edit}</td>
              </tr>;
            });
          })}
          {!visible.length && !loading && <tr><td colSpan={4}>{onlyApplicable ? '이 달에 적용되는 조건이 없습니다. 적용월 필터를 해제하면 기존 계약을 볼 수 있습니다.' : '표시할 계약이 없습니다.'}</td></tr>}</tbody>
        </table></div>
      </section>}
  </section>;
}
