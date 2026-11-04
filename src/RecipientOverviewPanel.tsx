import {formatCareNumber} from '../shared/recipient-directory.mjs';
import RecipientRegistrationHistory from './RecipientRegistrationHistory';
import RecipientServiceSignal from './RecipientServiceSignal';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MapPin,FileText,ChevronRight,X,UserRound} from 'lucide-react';
import type {Recipient,BackofficeUser} from './types';
import './NavigationTabs.css';
import './RecipientDirectory.css';
type Section='basic'|'documents'|'plan'|'admin';
type EditorRenderer=(onDirty:(value:boolean)=>void,onBusy:(value:boolean)=>void)=>ReactNode;
export default function RecipientOverviewPanel({recipient,users,status,initialSection='basic',onClose,onNavigate,onSectionChange,renderPlan,renderDocuments,renderProfile,managementActions,busy:externalBusy=false}:{recipient:Recipient;users:BackofficeUser[];status:string;initialSection?:Section;onClose:()=>void;onNavigate:(view:'recipientServices'|'visits')=>void;onSectionChange:()=>void;renderPlan:EditorRenderer;renderDocuments:EditorRenderer;renderProfile:(onDirty:(value:boolean)=>void,onBusy:(value:boolean)=>void,footerTarget:HTMLElement|null)=>ReactNode;managementActions:{label:string;className?:string;disabled?:boolean;onClick:()=>void}[];busy?:boolean}){
 const [section,setSection]=useState<Section>(initialSection),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),scroll=useRef<HTMLDivElement>(null);
 const [footerTarget,setFooterTarget]=useState<HTMLDivElement|null>(null);
 const modified=dirty,locked=busy||externalBusy;
 useEffect(()=>{if(!dialog.current?.open)dialog.current?.showModal();},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(modified||locked){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[modified,locked]);
 function canLeave(){return !locked&&(!modified||window.confirm('저장하지 않은 수급자 입력을 닫고 이동할까요?'));}
 function change(next:Section){if(next===section||!canLeave())return;setDirty(false);setBusy(false);setSection(next);onSectionChange();scroll.current?.scrollTo({top:0});}
 function close(){if(canLeave()){onClose();}}
 function navigate(view:'recipientServices'|'visits'){if(canLeave()){onNavigate(view);}}
 const r=recipient,assigned=users.find(user=>user.id===r.assignedBackofficeUserId),plan=r.planSummary?.executionCurrent;
 const facts=(items:[string,ReactNode][]) => <dl className="recipient-overview-facts">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'미등록'}</dd></div>)}</dl>;
 return <dialog ref={dialog} className="recipient-overview-dialog" aria-label={`${r.name} 상세 정보`} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget){const rect=dialog.current!.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}}}><header className="recipient-overview-header"><div><small>수급자 기초정보 · {r.careGrade||'등급 미등록'}</small><h2>{r.name}</h2><span className="recipient-overview-care-number">{formatCareNumber(r.longTermCareNumber)}</span></div><button type="button" className="icon-button" aria-label="수급자 상세 닫기" disabled={locked} onClick={close}><X size={20}/></button></header>
 <div className="recipient-overview-meta"><span><UserRound size={13}/>{assigned?.name||(r.assignedBackofficeUserId?'담당자 확인 필요':'담당 미배정')}</span><RecipientServiceSignal recipient={r} status={status}/></div>
 <nav className="app-navigation-tabs recipient-detail-tabs" aria-label="수급자 상세 보기">{([['basic','연락·요약'],['documents','관련 서류'],['plan','돌봄·계획'],['admin','이력·관리']] as const).map(([key,label])=><button type="button" key={key} aria-current={section===key?'page':undefined} disabled={locked} onClick={()=>change(key)}>{label}</button>)}</nav>
 <div ref={scroll} className="recipient-overview-body">
 {section==='basic'&&<>{renderProfile(setDirty,setBusy,footerTarget)}
 <section className="recipient-overview-card"><h3>서비스·계획 요약</h3>{facts([['이용계약 기간',r.serviceStartDate&&r.serviceEndDate?`${r.serviceStartDate} ~ ${r.serviceEndDate}`:'기간 미등록'],['현재 제공계획',plan?`${plan.effectiveDate} ~ ${plan.executionEndDate}`:'현재 실행 중인 계획 없음']])}<button type="button" className="recipient-overview-link" onClick={()=>change('plan')}>계획 작성·변경과 이전 내용 확인<ChevronRight size={16}/></button></section>
 {(r.medicalHistory||r.familyNotes||r.hospitalNotes)&&<details className="recipient-overview-reference"><summary>건강·방문 유의사항<small>{(r.medicalHistory||r.hospitalNotes||'가족·돌봄 참고사항').slice(0,70)}</small></summary>{facts([['병력·건강',r.medicalHistory],['가족·돌봄 협조',r.familyNotes],['관련 병원',r.hospitalNotes]])}</details>}
 <section className="recipient-overview-jumps" aria-label="수급자 관련 업무"><button type="button" onClick={()=>change('documents')}><FileText size={19}/><span><strong>관련 서류 조회</strong><small>신분증·인정서·개인별이용계획서</small></span><ChevronRight size={17}/></button><button type="button" onClick={()=>navigate('recipientServices')}><UserRound size={19}/><span><strong>이 달의 서비스 명단</strong><small>이 수급자로 검색해서 이동</small></span><ChevronRight size={17}/></button><button type="button" onClick={()=>navigate('visits')}><MapPin size={19}/><span><strong>라운딩 계획·방문 확인</strong><small>이 수급자의 월별 방문 확인</small></span><ChevronRight size={17}/></button></section>
 <details className="recipient-overview-reference"><summary>인정·등록 정보</summary>{facts([['생년월일',r.birthDate],['장기요양인정번호',formatCareNumber(r.longTermCareNumber)],['장기요양등급',r.careGrade],['서비스 구분',r.serviceType],['업무식별명',r.operationalName]])}</details></>}
 {section==='documents'&&<><p className="recipient-directory-help">확인할 서류만 펼쳐서 조회합니다. 인정기간과 연결 파일은 이 영역에서 관리합니다.</p>{renderDocuments(setDirty,setBusy)}</>}
 {section==='plan'&&<><p className="recipient-directory-help">병력·구인조건·가족사항과 제공계획을 확인하고 작성합니다. 이전 내용은 계획 이력에서 확인할 수 있습니다.</p>{renderPlan(setDirty,setBusy)}</>}
 {section==='admin'&&<><section className="recipient-overview-card"><h3>계약정보 관리</h3><p>담당자와 이용계약 기간은 연락·요약에서 기초정보와 함께 입력하고 저장합니다.</p><button type="button" className="secondary-button" onClick={()=>change('basic')}>기초정보·계약 함께 수정</button></section><RecipientRegistrationHistory recipient={r}/><details className="recipient-overview-reference"><summary>계약해지·복구·명부 관리</summary><div className="recipient-management-actions">{managementActions.map(action=><button key={action.label} type="button" className={action.className||'secondary-button'} disabled={locked||action.disabled} onClick={()=>{if(canLeave()){action.onClick();}}}>{action.label}</button>)}</div></details><details className="recipient-overview-reference"><summary>행정 정보</summary>{facts([['감경 구분',r.reductionType],['관련 지인',r.relatedPeople],['복구·재계약 횟수',`${r.recontractCount}회`]])}</details></>}
 </div><div ref={setFooterTarget} className="recipient-overview-save-host" hidden={section!=='basic'}/></dialog>;
}
