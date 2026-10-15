import RecipientValidityList from './RecipientValidityList';
import RecipientStaffAssignment from "./RecipientStaffAssignment";
import { Pencil, Trash2 } from 'lucide-react';
import type { Recipient, BackofficeUser } from './types';
export type RecipientView = 'basic' | 'plan' | 'validity' | 'address';
const headings: Record<RecipientView, string[]> = {
  basic: ['수급자','계약상태','등급','서비스','담당 사회복지사'],
  plan: ['수급자','병력 · 건강 메모','요양보호사 구인조건 메모','가족사항 메모','관련병원 메모','급여제공계획 메모'],
  validity: ['수급자','계약 상태','이용계약 시작일','이용계약 만료일','활성 상태'],
  address: ['수급자','수급자 주소','수급자 연락처','대표 연락자','담당 사회복지사']
};
export default function RecipientList({ recipients, view, users, status, open, edit, remove, assign, assigning, errors }: {
  recipients: Recipient[]; view: RecipientView; users: BackofficeUser[]; status: (r: Recipient) => string;
  open: (r: Recipient) => void; edit: (r: Recipient) => void; remove: (r: Recipient) => void;
  assign: (r: Recipient,id: string) => void; assigning: string[]; errors: Record<string,string>;
}) {
  if(view==='validity')return <RecipientValidityList recipients={recipients} status={status} open={open} edit={edit} remove={remove}/>;
  const contact = (r: Recipient) => <span><strong>{r.representativeName || '대표 연락자 미등록'}{r.representativeRelation ? ` (${r.representativeRelation})` : ''}</strong><small>{r.representativePhone || '연락처 미등록'}</small></span>;
  const staff = (r: Recipient) => <div className="inline-assignment" onClick={e=>e.stopPropagation()}><select aria-label={`${r.name} 담당 사회복지사`} disabled={assigning.includes(r.id)} value={r.assignedBackofficeUserId || ''} onChange={e=>assign(r,e.target.value)}><option value="">미배정</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>{assigning.includes(r.id)&&<small role="status">저장 중…</small>}{errors[r.id]&&<small role="alert">{errors[r.id]}</small>}</div>;
  return <div className={`recipient-table recipient-focus-table view-${view}`}><div className="table-head">{headings[view].map(h=><span key={h}>{h}</span>)}<span>관리</span></div><ul>{recipients.map(r=><li key={r.id}>
    <div className={`recipient-row ${r.enabled === false?'is-disabled':view==='basic' && status(r)==='계약종료'?'is-contract-expired':''}`} role="button" tabIndex={0} onClick={()=>open(r)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(r);}}}>
      <span className="recipient-name"><strong>{r.name}</strong><small title={r.operationalName || undefined}>{r.operationalName || r.birthDate || '상세 정보 입력 중'}</small>{view==='plan'&&<small className="plan-row-date">{r.planSummary?.executionCurrent ? `${r.planSummary.executionCurrent.effectiveDate} ~ ${r.planSummary.executionCurrent.executionEndDate} 실행 중` : r.planSummary?.version ? '현재 실행 중인 계획 없음 · 최근 입력 정보' : '계획 기간 등록 필요'}{r.planSummary?.regularRequirement&&<span> · 작성·통보 마감 {r.planSummary.regularRequirement.deadline}{r.planSummary.regularRequirement.status==='completed'?' (완료)':r.planSummary.regularRequirement.deadlinePassed?' (마감 지남)':' (준비)'}</span>}</small>}</span>
      {view==='basic'&&<><span><em className={`contract-status status-${status(r)}`}>{status(r)==='정보입력중'?'정보 입력 중':status(r)==='계약종료'&&r.enabled!==false?'계약 만료':status(r)}</em>{status(r)==='계약종료'&&r.enabled!==false&&<small className="contract-expired-note">{r.serviceEndDate} 만료</small>}</span><span>{r.careGrade || '등급 미등록'}</span><span>{r.serviceType}<small>{r.reductionType}</small></span><RecipientStaffAssignment recipient={r} users={users} saving={assigning.includes(r.id)} error={errors[r.id]} onAssign={id=>assign(r,id)} /></>}
      {view==='plan'&&<>{(['medicalHistory','caregiverRequirements','familyNotes','hospitalNotes','servicePlanNotes'] as const).map(key=><span key={key} className={`recipient-plan-cell ${r[key]?'':'is-empty'}`}><span className="recipient-plan-excerpt">{r[key] || '미등록'}</span></span>)}</>}
      {view==='address'&&<><span className="recipient-note-cell">{r.address || '주소 미등록'}</span><span>{r.phone || '연락처 미등록'}</span>{contact(r)}{staff(r)}</>}
      <div className="row-actions"><button type="button" className="row-icon-button" aria-label={`${r.name} ${view==='plan'?'계획 작성·변경':'수정'}`} onClick={e=>{e.stopPropagation();edit(r);}}><Pencil size={17}/></button><button type="button" className="row-icon-button is-danger" aria-label={`${r.name} 삭제`} onClick={e=>{e.stopPropagation();remove(r);}}><Trash2 size={17}/></button></div>
    </div>
  </li>)}</ul></div>;
}
