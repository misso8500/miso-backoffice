import {randomUUID} from 'node:crypto';
import {basicInfoFields,basicInfoDraft,registrationIssues,validBasicDate} from '../shared/recipient-basic-info.mjs';
import {recipientNotDeleted} from './recipient-deletions.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const columns={name:'name',birthDate:'birth_date',longTermCareNumber:'long_term_care_number',careGrade:'care_grade',phone:'phone',address:'address',representativeName:'representative_name',representativeRelation:'representative_relation',representativePhone:'representative_phone',operationalName:'operational_name',assignedBackofficeUserId:'assigned_backoffice_user_id',serviceStartDate:'service_start_date',serviceEndDate:'service_end_date',serviceType:'service_type',reductionType:'reduction_type',relatedPeople:'related_people'};
function person(row){const value=Object.fromEntries(Object.entries(columns).map(([key,col])=>[key,row[col]||'']));if(value.longTermCareNumber.startsWith('__draft__:'))value.longTermCareNumber='';return {...value,id:row.id,isDraft:Boolean(row.is_draft),contractRegisteredDate:row.contract_registered_date||'',contractExpiredDate:row.contract_expired_date||'',updatedAt:row.updated_at};}
export function prepareRecipientBasicInfo(body,existing,users=[]){
 if(!existing)throw fail(404,'수급자를 찾을 수 없습니다.');
 if(!body||typeof body.updatedAt!=='string'||body.updatedAt!==existing.updatedAt)throw fail(409,'다른 화면에서 수급자 정보가 변경되었습니다. 입력 내용은 유지됩니다. 최신 정보를 불러와 확인해 주세요.');
 if(Object.keys(body).some(key=>!Object.hasOwn(basicInfoFields,key)&&!['updatedAt','completeRegistration','periodReason'].includes(key)))throw fail(400,'기초정보·담당자·계약정보만 함께 저장할 수 있습니다.');
 if(typeof body.completeRegistration!=='boolean')throw fail(400,'저장할 등록 상태를 확인해 주세요.');
 const value={};for(const [key,max]of Object.entries(basicInfoFields)){if(typeof body[key]!=='string'||body[key].length>max)throw fail(400,'기초정보의 입력 내용과 길이를 확인해 주세요.');value[key]=body[key].trim();}
 if(!value.name)throw fail(400,'수급자 이름을 입력해 주세요.');
 for(const key of ['birthDate','serviceStartDate','serviceEndDate'])if(value[key]&&!validBasicDate(value[key]))throw fail(400,'생년월일과 이용계약 날짜를 실제 달력 날짜로 입력해 주세요.');
 if(value.serviceStartDate&&value.serviceEndDate&&value.serviceStartDate>value.serviceEndDate)throw fail(400,'이용계약 만료일은 시작일 이후로 입력해 주세요.');
 const raw=value.longTermCareNumber;
 if(raw){if(/^[Ll]?\d{10}$/.test(raw))value.longTermCareNumber='L'+raw.replace(/^[Ll]/,'');else if(raw!==existing.longTermCareNumber||existing.isDraft||body.completeRegistration)throw fail(400,'장기요양인정번호는 L과 숫자 10자리로 입력해 주세요.');}
 if(value.assignedBackofficeUserId&&!users.includes(value.assignedBackofficeUserId)&&value.assignedBackofficeUserId!==(existing.assignedBackofficeUserId||''))throw fail(400,'담당 사회복지사를 명부에서 선택해 주세요.');
 if(!['방문','가족'].includes(value.serviceType)||!['일반','감경','기초'].includes(value.reductionType))throw fail(400,'서비스 구분과 감경 구분을 확인해 주세요.');
 const issues=registrationIssues(value),previous=basicInfoDraft(existing);
 if(body.completeRegistration&&issues.length)throw fail(400,`등록 완료 전에 확인해 주세요: ${issues.map(row=>row.label).join(', ')}`);
 if(!existing.isDraft&&issues.some(row=>value[row.key]!==previous[row.key]))throw fail(400,'등록 완료된 수급자의 필수 정보는 비워 둘 수 없습니다. 입력 내용을 확인해 주세요.');
 const periodChanged=value.serviceStartDate!==existing.serviceStartDate||value.serviceEndDate!==existing.serviceEndDate;
 if(periodChanged&&(!['initial','renewal','correction'].includes(body.periodReason)||body.periodReason==='initial'&&!existing.isDraft&&(existing.serviceStartDate||existing.serviceEndDate)))throw fail(400,'계약기간의 변경 사유를 선택해 주세요.');
 const completed=Boolean(existing.isDraft&&body.completeRegistration),isDraft=Boolean(existing.isDraft&&!completed);
 const changedKeys=Object.keys(basicInfoFields).filter(key=>value[key]!==previous[key]);
 return {value,isDraft,completed,periodChanged,changed:changedKeys.length>0||completed,changedKeys,periodReason:body.periodReason,contractRegisteredDate:periodChanged?value.serviceStartDate:existing.contractRegisteredDate,contractExpiredDate:periodChanged?value.serviceEndDate:existing.contractExpiredDate,updatedAt:new Date(Math.max(Date.now(),Date.parse(existing.updatedAt)+1||0)).toISOString()};
}
export function createRecipientBasicInfoStore(transaction){return {
 saveRecipientBasicInfo(id,body){return transaction(async q=>{
  const row=(await q(`SELECT * FROM recipients WHERE id=$1 AND ${recipientNotDeleted()}${q.forUpdate??''}`,[id])).rows[0];
  const existing=row?person(row):null,users=(await q('SELECT id FROM backoffice_users',[])).rows.map(row=>row.id),change=prepareRecipientBasicInfo(body,existing,users);
  if(!change.changed)return;
  if(change.value.longTermCareNumber){const number=change.value.longTermCareNumber;if((await q("SELECT id FROM recipients WHERE id<>$1 AND upper(replace(long_term_care_number,' ','')) IN ($2,$3)",[id,number.toUpperCase(),number.replace(/^[Ll]/,'')])).rows.length)throw fail(409,'같은 장기요양인정번호가 다른 수급자에게 등록되어 있습니다.');}
  const keys=Object.keys(columns),values=keys.map(key=>key==='longTermCareNumber'?change.value[key]||`__draft__:${id}`:key==='assignedBackofficeUserId'?change.value[key]||null:change.value[key]);
  values.push(change.contractRegisteredDate,change.contractExpiredDate,change.updatedAt,id,body.updatedAt);
  const saved=(await q(`UPDATE recipients SET ${keys.map((key,i)=>`${columns[key]}=$${i+1}`).join(',')},contract_registered_date=$${keys.length+1},contract_expired_date=$${keys.length+2},updated_at=$${keys.length+3},is_draft=${change.isDraft?'TRUE':'FALSE'} WHERE id=$${keys.length+4} AND updated_at=$${keys.length+5} RETURNING id`,values)).rows[0];
  if(!saved)throw fail(409,'다른 화면에서 수급자 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.');
  const memo=JSON.stringify({source:'basic-info',previousStartDate:existing.serviceStartDate,previousEndDate:existing.serviceEndDate,previousContractRegisteredDate:existing.contractRegisteredDate,previousContractExpiredDate:existing.contractExpiredDate,registrationCompleted:change.completed,changedFields:change.changedKeys});
  const types=[];if(change.periodChanged)types.push(change.periodReason==='renewal'?'service_renewal':change.periodReason==='initial'?'service_initial':'service_correction');if(change.completed)types.push('registration_completed');
  for(const type of types)await q('INSERT INTO recipient_contract_events(id,recipient_id,type,service_start_date,service_end_date,contract_registered_date,contract_expired_date,memo,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[randomUUID(),id,type,change.value.serviceStartDate,change.value.serviceEndDate,change.contractRegisteredDate,change.contractExpiredDate,memo,change.updatedAt]);
 });}
};}
