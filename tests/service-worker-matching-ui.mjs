import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'vite';
import {recurrenceToday} from '../shared/work-recurrence.mjs';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-recipient-directory-')),dbPath=join(dir,'directory.sqlite');
const auth=httpServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'google-a',email:'a@example.com',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:'사회복지사 테스트'}}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
const reservation=httpServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:dbPath,SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com'},stdio:['ignore','pipe','pipe']});
let server,browser;
async function call(path,method='GET',body){const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:'Bearer a','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;}
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',chunk=>{if(chunk.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});api.once('error',reject);});
 const ids=[randomUUID(),randomUUID()];await call('recipients/bulk-drafts','POST',{rows:ids.map((id,index)=>({id,name:`서비스매칭 ${index?'B':'A'}`}))});
 const workerId=randomUUID();await call('employment-contracts','POST',{id:workerId,workerName:'기존 요양보호사',workerBirthDate:'1970-01-01',isDraft:true,jobTitle:'요양보호사'});
 const month=recurrenceToday().slice(0,7),alternate=month.slice(0,5)+(month.endsWith('12')?'11':'12');
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [index,viewport]of[{width:1400,height:900},{width:390,height:844}].entries()){
  const page=await browser.newPage({viewport}),errors=[];let confirms=true,writes=0;page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void(confirms?dialog.accept():dialog.dismiss()));page.on('request',request=>{if(request.method()==='PUT'&&request.url().includes('/api/work/service-month?'))writes++;});
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/center-practice-ui.html');await page.getByRole('button',{name:'방문요양 서비스 관리',exact:true}).click();
  const row=page.locator('.service-month-table tbody tr').filter({hasText:'서비스매칭 A'});await row.waitFor();
  await row.getByRole('checkbox').check();await row.getByRole('button',{name:'기존 근로자 연결',exact:true}).click();assert(await page.getByRole('button',{name:'선택·매칭 적용',exact:true}).isDisabled());
  await row.getByRole('combobox',{name:'서비스매칭 A 요양보호사 1',exact:true}).selectOption(workerId);await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).selectOption('가족');assert.equal(writes,0);
  await row.getByRole('button',{name:'신규 근로자 등록',exact:true}).click();const dialog=page.getByRole('dialog',{name:'신규 요양보호사 등록',exact:true});await dialog.waitFor();
  const newName=`새 요양보호사 ${index}`;await dialog.getByLabel('근로자 이름',{exact:true}).fill(newName);await dialog.getByLabel('생년월일',{exact:true}).fill('1980-02-02');await dialog.getByLabel('연락처',{exact:true}).fill('01012345678');assert.equal(await dialog.getByLabel('연락처',{exact:true}).inputValue(),'010-1234-5678');
  await page.screenshot({path:`/private/tmp/miso-service-new-worker-${viewport.width}.png`,animations:'disabled'});
  await dialog.getByRole('button',{name:'근로자 등록하고 매칭에 추가',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const created=(await call('employment-contracts')).find(worker=>worker.workerName===newName);assert(created);assert.equal(created.workerBirthDate,'1980-02-02');assert.equal(created.isDraft,true);assert.equal(writes,0);assert.equal(await row.getByRole('combobox',{name:'서비스매칭 A 요양보호사 2',exact:true}).inputValue(),created.id);
  await page.getByRole('button',{name:'선택·매칭 적용',exact:true}).click();await page.getByRole('status').filter({hasText:'선택과 요양보호사 매칭을 적용'}).waitFor();assert.equal(writes,1);
  let saved=await call('work/service-month?month='+month);let matched=saved.rows.find(person=>person.id===ids[0]);assert.equal(matched.checked,true);assert.deepEqual(matched.workers.map(item=>[item.workerId,item.serviceType]),[[workerId,'가족'],[created.id,'방문']]);assert.deepEqual(saved.rows.find(person=>person.id===ids[1]).workers,[]);
  await page.screenshot({path:`/private/tmp/miso-service-worker-matching-${viewport.width}.png`,fullPage:true,animations:'disabled'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'table overflow must stay inside its scroller');
  await page.getByRole('button',{name:Number(alternate.slice(5))+'월',exact:true}).click();await row.getByRole('checkbox').waitFor();await row.getByRole('button',{name:'기존 근로자 연결',exact:true}).waitFor({state:'hidden'});
  assert.equal(await row.getByRole('checkbox').isChecked(),false);assert.equal(await row.getByRole('combobox').count(),0);
  await page.getByRole('button',{name:Number(month.slice(5))+'월',exact:true}).click();await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).waitFor();assert.equal(await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).inputValue(),'가족');
  await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).selectOption('방문');confirms=false;await page.getByRole('button',{name:Number(alternate.slice(5))+'월',exact:true}).click();assert.equal(await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).inputValue(),'방문');confirms=true;
  await call('work/service-month?month='+month,'PUT',{version:saved.version,recipientIds:[ids[0]]});await page.getByRole('button',{name:'선택·매칭 적용',exact:true}).click();await page.getByRole('alert').filter({hasText:'다른 사용자'}).waitFor();assert.equal(await row.getByRole('combobox',{name:'서비스매칭 A 서비스 구분 1',exact:true}).inputValue(),'방문');assert.equal((await call('work/service-month?month='+month)).rows.find(person=>person.id===ids[0]).workers[0].serviceType,'가족');
  await page.getByRole('button',{name:'새로고침',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="서비스매칭 A 서비스 구분 1"]')?.value==='가족');
  await row.getByRole('button',{name:'서비스매칭 A 요양보호사 1 연결 해제',exact:true}).click();await row.getByRole('button',{name:'서비스매칭 A 요양보호사 1 연결 해제',exact:true}).click();await page.getByRole('button',{name:'선택·매칭 적용',exact:true}).click();await page.getByRole('status').filter({hasText:'선택과 요양보호사 매칭을 적용'}).waitFor();assert.deepEqual((await call('work/service-month?month='+month)).rows.find(person=>person.id===ids[0]).workers,[]);
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: existing and new worker mapping, family/visit care, single monthly apply, persistence and month isolation, unsaved guards, conflict preservation, unlink, no page overflow`);await page.close();
 }
}finally{await browser?.close();await server?.close();if(api.exitCode===null){api.kill();await once(api,'exit');}await new Promise(resolve=>auth.close(resolve));await rm(dir,{recursive:true,force:true});}
