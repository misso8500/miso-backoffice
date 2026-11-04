import {createDriveReader,DriveError} from './drive.mjs';
import {parseFolderId} from './recipient-documents.mjs';
import {workError} from './work-tasks.mjs';
import {workRequestId} from './work-journal.mjs';
const templateTypes=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/haansofthwp','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','image/jpeg','image/png','image/webp']);
export function institutionTemplateReader(folderId,env=process.env,dependencies={}){
 const allowed=(env.DRIVE_OFFICIAL_TEMPLATE_FOLDER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(env.DRIVE_OFFICIAL_TEMPLATE_FOLDER_ID?.trim())allowed.push(env.DRIVE_OFFICIAL_TEMPLATE_FOLDER_ID.trim());
 const roots=(env.DRIVE_OFFICIAL_TEMPLATE_ROOT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!allowed.includes(folderId)&&!roots.length)throw new DriveError(403,'공문 서식 폴더가 승인되지 않았습니다. 서버의 공문 서식 폴더 설정을 확인해 주세요.');
 const reader=createDriveReader({...env,DRIVE_TEST_FOLDER_ID:folderId,DRIVE_INCLUDE_SUBFOLDERS:'true'},{...dependencies,fileTypes:templateTypes});
 let approval;const approve=()=>allowed.includes(folderId)?Promise.resolve():approval??=reader.assertRootAllowed(roots);
 return {async tree(){await approve();return reader.tree();},async file(id){await approve();return reader.file(id);}};
}
const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw workError(400,'기관 연락처의 입력 내용을 확인해 주세요.');return value.trim();};
const normalizeContact=body=>{const value={name:text(body.name,150),department:text(body.department??'',150),phone:text(body.phone??'',60),fax:text(body.fax??'',60),memo:text(body.memo??'',2000),archived:body.archived??false};if(!value.name||typeof value.archived!=='boolean')throw workError(400,'기관명과 보관 상태를 확인해 주세요.');return value;};
const contact=row=>({id:row.id,...JSON.parse(row.payload),version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at});
const version=(row,value)=>{if(!Number.isInteger(value)||Number(row?.version??0)!==value)throw workError(409,'다른 화면에서 자료가 변경되었습니다. 입력은 유지됩니다. 최신 목록을 다시 확인해 주세요.');};
export function createInstitutionStore(transaction,dependencies={}){
 const reader=dependencies.reader??institutionTemplateReader,env=dependencies.env??process.env;
 const settings=async q=>{const row=(await q("SELECT * FROM work_institution_template_settings WHERE id='official'",[])).rows[0];return row?{...JSON.parse(row.payload),version:Number(row.version),updatedAt:row.updated_at}:{folderId:env.DRIVE_OFFICIAL_TEMPLATE_FOLDER_ID?.trim()||'',version:0,updatedAt:null};};
 return {
  institutionContacts(){return transaction(async q=>({contacts:(await q('SELECT * FROM work_institution_contacts ORDER BY created_at,id',[])).rows.map(contact)}));},
  async saveInstitutionContact(id,body,current){const value=normalizeContact(body),requestId=workRequestId(body.requestId);return transaction(async q=>{
   const key=id||requestId,old=(await q(`SELECT * FROM work_institution_contacts WHERE id=$1${q.forUpdate??''}`,[key])).rows[0];
   if(!id&&old){if(old.updated_by===current.me.id&&JSON.stringify(JSON.parse(old.payload))===JSON.stringify(value))return contact(old);throw workError(409,'이미 처리된 등록 요청입니다. 최신 목록을 확인해 주세요.') ;}
   if(id&&!old)throw workError(404,'기관 연락처를 찾을 수 없습니다.');version(old,body.version);
   const now=new Date().toISOString();let saved;
   if(old)saved=(await q('UPDATE work_institution_contacts SET payload=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE id=$4 AND version=$5 RETURNING *',[JSON.stringify(value),current.me.id,now,key,body.version])).rows[0];
   else saved=(await q('INSERT INTO work_institution_contacts(id,payload,version,updated_by,created_at,updated_at) VALUES($1,$2,1,$3,$4,$4) ON CONFLICT(id) DO NOTHING RETURNING *',[key,JSON.stringify(value),current.me.id,now])).rows[0];
   if(!saved)throw workError(409,'등록 상태가 변경되었습니다. 최신 목록을 확인해 주세요.');return contact(saved);
  });},
  institutionTemplateSettings(){return transaction(settings);},
  async institutionTemplates(){const value=await transaction(settings);if(!value.folderId)return {...value,folderName:'',files:[]};return {...value,...await reader(parseFolderId(value.folderId)).tree()};},
  async saveInstitutionTemplateSettings(body,current){const folderId=body.folderId?parseFolderId(body.folderId):'',tree=folderId?await reader(folderId).tree():{folderName:'',files:[]};return transaction(async q=>{
   const now=new Date().toISOString();await q("INSERT INTO work_institution_template_settings(id,payload,version,updated_by,updated_at) VALUES('official',$1,0,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id",[JSON.stringify({folderId:''}),current.me.id,now]);
   const old=(await q(`SELECT * FROM work_institution_template_settings WHERE id='official'${q.forUpdate??''}`,[])).rows[0];version(old,body.version);
   const saved=(await q("UPDATE work_institution_template_settings SET payload=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE id='official' AND version=$4 RETURNING *",[JSON.stringify({folderId}),current.me.id,now,body.version])).rows[0];if(!saved)throw workError(409,'폴더 설정이 변경되었습니다. 다시 확인해 주세요.');return {folderId,version:Number(saved.version),updatedAt:saved.updated_at,...tree};
  });},
  async downloadInstitutionTemplate(id){const value=await transaction(settings);if(!value.folderId)throw workError(404,'연결된 공문 서식 폴더가 없습니다.');return reader(parseFolderId(value.folderId)).file(id);}
 };
}
export function sendInstitutionFile(response,file){
 const name=encodeURIComponent(file.name).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
 response.writeHead(200,{'Content-Type':file.mimeType,'Content-Length':file.bytes.length,'Content-Disposition':`attachment; filename="document"; filename*=UTF-8''${name}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});response.end(file.bytes);
}
