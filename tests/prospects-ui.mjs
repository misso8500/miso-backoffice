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
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [index,viewport]of [{width:1400,height:900},{width:390,height:844}].entries()){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/center-practice-ui.html`);
  await page.getByRole('button',{name:'잠재고객 관리',exact:true}).click();
  await page.getByRole('button',{name:'새 잠재고객',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'잠재고객 등록',exact:true}),name=`상담 고객 ${index}`;
  await dialog.getByLabel('고객 이름',{exact:true}).fill(name);await dialog.getByLabel('고객 연락처',{exact:true}).fill('010-1234-5678');
  await dialog.getByLabel('유입 경로',{exact:true}).fill('병원 소개');await dialog.getByLabel('잠재고객 담당자',{exact:true}).selectOption('staff-shin-suyeon');
  await dialog.getByLabel('상담 요청·현재 상황',{exact:true}).fill('방문요양 문의. 보호자 상담 필요.');
  await dialog.getByLabel('잠재고객 현재 단계',{exact:true}).selectOption('visit_planned');
  await dialog.getByLabel('다음 업무',{exact:true}).fill('센터장 실사 방문');await dialog.getByLabel('다음 확인일',{exact:true}).fill(recurrenceToday());
  await dialog.getByRole('button',{name:'잠재고객 저장',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'잠재고객 상세',exact:true});await detail.getByText('잠재고객을 등록했습니다.',{exact:true}).waitFor();
  const initial=(await call('work/prospects')).prospects.find(row=>row.name===name);assert(initial);assert.equal(initial.stage,'visit_planned');
  assert.equal((await call('recipients')).length,1,'prospect registration must not create recipient records');
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
  await detail.getByRole('button',{name:'복원',exact:true}).click();await detail.getByText('명단을 복원했습니다.',{exact:true}).waitFor();
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
