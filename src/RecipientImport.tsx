import {useEffect,useRef,useState} from 'react';
import {FileSpreadsheet,RefreshCw,Upload,X} from 'lucide-react';
import {requestJson} from './storage';
import './RecipientImport.css';

type ImportRow={key:string;source:string;data:Record<string,string>;errors:string[];match:string;targetId:string|null;updatedAt:string|null;changes:{field:string;label:string;before:string;after:string}[];action:'create'|'update'|'unchanged'|'duplicate';conflictGroup?:string};
type Preview={rows:ImportRow[];warnings:string[];fingerprint:string};
type Source={filename:string;file:string};
const actionLabel={create:'신규 등록',update:'정보 수정',unchanged:'변경 없음',duplicate:'중복 제외'};
const eligible=(row:ImportRow)=>!row.errors.length&&['create','update'].includes(row.action);
const fileSource=(file:File)=>new Promise<Source>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({filename:file.name,file:String(reader.result).split(',')[1]});reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다. 다시 선택해 주세요.'));reader.readAsDataURL(file);});
export default function RecipientImport({onClose,onApplied}:{onClose:()=>void;onApplied:(result:{created:number;updated:number})=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[source,setSource]=useState<Source|null>(null),[preview,setPreview]=useState<Preview|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState<'preview'|'apply'|null>(null),[error,setError]=useState(''),[filter,setFilter]=useState('all');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const close=()=>{if(!busy)onClose();};
 async function inspect(next:Source){
  setBusy('preview');setError('');setPreview(null);setSelected([]);setFilter('all');
  try{const value=await requestJson<Preview>('/api/work/recipient-import/preview',{method:'POST',body:JSON.stringify(next)});setPreview(value);setSelected(value.rows.filter(row=>eligible(row)&&!row.conflictGroup).map(row=>row.key));}
  catch(e){setError(e instanceof Error?e.message:'파일을 확인하지 못했습니다.');}finally{setBusy(null);}
 }
 async function choose(file?:File){
  if(!file)return;
  setPreview(null);setSelected([]);setSource(null);
  if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>2*1024*1024){setError('2MB 이하의 .xlsx 파일을 선택해 주세요.');return;}
  setBusy('preview');setError('');try{const next=await fileSource(file);setSource(next);await inspect(next);}catch(e){setError(e instanceof Error?e.message:'파일을 읽지 못했습니다.');setBusy(null);}
 }
 async function apply(){if(!preview||!source||!selected.length)return;setBusy('apply');setError('');
  try{const result=await requestJson<{created:number;updated:number}>('/api/work/recipient-import/apply',{method:'POST',body:JSON.stringify({...source,fingerprint:preview.fingerprint,selectedKeys:selected})});onApplied(result);}
  catch(e){setError(e instanceof Error?e.message:'반영하지 못했습니다. 미리보기를 다시 확인해 주세요.');}finally{setBusy(null);}
 }
 function toggle(row:ImportRow){setSelected(current=>current.includes(row.key)?current.filter(key=>key!==row.key):[...current.filter(key=>!row.conflictGroup||preview?.rows.find(r=>r.key===key)?.conflictGroup!==row.conflictGroup),row.key]);}
 const rows=preview?.rows||[],shown=rows.filter(row=>filter==='all'||(filter==='review'?(row.errors.length>0||Boolean(row.conflictGroup)):row.action===filter));
 return <dialog ref={dialog} className="recipient-import-dialog" aria-labelledby="recipient-import-title" onCancel={event=>{event.preventDefault();close();}}>
  <header><div><small>수급자 기초정보</small><h2 id="recipient-import-title"><FileSpreadsheet size={23}/> 엑셀로 등록·업데이트</h2></div><button type="button" className="icon-button" aria-label="엑셀 가져오기 닫기" disabled={Boolean(busy)} onClick={close}><X size={20}/></button></header>
  <div className="recipient-import-body" aria-busy={Boolean(busy)}>
   <div className="recipient-import-guide"><strong>파일 선택 → 변경 내용 확인 → 선택한 행 반영</strong><p>인정번호로 찾고, 번호가 없으면 이름과 생년월일로 찾습니다. 빈 셀은 기존 정보를 유지합니다. 새 수급자는 ‘기초정보 입력 중’으로 등록됩니다.</p><p>성명·생년월일·등급·계약일자·계약시작일·계약종료일이 있는 명부와 인정번호·연락처·주소·보호자 열을 읽습니다. 모든 시트를 함께 확인하며, 최종급여 제공일자는 계약기간으로 사용하지 않습니다.</p></div>
   <div className="recipient-import-file"><label>수급자 목록 XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={event=>{void choose(event.target.files?.[0]);event.target.value='';}}/></label>{source&&<span>{source.filename}</span>}{source&&<button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={()=>void inspect(source)}><RefreshCw size={15}/> 미리보기 다시 확인</button>}</div>
   {busy&&<div className="recipient-import-loading" role="status"><RefreshCw size={22}/><span>{busy==='preview'?'파일과 기존 명부를 비교하고 있습니다.':'선택한 정보를 반영하고 있습니다.'}</span></div>}
   {error&&<div className="recipient-contact-error" role="alert">{error}</div>}
   {preview&&<>
    <div className="recipient-import-summary">{[['all','전체',rows.length],['create','신규',rows.filter(row=>row.action==='create').length],['update','수정',rows.filter(row=>row.action==='update').length],['review','확인 필요',rows.filter(row=>row.errors.length||row.conflictGroup).length]].map(([value,label,count])=><button type="button" key={value} aria-pressed={filter===value} disabled={Boolean(busy)} onClick={()=>setFilter(String(value))}><span>{label}</span><strong>{count}<small>행</small></strong></button>)}</div>
    {preview.warnings.map(warning=><p className="recipient-import-warning" key={warning}>{warning}</p>)}
    {rows.some(row=>row.conflictGroup)&&<p className="recipient-import-warning">같은 수급자의 계약이 여러 행이면 반영할 한 행을 선택해 주세요. 해당 수급자의 다른 행은 자동으로 선택 해제됩니다.</p>}
    <div className="recipient-import-selection"><span>반영할 행 {selected.length}개 선택</span><button type="button" disabled={Boolean(busy)} onClick={()=>setSelected(rows.filter(row=>eligible(row)&&!row.conflictGroup).map(row=>row.key))}>충돌 없는 행 모두 선택</button><button type="button" disabled={Boolean(busy)} onClick={()=>setSelected([])}>선택 해제</button></div>
    <div className="recipient-import-rows">{shown.map(row=><article key={row.key} className={`recipient-import-row ${row.errors.length?'has-error':''}`}>
     <div className="recipient-import-row-heading"><label><input type="checkbox" checked={selected.includes(row.key)} disabled={Boolean(busy)||!eligible(row)} onChange={()=>toggle(row)} aria-label={`${row.source} ${row.data.name||'이름 없음'} 반영`}/><strong>{row.data.name||'이름 없음'}</strong><span>{row.data.birthDate||row.data.longTermCareNumber||'식별정보 없음'}</span></label><em>{row.errors.length?'오류':row.conflictGroup?'한 행 선택 필요':actionLabel[row.action]}</em></div>
     <small>{row.source} · {row.match}{row.action==='create'?' · 기초정보 입력 중으로 등록':''}</small>
     {row.errors.map((message,i)=><p className="recipient-import-row-error" key={i}>{message}</p>)}
     {!!row.changes.length&&<details open={Boolean(row.conflictGroup)}><summary>{row.action==='create'?'가져올 정보':'변경 내용'} {row.changes.length}개{row.data.serviceStartDate&&` · ${row.data.serviceStartDate} ~ ${row.data.serviceEndDate||'종료일 미입력'}`}</summary><dl>{row.changes.map(change=><div key={change.field}><dt>{change.label}</dt><dd>{row.action==='update'&&<><span className="recipient-import-before">{change.before||'미등록'}</span><span aria-label="변경 후"> → </span></>}<strong>{change.after}</strong></dd></div>)}</dl></details>}
    </article>)}</div>
   </>}
  </div>
  <footer><span>선택한 행만 반영합니다. 기존 계약 상태·담당자·돌봄 기록은 유지합니다.</span><div><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={close}>닫기</button><button type="button" className="primary-button" disabled={Boolean(busy)||!preview||!selected.length} onClick={()=>void apply()}><Upload size={16}/> 선택한 {selected.length}행 반영</button></div></footer>
 </dialog>;
}
