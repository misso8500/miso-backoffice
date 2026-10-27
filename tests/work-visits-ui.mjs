import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'vite';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-visits-ui-')),dbPath=join(dir,'visits.sqlite');
const auth=httpServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'google-a',email:'a@example.com',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:'테스트 직원'}}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
const reservation=httpServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:dbPath,SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com'},stdio:['ignore','pipe','pipe']});
let server,browser;
async function call(path,method='GET',body){const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:'Bearer a','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert(response.ok,JSON.stringify(data));return data;}
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',chunk=>{if(chunk.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});api.once('error',reject);});
 const ids=[];for(const name of ['라운딩검증 데스크톱','라운딩검증 모바일']){const id=randomUUID();ids.push(id);await call('recipients/bulk-drafts','POST',{rows:[{id,name}]});}
 const db=new DatabaseSync(dbPath);try{for(const id of ids)db.prepare("UPDATE recipients SET is_draft=0,contract_registered_date='2026-09-01',contract_expired_date='2026-09-30',service_start_date='2026-09-01',service_end_date='2026-09-30' WHERE id=?").run(id);}finally{db.close();}
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const [index,viewport]of[{width:1400,height:900},{width:390,height:844}].entries()){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-visits-ui.html`);
  await page.getByRole('button',{name:'라운딩',exact:true}).click();await page.getByLabel('라운딩 조회 월',{exact:true}).fill('2026-09');
  const name=index?'라운딩검증 모바일':'라운딩검증 데스크톱';const row=page.locator('.work-visit-row').filter({has:page.getByText(name,{exact:true})});await row.waitFor();
  const selector=page.getByLabel(name+' 라운딩 담당자',{exact:true});assert.deepEqual(await selector.locator('option').allTextContents(),['사회복지사 선택','박준규','황영상']);await selector.selectOption('staff-park-jungyu');
  await row.getByRole('button',{name:'확인 후 라운딩 할일 생성',exact:true}).click();await row.getByRole('button',{name:'라운딩 완료',exact:true}).waitFor();
  let month=await call('work/visits/2026-09');const task=month.rows.find(item=>item.recipientId===ids[index]).task;
  assert((await call('work/tasks?status=all')).some(item=>item.id===task.id));
  // Complete from the ordinary task endpoint, then verify the roster observes the same task.
  await call(`work/tasks/${task.id}/complete`,'POST',{version:task.version});await page.getByRole('button',{name:'새로고침',exact:true}).click();await row.getByText('✓ 라운딩 완료',{exact:true}).waitFor();
  const current=(await call('work/visits/2026-09')).rows.find(item=>item.recipientId===ids[index]).task;await call(`work/tasks/${task.id}/reopen`,'POST',{version:current.version});await page.getByRole('button',{name:'새로고침',exact:true}).click();await row.getByRole('button',{name:'라운딩 완료',exact:true}).click();await row.getByText('✓ 라운딩 완료',{exact:true}).waitFor();
  const retried=await call('work/visits/2026-09','POST',{recipientId:ids[index],assigneeId:'staff-park-jungyu',serviceConfirmed:true});assert.equal(retried.id,task.id);assert.equal(retried.status,'done');
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: navigation, two social workers, monthly creation, task completion/reopen sync, idempotent retry`);await page.close();
 }
}finally{await browser?.close();await server?.close();if(api.exitCode===null){api.kill();await once(api,'exit');}await new Promise(resolve=>auth.close(resolve));await rm(dir,{recursive:true,force:true});}
