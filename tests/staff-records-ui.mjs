import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-staff-ui-'));
const auth=httpServer((req,res)=>{const token=req.headers.authorization?.split(' ')[1]??'a';res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:`google-${token}`,email:`${token}@example.com`,email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:`직원 ${token}`}}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
const reservation=httpServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:join(dir,'records.sqlite'),SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com,b@example.com'},stdio:['ignore','pipe','pipe']});
let server,browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',chunk=>{if(chunk.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});api.once('error',reject);});
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const staffTargets=new Map();
 async function call(token,path,method='GET',body){if(path.startsWith('work/records/')&&!path.includes('?'))path+='?staffId='+encodeURIComponent(staffTargets.get(token));const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;}
 async function verifyPrint(page,button,title,minimum,maximum){const before=await page.locator('iframe[title="근무기록 인쇄"]').count();await button.click();await page.waitForFunction(count=>document.querySelectorAll('iframe[title="근무기록 인쇄"]').length>count,before);const iframe=page.locator('iframe[title="근무기록 인쇄"]').last();const frame=await(await iframe.elementHandle()).contentFrame();await frame.getByText(title,{exact:false}).first().waitFor({state:'attached'});const paper=await browser.newPage();await paper.setContent(await frame.content());await paper.evaluate(()=>document.fonts.ready);const pdf=await paper.pdf({format:'A4',printBackground:true});const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert(pages>=minimum&&pages<=maximum,`Print ${title}: ${pages} pages`);await paper.close();return pages;}
 for(const [index,viewport]of[{width:1400,height:900},{width:390,height:844}].entries()){
  const token=index?'b':'a',page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'근무시간 정정 사유':undefined));
  await page.addInitScript(()=>{window.print=()=>{};});
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:`export const getAuthHeaders=async()=>({Authorization:'Bearer ${token}'});export const authFailureEvent='test';`}));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/staff-records-ui.html`);
  const context=await call(token,'work/context');const staff=context.assignees[index];staffTargets.set(token,staff.id);
  await page.getByLabel('기록 대상 직원',{exact:true}).selectOption(staff.id);await page.getByLabel('서류 성명',{exact:true}).fill(`테스트 직원 ${token}`);await page.getByLabel('기관명',{exact:true}).fill('테스트 기관');await page.getByRole('button',{name:'기본정보 저장',exact:true}).click();
  await page.getByRole('button',{name:'출근부',exact:true}).waitFor();
  await call(token,'work/executions','POST',{requestId:randomUUID(),date:'2026-09-01',assigneeId:staff.id,period:'morning',content:'수급자 서류 확인',category:'operations',related:[]});
  const longText='오후 업무 내용을 확인하고 서류를 정리합니다. '.repeat(85);
  await call(token,'work/executions','POST',{requestId:randomUUID(),date:'2026-09-01',assigneeId:staff.id,period:'unknown',content:longText,category:'operations',related:[]});
  await page.getByLabel('작성 월',{exact:true}).fill('2026-09');await page.getByRole('button',{name:'월 출근부 자동 작성',exact:true}).click();await page.getByText('월 출근부 초안을 작성하고 저장했습니다.',{exact:false}).waitFor();assert.equal(await page.getByLabel('2026-09-01 근태',{exact:true}).inputValue(),'work');assert.equal(await page.getByLabel('2026-09-05 근태',{exact:true}).inputValue(),'off');await page.getByRole('button',{name:'이달 확정',exact:true}).click();await page.getByText('이달 기록을 확정했습니다.',{exact:true}).waitFor();
  assert.equal(await verifyPrint(page,page.getByRole('button',{name:'확정 월 인쇄',exact:true}),'출근부',1,1),1);
  await page.getByRole('button',{name:'수정 사유 남기고 다시 열기',exact:true}).click();await page.getByLabel('2026-09-01 인정시간',{exact:true}).fill('7');await page.getByRole('button',{name:'월 출근부 자동 작성',exact:true}).click();await page.getByText('월 출근부 초안을 작성하고 저장했습니다.',{exact:false}).waitFor();assert.equal(await page.getByLabel('2026-09-01 인정시간',{exact:true}).inputValue(),'7');await page.getByRole('button',{name:'이달 확정',exact:true}).click();await page.getByText('이달 기록을 확정했습니다.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'업무수행일지',exact:true}).click();await page.getByLabel('오전 업무',{exact:true}).waitFor();assert.equal(await page.getByLabel('오전 업무',{exact:true}).inputValue(),'수급자 서류 확인');
  await page.getByLabel('오후 업무',{exact:true}).fill(longText);await page.getByLabel('시간대 미확인 업무',{exact:true}).fill('');await page.getByRole('button',{name:'전체 검토 표시',exact:true}).click();await page.getByRole('button',{name:'이달 확정',exact:true}).click();await page.getByText('이달 기록을 확정했습니다.',{exact:true}).waitFor();
  const journalPages=await verifyPrint(page,page.getByRole('button',{name:'선택일 인쇄',exact:true}),'업 무 일 지',2,8);
  await page.getByRole('button',{name:'연차대장',exact:true}).click();await page.getByText('연차 일수 직접 등록',{exact:true}).click();await page.getByLabel('부여 일수',{exact:true}).fill(String(15+index));await page.getByLabel('기존 사용분',{exact:true}).fill('2');await page.getByRole('button',{name:'일수 저장',exact:true}).click();await page.getByText('연차 일수를 저장했습니다.',{exact:true}).waitFor();
  await page.getByLabel('연차 날짜',{exact:true}).fill('2026-09-10');await page.getByLabel('휴가 사유',{exact:true}).fill('개인사유');await page.getByLabel('업무 대행자',{exact:true}).fill('대행 직원');await page.getByRole('button',{name:'계획 확정',exact:true}).click();await page.getByRole('button',{name:'사용 완료',exact:true}).click();await page.getByText('연차 계획을 저장했습니다.',{exact:true}).waitFor();
  await verifyPrint(page,page.getByRole('button',{name:'확정 서류 인쇄',exact:true}),'연 차 사 용 계 획 서',1,1);
  await page.getByRole('button',{name:'출근부',exact:true}).click();
  await page.getByRole('button',{name:'수정 사유 남기고 다시 열기',exact:true}).click();
  for(const day of [10,11]){
    await page.getByLabel(`2026-09-${day} 근태`,{exact:true}).selectOption('leave');
  }
  await page.getByRole('button',{name:'이달 확정',exact:true}).click();await page.getByText('이달 기록을 확정했습니다.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'연차대장',exact:true}).click();
  await verifyPrint(page,page.getByRole('button',{name:'연차대장 인쇄',exact:true}),'연차대장',1,1);
  const ledger=await call(token,'work/records/leave/2026');assert.equal(ledger.totals.used,4);assert.equal(ledger.totals.remaining,11+index);assert.equal(ledger.attendanceUses.length,2);
  await page.getByRole('button',{name:/2026-09-11.*사용계획서 작성·확인/}).click();assert.equal(await page.getByLabel('연차 날짜',{exact:true}).inputValue(),'2026-09-11');
  const document=await call(token,'work/records/attendance/2026-09');assert.equal(document.document.payload.rows[0].hours,7);assert.equal(document.sourceChanged,false);
  const another=context.assignees[2];
  await page.getByLabel('기록 대상 직원',{exact:true}).selectOption(another.id);
  await page.getByRole('button',{name:'기본정보 저장',exact:true}).or(page.getByRole('button',{name:'연차대장',exact:true})).first().waitFor();
  if(await page.getByRole('button',{name:'기본정보 저장',exact:true}).count())await page.getByRole('button',{name:'기본정보 저장',exact:true}).click();
  await page.getByRole('button',{name:'연차대장',exact:true}).click();
  assert.equal((await call(token,'work/records/leave/2026?staffId='+another.id)).totals.granted,0);
  await page.getByLabel('기록 대상 직원',{exact:true}).selectOption(staff.id);
  await page.getByRole('button',{name:'연차대장',exact:true}).click();await page.locator('.staff-metrics strong').first().waitFor();
  assert.equal(await page.locator('.staff-metrics strong').first().textContent(),String(15+index)+'일');
  if(index){await page.getByLabel('기록 대상 직원',{exact:true}).selectOption(context.assignees[0].id);await page.getByRole('button',{name:'연차대장',exact:true}).click();await page.locator('.staff-metrics strong').first().waitFor();assert.equal(await page.locator('.staff-metrics strong').first().textContent(),'15일');}
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: profile, attendance/reopen, journal, leave; A4 attendance=1, journal=${journalPages}, leave form=1, ledger=1`);await page.close();
 }
}finally{await browser?.close();await server?.close();if(api.exitCode===null){api.kill();await once(api,'exit');}await new Promise(resolve=>auth.close(resolve));await rm(dir,{recursive:true,force:true});}
