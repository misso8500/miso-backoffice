import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer as httpServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'vite';
import {recurrenceToday} from '../shared/work-recurrence.mjs';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-prospects-ui-')),dbPath=join(dir,'prospects.sqlite');
const auth=httpServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'google-a',email:'a@example.com',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:'센터장 테스트'}}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
const reservation=httpServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
let api,server,browser;
async function startApi(){api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:dbPath,SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',chunk=>{if(chunk.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});api.once('error',reject);});}
async function call(path,method='GET',body){const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:'Bearer a','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;}
try{
 await startApi();assert.equal((await fetch(`http://127.0.0.1:${port}/api/work/prospects`)).status,401);
 // A contracted recipient is an explicit connection target, never created by a prospect save.
 await call('recipients/bulk-drafts','POST',{rows:[{id:randomUUID(),name:'연결할 계약 고객'}]});
 const db=new DatabaseSync(dbPath);let recipientId;try{recipientId=db.prepare("SELECT id FROM recipients WHERE name='연결할 계약 고객'").get().id;db.prepare("UPDATE recipients SET is_draft=0,service_start_date='2026-01-01',service_end_date='2026-12-31' WHERE id=?").run(recipientId);}finally{db.close();}
 const recipientCount=(await call('recipients')).length;
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [index,viewport]of [{width:1400,height:900},{width:390,height:844}].entries()){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  if(process.argv.includes('--details-qa')){
   await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedAddress=text;}},configurable:true}));
   await page.route('**/api/work/prospect-document-files**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({folderId:'prospect_folder_12345',folderName:'상담 서류',files:[{id:'application_pdf_12345',name:'장기요양신청서.pdf',mimeType:'application/pdf'},{id:'identity_image_12345',name:'고객 신분증.jpg',mimeType:'image/jpeg'}]})}));
  }
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/center-practice-ui.html`);
  await page.getByRole('button',{name:'잠재고객 관리',exact:true}).click();
  await page.getByRole('button',{name:'새 잠재고객',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'잠재고객 등록',exact:true}),name=`상담 고객 ${index}`;
  await dialog.getByLabel('고객 이름',{exact:true}).fill(name);const phone=dialog.getByLabel('고객 연락처',{exact:true});await phone.pressSequentially('0101234');assert.equal(await phone.inputValue(),'010-1234');await phone.pressSequentially('5678');assert.equal(await phone.inputValue(),'010-1234-5678');await dialog.getByText('보호자·주요 연락자',{exact:true}).click();await dialog.getByLabel('연락자 전화번호',{exact:true}).fill('01000001111');assert.equal(await dialog.getByLabel('연락자 전화번호',{exact:true}).inputValue(),'010-0000-1111');
  await dialog.getByLabel('유입 경로',{exact:true}).fill('병원 소개');await dialog.getByLabel('잠재고객 담당자',{exact:true}).selectOption('staff-shin-suyeon');
  await dialog.getByLabel('상담 요청·현재 상황',{exact:true}).fill('방문요양 문의. 보호자 상담 필요.');
  await dialog.getByLabel('잠재고객 현재 단계',{exact:true}).selectOption('visit_planned');
  await dialog.getByLabel('다음 업무',{exact:true}).fill('센터장 실사 방문');const followUp=dialog.getByLabel('다음 확인일',{exact:true});await followUp.fill('123456-11-04');assert.equal(await followUp.inputValue(),'1234-11-04');assert.equal(await followUp.getAttribute('max'),'9999-12-31');await followUp.fill(recurrenceToday());
  if(process.argv.includes('--details-qa')){
   await dialog.getByLabel('고객 주민번호',{exact:true}).fill('9001011234567');assert.equal(await dialog.getByLabel('고객 주민번호',{exact:true}).inputValue(),'900101-1234567');await dialog.getByLabel('보호자 주민번호',{exact:true}).fill('6001012345678');
   await dialog.getByLabel('주민등록지 주소',{exact:true}).fill('광주 주민등록지 1');await dialog.getByRole('button',{name:name+' 주민등록지 주소 복사',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedAddress),'광주 주민등록지 1');await dialog.getByRole('button',{name:'주민등록지와 동일',exact:true}).click();assert.equal(await dialog.getByLabel('실제 거주지 주소',{exact:true}).inputValue(),'광주 주민등록지 1');await dialog.getByLabel('실제 거주지 주소',{exact:true}).fill('광주 실제 거주지 2');
  }
  await dialog.getByRole('button',{name:'잠재고객 저장',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'잠재고객 상세',exact:true});await detail.getByText('잠재고객을 등록했습니다.',{exact:true}).waitFor();
  const initial=(await call('work/prospects')).prospects.find(row=>row.name===name);assert(initial);assert.equal(initial.stage,'visit_planned');assert.equal(initial.phone,'010-1234-5678');assert.equal(initial.contactPhone,'010-0000-1111');assert.equal(initial.nextDate,recurrenceToday());
  assert.equal((await call('recipients')).length,recipientCount,'prospect registration must not create recipient records');
  if(process.argv.includes('--details-qa')){
   assert.equal(initial.residentRegistrationNumber,'');
   const personal=(await call('work/prospects/'+initial.id)).prospect;assert.equal(personal.residentRegistrationNumber,'900101-1234567');assert.equal(personal.contactResidentRegistrationNumber,'600101-2345678');assert.equal(personal.registeredAddress,'광주 주민등록지 1');assert.equal(personal.address,'광주 실제 거주지 2');
   assert(!(await detail.innerText()).includes('900101-1234567'));await detail.getByRole('button',{name:'고객 주민번호 보기',exact:true}).click();await detail.getByText('900101-1234567',{exact:true}).waitFor();await detail.getByRole('button',{name:'고객 주민번호 숨기기',exact:true}).click();
   await detail.getByRole('button',{name:name+' 실제 거주지 주소 복사',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedAddress),'광주 실제 거주지 2');
   await detail.getByRole('button',{name:'정보·일정 수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'잠재고객 수정',exact:true});await edit.getByLabel('구글드라이브 폴더 링크',{exact:true}).fill('https://drive.google.com/drive/folders/prospect_folder_12345');await edit.getByRole('button',{name:'파일 목록 불러오기',exact:true}).click();await edit.getByRole('checkbox',{name:'장기요양신청서.pdf',exact:true}).check();await edit.getByRole('checkbox',{name:'고객 신분증.jpg',exact:true}).check();assert.equal(await edit.getByLabel('장기요양신청서.pdf 서류 종류',{exact:true}).inputValue(),'application');assert.equal(await edit.getByLabel('고객 신분증.jpg 서류 종류',{exact:true}).inputValue(),'customerIdentity');await edit.getByLabel('고객 신분증.jpg 서류 종류',{exact:true}).selectOption('guardianIdentity');await edit.getByText('연결할 파일 2개',{exact:true}).waitFor();assert.equal(await edit.getByRole('link',{name:'파일 열기',exact:true}).first().getAttribute('href'),'https://drive.google.com/file/d/application_pdf_12345/view');
   // Server persistence/authorization is tested with an injected Drive reader in prospect-details.test.mjs.
   await edit.getByLabel('구글드라이브 폴더 링크',{exact:true}).fill('');await edit.getByRole('button',{name:'잠재고객 저장',exact:true}).click();await detail.getByRole('status').filter({hasText:'정보를 저장했습니다.'}).waitFor();await detail.getByRole('button',{name:'잠재고객 창 닫기',exact:true}).click();
   const fixtureDb=new DatabaseSync(dbPath);try{const row=fixtureDb.prepare('SELECT payload FROM work_prospects WHERE id=?').get(initial.id),payload=JSON.parse(row.payload);payload.driveFolderId='prospect_folder_12345';payload.documents=[{fileId:'application_pdf_12345',kind:'application',name:'장기요양신청서.pdf',mimeType:'application/pdf'},{fileId:'identity_image_12345',kind:'guardianIdentity',name:'보호자 신분증.jpg',mimeType:'image/jpeg'}];fixtureDb.prepare('UPDATE work_prospects SET payload=?,version=version+1 WHERE id=?').run(JSON.stringify(payload),initial.id);}finally{fixtureDb.close();}
   await page.reload();await page.getByRole('button',{name:'잠재고객 관리',exact:true}).click();await page.getByRole('button',{name:name+' 잠재고객 상세',exact:true}).click();await detail.getByRole('link',{name:'장기요양신청서.pdf',exact:true}).waitFor();assert.equal(await detail.getByRole('link',{name:'보호자 신분증.jpg',exact:true}).getAttribute('target'),'_blank');assert(await detail.evaluate(node=>node.scrollWidth<=node.clientWidth+2));assert(!(await detail.innerText()).includes('600101-2345678'));await detail.screenshot({path:`/private/tmp/miso-prospect-details-${viewport.width}.png`,animations:'disabled'});assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: identity numbers, masking, separate addresses and copy, Drive picker and saved-file links`);await page.close();continue;
  }
  if(process.argv.includes('--input-qa')){
   await detail.getByRole('button',{name:'정보·일정 수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'잠재고객 수정',exact:true});
   assert.equal(await edit.getByLabel('고객 연락처',{exact:true}).inputValue(),'010-1234-5678');await edit.getByLabel('고객 연락처',{exact:true}).fill('01000001111');assert.equal(await edit.getByLabel('고객 연락처',{exact:true}).inputValue(),'010-0000-1111');
   const date=edit.getByLabel('다음 확인일',{exact:true});await date.fill('123456-11-04');assert.equal(await date.inputValue(),'1234-11-04');await date.fill(recurrenceToday());
   await edit.getByRole('button',{name:'잠재고객 저장',exact:true}).click();await detail.getByRole('status').filter({hasText:'정보를 저장했습니다.'}).waitFor();const latest=await call('work/prospects/'+initial.id);assert.equal(latest.prospect.phone,'010-0000-1111');assert.equal(latest.prospect.contactPhone,'010-0000-1111');assert.equal(latest.prospect.nextDate,recurrenceToday());assert.deepEqual(errors,[]);
   console.log(`PASS ${viewport.width}px: customer/contact live phone separators, four-digit follow-up year, create/edit and persisted values`);await page.close();continue;
  }
  await detail.getByLabel('잠재고객 기록 종류',{exact:true}).selectOption('visit');await detail.getByLabel('활동 내용',{exact:true}).fill('실사 방문 완료. 보호자와 상담한 후 대기하기로 함.');
  await detail.getByRole('checkbox',{name:/이 기록으로/}).check();await detail.getByRole('button',{name:'활동 기록 저장',exact:true}).click();
  await detail.getByText('활동 기록을 저장했습니다. 진행 단계는 변경하지 않았습니다.',{exact:true}).waitFor();
  let saved=await call('work/prospects/'+initial.id);assert.equal(saved.prospect.stage,'visit_planned');assert.equal(saved.prospect.nextAction,'');assert.equal(saved.events[0].kind,'visit');
  await detail.getByRole('button',{name:'정보·일정 수정',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'잠재고객 수정',exact:true});await edit.getByLabel('잠재고객 현재 단계',{exact:true}).selectOption('waiting');await edit.getByLabel('단계 변경·유보·종결 사유',{exact:true}).fill('가족 논의 후 다시 연락하기로 함.');
  await edit.getByRole('button',{name:'잠재고객 저장',exact:true}).click();await detail.getByText('정보를 저장했습니다.',{exact:true}).waitFor();
  await detail.getByRole('button',{name:'보관',exact:true}).click();await detail.getByRole('button',{name:'복원',exact:true}).waitFor();
  await detail.getByRole('button',{name:'잠재고객 창 닫기',exact:true}).click();
  await page.getByLabel('잠재고객 명단 범위',{exact:true}).selectOption('archived');await page.getByRole('button',{name:name+' 잠재고객 상세',exact:true}).click();
  await detail.getByRole('button',{name:'복원',exact:true}).click();await detail.getByRole('status').filter({hasText:'명단을 복원했습니다.'}).waitFor();
  // A stale edit cannot overwrite another user's work, and the typed values remain visible.
  await detail.getByRole('button',{name:'정보·일정 수정',exact:true}).click();await edit.getByLabel('상담 요청·현재 상황',{exact:true}).fill('현재 화면의 작성 내용');
  saved=await call('work/prospects/'+initial.id);await call('work/prospects/'+initial.id,'PUT',{...saved.prospect,source:'다른 화면에서 수정',requestId:randomUUID()});
  await edit.getByRole('button',{name:'잠재고객 저장',exact:true}).click();await edit.getByRole('alert').waitFor();assert.equal(await edit.getByLabel('상담 요청·현재 상황',{exact:true}).inputValue(),'현재 화면의 작성 내용');
  await edit.getByRole('button',{name:'최신 기록 다시 불러오기',exact:true}).click();await detail.getByRole('button',{name:'정보·일정 수정',exact:true}).waitFor();
  if(!index){await detail.getByRole('button',{name:'계약 수급자 연결',exact:true}).click();await edit.getByLabel('계약 수급자 연결',{exact:true}).selectOption(recipientId);await edit.getByRole('button',{name:'잠재고객 저장',exact:true}).click();await detail.getByText('정보를 저장했습니다.',{exact:true}).waitFor();saved=await call('work/prospects/'+initial.id);assert.equal(saved.prospect.stage,'contracted');assert.equal(saved.prospect.linkedRecipientId,recipientId);}
  await detail.getByRole('button',{name:'잠재고객 창 닫기',exact:true}).click();await page.getByLabel('잠재고객 명단 범위',{exact:true}).selectOption('all');
  await page.getByLabel('잠재고객 검색',{exact:true}).fill(name);assert.equal(await page.locator('.prospect-row').count(),1);
  await page.screenshot({path:`/private/tmp/miso-prospects-${viewport.width}.png`,fullPage:true,animations:'disabled'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'mobile horizontal overflow');assert.deepEqual(errors,[]);
  await page.reload();await page.getByRole('button',{name:'잠재고객 관리',exact:true}).click();await page.getByRole('button',{name:name+' 잠재고객 상세',exact:true}).waitFor();
  console.log(`PASS ${viewport.width}px: prospect menu, create, independent visit/follow-up completion, stages, archive/restore, conflict preservation, contract linkage, reload, no overflow`);await page.close();
 }
 const before=await call('work/prospects');api.kill();await once(api,'exit');await startApi();const after=await call('work/prospects');assert.deepEqual(after.prospects,before.prospects);console.log('PASS API restart: prospect records and history persist');
}finally{await browser?.close();await server?.close();if(api&&api.exitCode===null){api.kill();await once(api,'exit');}await new Promise(resolve=>auth.close(resolve));await rm(dir,{recursive:true,force:true});}
