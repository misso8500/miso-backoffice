import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import ExcelJS from 'exceljs';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-copay-ui-'));
const auth=httpServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'google-a',email:'a@example.com',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:'테스트 직원'}}));});
await new Promise(r=>auth.listen(0,'127.0.0.1',r));
const reservation=httpServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:join(dir,'test.sqlite'),SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com'},stdio:['ignore','pipe','pipe']});
let server,browser;
async function call(path,method='GET',body){const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:'Bearer a','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',b=>{if(b.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});});
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/src/auth.ts',r=>r.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/copay-ui.html`);
  await page.getByRole('button',{name:'본인부담금 관리',exact:true}).click();
  const f=page.frameLocator('iframe[title="본인부담금 관리"]');
  await f.getByRole('heading',{name:'본인부담금 관리',exact:true}).waitFor();
  await f.locator('#copay-status').waitFor({state:'attached'});
  const month=viewport.width===1440?'2026-09':'2026-08';
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('종합현황');s.addRow([`${month.slice(0,4)}년 ${month.slice(5)}월 급여사용액 및 본인부담금 종합 현황`]);s.addRow(['','수급자','등급','본인부담율','월한도액','사용액','본인부담금','초과/비급여','합계','금월납부총액','납부일자']);s.addRow([1,'검증 수급자','4','15.0%',1409700,506400,75960,'',75960]);
  const buffer=Buffer.from(await w.xlsx.writeBuffer());
  await f.locator('.heading .primary').click();await f.getByLabel('종합현황 엑셀 파일',{exact:true}).setInputFiles({name:'copay.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await f.locator('#import-ack').waitFor();
  await f.getByLabel('연월, 금액, 연결과 확인 사항을 검토했습니다.').check();await f.locator('#import-apply').click();
  await f.locator('#import-dialog').waitFor({state:'hidden'});
  await f.locator('[data-tab="ledger"]').click();
  assert.equal(await f.locator('.ledger-date').getAttribute('type'),'date');
  await f.getByLabel('검증 수급자 수납일',{exact:true}).fill('2026-10-23');await f.getByLabel('검증 수급자 수납액',{exact:true}).fill('75960');await f.getByLabel('검증 수급자 납부자',{exact:true}).fill('보호자');
  // Sidebar navigation retains unsaved inputs without issuing a new monthly read.
  await page.getByRole('button',{name:'수급자 기초정보',exact:true}).click();await page.getByRole('button',{name:'본인부담금 관리',exact:true}).click();assert.equal(await f.getByLabel('검증 수급자 납부자',{exact:true}).inputValue(),'보호자');
  await f.locator('#ledger-save').click();await f.locator('#ledger-count').filter({hasText:'저장할 변경이 없습니다.'}).waitFor();
  assert.equal((await call(`work/copay?month=${month}`)).rows[0].payment.amount,75960);
  await f.locator('[data-tab="receipt"]').click();await f.getByRole('button',{name:'영수증 확인',exact:true}).click();await f.getByRole('button',{name:'확인 완료',exact:true}).waitFor();
  assert.equal(await f.locator('.receipt-provider .company-seal').first().evaluate(e=>e.complete&&e.naturalWidth>0),true);
  await page.reload();await page.getByRole('button',{name:'본인부담금 관리',exact:true}).click();
  await f.locator('#year').selectOption('2026');await f.locator(`#months button`).filter({hasText:new RegExp(`^${Number(month.slice(5))}월$`)}).click();
  await f.locator('[data-tab="ledger"]').click();await f.getByLabel('검증 수급자 납부자',{exact:true}).waitFor();assert.equal(await f.getByLabel('검증 수급자 납부자',{exact:true}).inputValue(),'보호자');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: actual sidebar, XLSX preview/import, date input, navigation drafts, atomic save, persisted reviews/seals and reload on desktop/mobile');
}finally{await browser?.close();await server?.close();const exit=once(api,'exit').catch(()=>{});api.kill();await exit;await new Promise(r=>auth.close(r));await rm(dir,{recursive:true,force:true});}
