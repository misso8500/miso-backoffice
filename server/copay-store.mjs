import {randomUUID} from 'node:crypto';
import {workError} from './work-tasks.mjs';
import {parseCopayWorkbook} from './copay-import.mjs';
import {visibleCareNumber} from './recipient-drafts.mjs';

const monthKey=v=>{if(typeof v!=='string'||!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v))throw workError(400,'조회 연월을 확인해 주세요.');return v;};
const empty=()=>({rows:[],filename:'',warnings:[],hash:'',meta:{provider:'미소 노인재가복지센터',code:'',business:'',address:'',bank:'',representative:''}});
const unpack=(month,row)=>({month,version:Number(row?.version||0),updatedAt:row?.updated_at||null,...(row?JSON.parse(row.payload):empty())});
const normalizeName=v=>v.trim().replace(/\s/g,'');
const identity=r=>r.recipientId?`id:${r.recipientId}`:`name:${normalizeName(r.name)}:${r.grade}`;
const safeText=(v,max=100)=>{if(typeof v!=='string'||v.length>max)throw workError(400,'입력 내용의 길이와 형식을 확인해 주세요.');return v.trim();};
export function validateCopayPayment(input,due){
  if(input===null)return null;
  if(!input||typeof input!=='object')throw workError(400,'수납 입력을 확인해 주세요.');
  const date=safeText(input.date,10),amount=input.amount,payer=safeText(input.payer,40),item=safeText(input.item,50);
  if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!Number.isSafeInteger(amount)||amount<0||amount>9999999999||(amount===0&&due>0)||(amount>0&&!payer)||typeof input.bank!=='boolean')throw workError(400,'실제 수납일, 수납금액, 납부자명을 확인해 주세요.');
  return {date,amount,payer,item,bank:input.bank};
}
export function createCopayStore(transaction){
  const select=async(q,month,lock=false)=>(await q(`SELECT * FROM copay_months WHERE month=$1${lock?(q.forUpdate||''):''}`,[month])).rows[0];
  const list=async q=>(await q('SELECT month,version FROM copay_months ORDER BY month DESC',[])).rows.map(r=>({month:r.month,version:Number(r.version)}));
  const people=async q=>(await q('SELECT id,name,long_term_care_number FROM recipients ORDER BY name,id',[])).rows;
  async function write(q,month,body,current,kind,mutate){
    if(!Number.isInteger(body.version)||body.version<0)throw workError(400,'조회 버전이 필요합니다. 새로고침해 주세요.');
    const now=new Date().toISOString();
    await q('INSERT INTO copay_months(month,version,payload,updated_by,updated_at) VALUES($1,0,$2,$3,$4) ON CONFLICT(month) DO NOTHING RETURNING month',[month,JSON.stringify(empty()),current.me.id,now]);
    const old=await select(q,month,true);
    if(Number(old.version)!==body.version)throw workError(409,'다른 사용자가 이 달의 자료를 변경했습니다. 입력은 유지됩니다. 최신 자료를 확인하고 다시 저장하세요.');
    const changed=await mutate(unpack(month,old));
    const payload=Object.fromEntries(['rows','filename','warnings','hash','meta','sums'].filter(key=>changed[key]!==undefined).map(key=>[key,changed[key]]));
    const saved=(await q('UPDATE copay_months SET payload=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE month=$4 AND version=$5 RETURNING *',[JSON.stringify(payload),current.me.id,now,month,body.version])).rows[0];
    if(!saved)throw workError(409,'자료가 변경되었습니다. 새로고침해 주세요.');
    await q('INSERT INTO copay_events(id,month,version,kind,payload,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[randomUUID(),month,saved.version,kind,JSON.stringify(payload),current.me.id,now]);
    return {...unpack(month,saved),months:await list(q)};
  }
  return {
    copayMonth(month){monthKey(month);return transaction(async q=>({...unpack(month,await select(q,month)),months:await list(q)}));},
    async importCopay(body,current){
      if(typeof body.file!=='string'||body.file.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.file))throw workError(400,'2MB 이하의 엑셀 파일을 선택해 주세요.');
      const parsed=await parseCopayWorkbook(Buffer.from(body.file,'base64'),safeText(body.filename,200));
      return transaction(async q=>{
        const recipients=await people(q),links=body.links||{},used=new Set();
        for(const r of parsed.rows){
          const candidates=recipients.filter(p=>r.code?p.long_term_care_number===r.code:normalizeName(p.name)===normalizeName(r.name));
          const explicit=Object.hasOwn(links,String(r.id)),chosen=explicit?links[r.id]:(candidates.length===1?candidates[0].id:null);
          if(chosen!==null&&typeof chosen!=='string')throw workError(400,'수급자 연결을 확인해 주세요.');
          const p=chosen?recipients.find(p=>p.id===chosen):null;
          if(chosen&&!p)throw workError(400,'연결할 수급자를 찾을 수 없습니다.');
          if(body.apply===true&&p&&used.has(p.id))throw workError(400,'한 수급자를 여러 행에 연결할 수 없습니다.');
          if(p)used.add(p.id);
          Object.assign(r,{recipientId:p?.id||null,code:p?visibleCareNumber(p.long_term_care_number):(r.code||''),match:p?'linked':candidates.length>1?'ambiguous':'unmatched'});
        }
        const duplicates=new Set();for(const r of parsed.rows){const key=identity(r);if(body.apply===true&&duplicates.has(key))throw workError(400,'동명이인 행은 수급자 명부에 각각 연결해 주세요.');duplicates.add(key);}
        if(body.apply!==true)return {...parsed,version:Number((await select(q,parsed.month))?.version||0),recipients:recipients.map(p=>({id:p.id,name:p.name})),unmatched:parsed.rows.filter(r=>!r.recipientId).length};
        if(body.acknowledged!==true)throw workError(400,'전처리 결과를 확인한 뒤 적용해 주세요.');
        return write(q,parsed.month,body,current,'import',old=>{
          const prior=new Map(old.rows.map(r=>[identity(r),r]));
          if(old.rows.some(r=>(r.payment||r.familyCare)&&!duplicates.has(identity(r))))throw workError(409,'기존 수납·공제 내역이 있는 수급자가 새 파일에서 빠졌거나 연결이 변경되었습니다. 기존 연결을 유지해 주세요.');
          const rows=parsed.rows.map(r=>{const previous=prior.get(identity(r));return {...r,payment:previous?.payment||null,familyCare:previous?.familyCare||false,deductionNote:previous?.deductionNote||'',statementReviewed:false,receiptReviewed:false};});
          return {...parsed,rows,meta:old.meta};
        });
      });
    },
    saveCopay(month,body,current){
      monthKey(month);
      if(body.changes===undefined&&!body.review&&!body.meta)throw workError(400,'저장할 변경 내용이 없습니다.');
      return transaction(q=>write(q,month,body,current,'update',old=>{
        if(!old.rows.length)throw workError(400,'먼저 종합현황 파일을 가져와 주세요.');
        const rows=old.rows.map(r=>({...r}));
        if(body.changes!==undefined){
          if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>5000)throw workError(400,'저장할 수납 입력을 확인해 주세요.');
          const seen=new Set();
          for(const change of body.changes){
            if(!change||seen.has(change.id))throw workError(400,'중복된 수납 입력입니다.');seen.add(change.id);
            const r=rows.find(r=>r.id===change.id);if(!r)throw workError(400,'종합현황에 없는 수급자입니다.');
            const payment=validateCopayPayment(change.payment,r.sourceTotal??r.copay+(r.extra||0));
            if(typeof change.familyCare!=='boolean')throw workError(400,'가족요양 공제 여부를 확인해 주세요.');
            const deductionNote=safeText(change.deductionNote,100);
            if(change.familyCare&&!deductionNote)throw workError(400,'가족요양 공제 내용을 작성해 주세요.');
            Object.assign(r,{payment,familyCare:change.familyCare,deductionNote,statementReviewed:false,receiptReviewed:false});
          }
        }
        if(body.review){const r=rows.find(r=>r.id===body.review.id);if(!r||!['statement','receipt'].includes(body.review.type))throw workError(400,'확인할 문서를 찾을 수 없습니다.');r[`${body.review.type}Reviewed`]=true;}
        const meta={...old.meta};
        if(body.meta){for(const key of ['provider','code','business','address','bank','representative'])meta[key]=safeText(body.meta[key],key==='address'?300:100);for(const r of rows){r.statementReviewed=false;r.receiptReviewed=false;}}
        return {...old,rows,meta};
      }));
    }
  };
}
