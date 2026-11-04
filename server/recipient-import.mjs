import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {createHash,randomUUID} from 'node:crypto';

export const importFields = {
 name:'이름',birthDate:'생년월일',longTermCareNumber:'장기요양인정번호',careGrade:'등급',phone:'연락처',address:'주소',
 representativeName:'보호자 이름',representativeRelation:'보호자 관계',representativePhone:'보호자 연락처',
 contractRegisteredDate:'계약일자',serviceStartDate:'계약 시작일',serviceEndDate:'계약 종료일',contractExpiredDate:'계약 만료일'
};
const columns={name:'name',birthDate:'birth_date',longTermCareNumber:'long_term_care_number',careGrade:'care_grade',phone:'phone',address:'address',representativeName:'representative_name',representativeRelation:'representative_relation',representativePhone:'representative_phone',contractRegisteredDate:'contract_registered_date',serviceStartDate:'service_start_date',serviceEndDate:'service_end_date',contractExpiredDate:'contract_expired_date'};
const aliases={name:['성명','이름','수급자','수급자명','수급자이름'],birthDate:['생년월일'],longTermCareNumber:['인정번호','장기요양인정번호'],careGrade:['등급','장기요양등급','요양등급'],phone:['연락처','전화번호','휴대전화','수급자연락처'],address:['주소','거주지','수급자주소'],representativeName:['보호자','보호자성명','보호자이름','주요연락자'],representativeRelation:['보호자관계','수급자와의관계'],representativePhone:['보호자연락처','보호자전화번호'],contractRegisteredDate:['계약일자','계약일','계약등록일'],serviceStartDate:['계약시작일','서비스시작일','이용계약시작일'],serviceEndDate:['계약종료일','서비스종료일','이용계약만료일'],contractExpiredDate:['계약만료일']};
const compact=v=>v.normalize('NFC').replace(/\s/g,'');
const code=v=>v?.trim().replace(/^l/i,'').replace(/\s/g,'')||'';
const fail=message=>Object.assign(new Error(message),{status:400});
const text=cell=>{const v=cell.value;if(v==null)return '';if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==='object'){if(v.formula||v.sharedFormula)throw fail('수식 셀은 값으로 붙여넣은 뒤 업로드해 주세요.');return String(v.text??v.richText?.map(t=>t.text).join('')??'').trim();}return String(v).trim();};
const date=value=>{
 if(/^\d{8}$/.test(value))value=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}`;
 const m=value.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);if(m)value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 return value;
};
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export async function parseRecipientWorkbook(body){
 if(typeof body.filename!=='string'||!body.filename.toLowerCase().endsWith('.xlsx')||typeof body.file!=='string'||body.file.length>3*1024*1024)throw fail('2MB 이하의 .xlsx 파일을 선택해 주세요.');
 const buffer=Buffer.from(body.file,'base64');if(!buffer.length||buffer.length>2*1024*1024)throw fail('2MB 이하의 .xlsx 파일을 선택해 주세요.');
 const workbook=new ExcelJS.Workbook();
 try{
  const zip=await JSZip.loadAsync(buffer);
  // Some exported registers contain broken decorative picture relationships.
  // Pictures are irrelevant to the table: remove both drawings and their sheet references.
  let expanded=0;for(const entry of Object.values(zip.files)){expanded+=entry._data?.uncompressedSize||0;if(expanded>30*1024*1024)throw Error('expanded limit');}
  for(const name of Object.keys(zip.files)){
   if(name.startsWith('xl/drawings/')||name.startsWith('xl/media/'))zip.remove(name);
   else if(/^xl\/worksheets\/sheet\d+\.xml$/.test(name))zip.file(name,(await zip.file(name).async('string')).replace(/<(?:\w+:)?drawing\b[^>]*\/>/g,''));
  }
  await workbook.xlsx.load(await zip.generateAsync({type:'nodebuffer'}));
 }catch{throw fail('엑셀 표를 읽을 수 없습니다. 암호가 없는 .xlsx 파일인지 확인해 주세요.');}
 const rows=[],warnings=[];
 for(const sheet of workbook.worksheets){
  if(sheet.rowCount>5000||sheet.columnCount>100)throw fail('한 시트는 5,000행·100열 이하로 업로드해 주세요.');
  let mapping=null,found=false;
  sheet.eachRow((row,n)=>{
   const labels=new Map();row.eachCell((cell,col)=>{if(cell.value?.formula||cell.value?.sharedFormula)return;if(!cell.isMerged||cell.master.col===col)labels.set(compact(text(cell)),col);});
   const fields={};for(const [field,names]of Object.entries(aliases)){const hits=names.filter(label=>labels.has(label));if(hits.length)fields[field]=labels.get(hits[0]);}
   if(fields.name&&(fields.birthDate||fields.longTermCareNumber)){mapping=fields;found=true;return;}
   if(!mapping)return;
   const data={},errors=[];
   for(const [field,col]of Object.entries(mapping)){
    try{let v=text(row.getCell(col));if(!v)continue;
     if(field.endsWith('Date')){v=date(v);if(!validDate(v))errors.push(`${importFields[field]} 날짜를 확인해 주세요.`);}
     if(field==='longTermCareNumber'){v='L'+code(v);if(!/^L\d{10}$/.test(v))errors.push('인정번호는 L과 숫자 10자리여야 합니다.');}
     if(field==='careGrade'){if(/^[1-5]$/.test(v))v+='등급';if(v==='인지지원')v='인지지원등급';if(!['1등급','2등급','3등급','4등급','5등급','인지지원등급'].includes(v))errors.push('등급을 확인해 주세요.');}
     if(v.length>500)errors.push(`${importFields[field]} 내용이 너무 깁니다.`);data[field]=v;
    }catch(error){errors.push(error.message);}
   }
   if(!Object.keys(data).length)return;
   if(!data.name&&!data.birthDate&&!data.longTermCareNumber&&!data.careGrade)return;
   if(/^(합계|총계|소계|출력일자|페이지)/.test(data.name||''))return;
   if(!data.name)errors.push('이름이 없습니다.');
   if(!data.longTermCareNumber&&!data.birthDate)errors.push('인정번호 또는 생년월일이 필요합니다.');
   if(data.serviceEndDate&&!data.contractExpiredDate)data.contractExpiredDate=data.serviceEndDate;
   rows.push({key:`${sheet.id}:${n}`,source:`${sheet.name} · ${n}행`,data,errors});
  });
  if(!found)warnings.push(`${sheet.name}: 이름과 생년월일 또는 인정번호 열을 찾지 못해 제외했습니다.`);
 }
 if(!rows.length)throw fail('가져올 수급자가 없습니다. 성명·생년월일 또는 인정번호 제목이 있는 표를 확인해 주세요.');
 if(rows.length>500)throw fail('한 번에 최대 500명까지 가져올 수 있습니다.');
 const missingNumbers=rows.filter(row=>!row.data.longTermCareNumber).length;
 if(missingNumbers)warnings.push(`인정번호가 없는 행이 ${missingNumbers}개 있습니다. 엑셀에 ‘장기요양인정번호’ 열을 추가하면 함께 가져옵니다. 기존 인정번호는 유지됩니다.`);
 return {rows,warnings};
}

function personFromRow(row){return {id:row.id,updatedAt:row.updated_at,isDraft:Boolean(row.is_draft),enabled:Boolean(row.enabled),deleted:Boolean(row.deleted),...Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,key==='longTermCareNumber'&&row[column]?.startsWith('__draft__:')?'':row[column]||'']))};}
export function planRecipientImport(parsed,people){
 const plan=[],seen=new Map();
 for(const input of parsed.rows){
  const {data}=input,errors=[...input.errors];let target=null,match='신규';
  const number=data.longTermCareNumber?people.filter(p=>code(p.longTermCareNumber)===code(data.longTermCareNumber)):[];
  const identity=data.birthDate?people.filter(p=>compact(p.name)===compact(data.name||'')&&p.birthDate===data.birthDate):[];
  const candidates=number.length?number:identity;
  if(candidates.length>1)errors.push('일치하는 수급자가 여러 명입니다. 인정번호와 기존 명부를 확인해 주세요.');
  else if(candidates.length===1){target=candidates[0];match=number.length?'인정번호 일치':'이름·생년월일 일치';
   if(target.deleted)errors.push('삭제된 수급자와 일치합니다. 기존 등록 이력을 확인해 주세요.');
   if(number.length&&(compact(target.name)!==compact(data.name||'')||data.birthDate&&target.birthDate&&target.birthDate!==data.birthDate))errors.push('인정번호는 같지만 이름 또는 생년월일이 다릅니다.');
   if(!number.length&&data.longTermCareNumber&&target.longTermCareNumber&&code(target.longTermCareNumber)!==code(data.longTermCareNumber))errors.push('기존 인정번호와 다릅니다. 기존 명부를 확인해 주세요.');
  }
  const changes=[];for(const [field,value]of Object.entries(data)){
   if(field==='longTermCareNumber'&&target&&code(value)===code(target[field]))continue;
   if(value!==String(target?.[field]||''))changes.push({field,label:importFields[field],before:target?.[field]||'',after:value});
  }
  const merged={...target,...data};for(const [start,end]of [['serviceStartDate','serviceEndDate'],['contractRegisteredDate','contractExpiredDate']])if(merged[start]&&merged[end]&&merged[start]>merged[end])errors.push('계약 시작·등록일이 종료일보다 늦습니다.');
  const item={...input,errors,match,targetId:target?.id||null,updatedAt:target?.updatedAt||null,changes,action:target?(changes.length?'update':'unchanged'):'create'};
  const keys=target?['id:'+target.id]:[...(data.longTermCareNumber?['number:'+code(data.longTermCareNumber)]:[]),...(data.birthDate?['identity:'+compact(data.name||'')+':'+data.birthDate]:[])];
  const previous=keys.map(key=>seen.get(key)).find(Boolean),key=previous?.conflictGroup||keys[0]||input.key;
  if(previous){
   const keys=new Set([...Object.keys(previous.data),...Object.keys(data)]);
   if([...keys].every(field=>(previous.data[field]||'')===(data[field]||''))&&!errors.length&&!previous.errors.length){item.action='duplicate';item.match=`${previous.source}과 같은 내용`;}else{item.conflictGroup=key;previous.conflictGroup=key;}
  }
  for(const key of keys)if(!seen.has(key))seen.set(key,item);
  plan.push(item);
 }
 const fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 return {rows:plan,warnings:parsed.warnings,fingerprint};
}

export function createRecipientImportStore(transaction){
 const read=async q=>(await q('SELECT r.*,d.recipient_id AS deleted FROM recipients r LEFT JOIN recipient_deletions d ON d.recipient_id=r.id ORDER BY r.id',[])).rows.map(personFromRow);
 return {
  async previewRecipientImport(body){const parsed=await parseRecipientWorkbook(body);return transaction(async q=>planRecipientImport(parsed,await read(q)));},
  async applyRecipientImport(body){
   const parsed=await parseRecipientWorkbook(body);
   if(!Array.isArray(body.selectedKeys)||!body.selectedKeys.length||new Set(body.selectedKeys).size!==body.selectedKeys.length)throw fail('반영할 행을 선택해 주세요.');
   return transaction(async q=>{
    // Serialize imports and profile edits while matching and writing the same people.
    if(q.forUpdate)await q('LOCK TABLE recipients IN SHARE ROW EXCLUSIVE MODE',[]);
    const preview=planRecipientImport(parsed,await read(q));
    if(body.fingerprint!==preview.fingerprint)throw Object.assign(new Error('미리보기 이후 명부가 변경되었습니다. 미리보기를 다시 확인해 주세요.'),{status:409});
    const selected=preview.rows.filter(row=>body.selectedKeys.includes(row.key));
    if(selected.length!==body.selectedKeys.length||selected.some(row=>row.errors.length||!['create','update'].includes(row.action)))throw fail('오류·중복·변경 없는 행은 반영할 수 없습니다.');
    const groups=selected.map(row=>row.conflictGroup).filter(Boolean);if(new Set(groups).size!==groups.length)throw fail('같은 수급자는 반영할 한 행만 선택해 주세요.');
    let created=0,updated=0;
    for(const row of selected){
     const now=new Date().toISOString(),id=row.targetId||randomUUID();
     if(row.action==='create'){
      const base={name:'',birthDate:'',longTermCareNumber:`__draft__:${id}`,careGrade:'',phone:'',address:'',representativeName:'',representativeRelation:'',representativePhone:'',serviceStartDate:'',serviceEndDate:'',contractRegisteredDate:'',contractExpiredDate:'',...row.data};
      const keys=Object.keys(columns),values=keys.map(key=>base[key]);
      await q(`INSERT INTO recipients(id,${keys.map(key=>columns[key]).join(',')},is_draft,enabled,service_type,caregiver_requirements,reduction_type,related_people,created_at,updated_at) VALUES($1,${keys.map((_,i)=>'$'+(i+2)).join(',')},TRUE,TRUE,'방문','','일반','',$${keys.length+2},$${keys.length+2}) RETURNING id`,[id,...values,now]);created++;
     }else{
      const values=row.changes.map(change=>change.after),sets=row.changes.map((change,i)=>`${columns[change.field]}=$${i+1}`);
      await q(`UPDATE recipients SET ${sets.join(',')},updated_at=$${values.length+1} WHERE id=$${values.length+2} RETURNING id`,[...values,now,id]);updated++;
      if(row.changes.some(change=>['serviceStartDate','serviceEndDate'].includes(change.field))){
       const period=(await q('SELECT service_start_date,service_end_date FROM recipients WHERE id=$1',[id])).rows[0];
       await q('INSERT INTO recipient_contract_events(id,recipient_id,type,service_start_date,service_end_date,memo,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[randomUUID(),id,'service_correction',period.service_start_date,period.service_end_date,JSON.stringify({source:'xlsx',filename:body.filename,previousStartDate:row.changes.find(c=>c.field==='serviceStartDate')?.before??period.service_start_date,previousEndDate:row.changes.find(c=>c.field==='serviceEndDate')?.before??period.service_end_date}),now]);
      }
     }
    }
    return {created,updated};
   });
  }
 };
}
