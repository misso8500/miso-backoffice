import {recipientReader,parseFolderId} from './recipient-documents.mjs';
import {prospectDocumentKinds} from '../shared/prospect-details.mjs';
import {workError} from './work-tasks.mjs';
const fileTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/x-hwp','application/haansofthwp','application/vnd.hancom.hwp','application/vnd.hancom.hwpx']);
export function prospectReader(folderId,env=process.env,dependencies={}){
 return recipientReader(folderId,{...env,DRIVE_RECIPIENT_ROOT_IDS:env.DRIVE_PROSPECT_ROOT_IDS?.trim()||env.DRIVE_RECIPIENT_ROOT_IDS,DRIVE_RECIPIENT_FOLDER_IDS:env.DRIVE_PROSPECT_FOLDER_IDS?.trim()||env.DRIVE_RECIPIENT_FOLDER_IDS},{...dependencies,fileTypes});
}
export function normalizeProspectDocuments(body){
 const folderId=body.driveFolderId?parseFolderId(body.driveFolderId):'';
 const files=body.documents??[];if(!Array.isArray(files)||files.length>50)throw workError(400,'관련 파일은 50개까지 연결할 수 있습니다.');
 const seen=new Set();const documents=files.map(file=>{if(!file||typeof file.fileId!=='string'||!/^[-\w]{10,200}$/.test(file.fileId)||!Object.hasOwn(prospectDocumentKinds,file.kind)||seen.has(file.fileId))throw workError(400,'관련 파일과 서류 구분을 확인해 주세요.');seen.add(file.fileId);return {fileId:file.fileId,kind:file.kind};});
 if(documents.length&&!folderId)throw workError(400,'파일을 연결할 구글드라이브 폴더를 먼저 선택해 주세요.');return {driveFolderId:folderId,documents};
}
export async function listProspectFiles(value,reader=prospectReader){const folderId=parseFolderId(value),tree=await reader(folderId).tree();return {folderId,...tree};}
export async function verifyProspectDocuments(value,previous,reader=prospectReader){
 const before=normalizeProspectDocuments(previous||{});
 if(value.driveFolderId===before.driveFolderId&&JSON.stringify(value.documents)===JSON.stringify(before.documents))return {...value,documents:previous?.documents??[]};
 if(!value.driveFolderId)return {...value,documents:[]};
 const {files}=await listProspectFiles(value.driveFolderId,reader);
 return {...value,documents:value.documents.map(ref=>{const file=files.find(file=>file.id===ref.fileId);if(!file)throw workError(400,'선택한 파일을 연결 폴더에서 찾을 수 없습니다. 파일 목록을 다시 불러와 주세요.');return {...ref,name:file.name,mimeType:file.mimeType};})};
}
