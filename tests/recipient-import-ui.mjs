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
import {importWorkbook} from './fixtures/recipient-import-workbook.mjs';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const dir=await mkdtemp(join(tmpdir(),'miso-recipient-import-')),dbPath=join(dir,'import.sqlite');
const auth=httpServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'google-a',email:'a@example.com',email_confirmed_at:'2026-01-01',app_metadata:{provider:'google'},identities:[{provider:'google'}],user_metadata:{full_name:'사회복지사 테스트'}}));});
await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
const reservation=httpServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const api=spawn(process.execPath,['server/api.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MISO_BACKOFFICE_DB_PATH:dbPath,SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ALLOWED_EMAILS:'a@example.com'},stdio:['ignore','pipe','pipe']});
let server,browser;
async function call(path,method='GET',body){const response=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Authorization:'Bearer a','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;}
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timeout')),10000);api.stdout.on('data',chunk=>{if(chunk.toString().includes('API running')){clearTimeout(timer);resolve();}});api.once('exit',code=>{clearTimeout(timer);reject(Error(`API exit ${code}`));});api.once('error',reject);});
 server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [index,viewport]of[{width:1400,height:900},{width:390,height:844}].entries()){
  const id=randomUUID(),name='업데이트대상'+index,newName='새수급자'+index,choiceName='계약선택'+index;
  await call('recipients/bulk-drafts','POST',{rows:[{id,name,birthDate:'1940-01-01',longTermCareNumber:`L123456789${index}`,phone:'010-1111-1111',address:'기존 주소',careGrade:'3등급'}]});
  const db=new DatabaseSync(dbPath);db.prepare("UPDATE recipients SET is_draft=0,service_start_date='2026-01-01',service_end_date='2026-12-31',contract_registered_date='2026-01-01',contract_expired_date='2026-12-31',medical_history='건강 기록 유지' WHERE id=?").run(id);db.close();
  const source=await importWorkbook({rows:[[name,'4등급','1940-01-01','','','','2026-01-01','2026-01-01','2027-12-31','2029-12-31'],[choiceName,'3등급','1950-01-01','','','예전 주소','','2026-01-01','2026-12-31'],[choiceName,'3등급','1950-01-01','','','최신 주소','','2026-10-01','2027-09-30'],['날짜오류','9등급','1940-02-31']],second:[[newName,'3등급','1950-02-01','','','새 주소']],brokenDrawing:true});
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({Authorization:'Bearer a'});export const authFailureEvent='test';"}));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/center-practice-ui.html`);await page.locator('.recipient-directory-row').first().waitFor();
  await page.getByRole('button',{name:'엑셀로 등록·업데이트',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'엑셀로 등록·업데이트',exact:true});await dialog.waitFor();
  const upload=()=>dialog.getByLabel('수급자 목록 XLSX',{exact:true}).setInputFiles({name:source.filename,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(source.file,'base64')});
  const previewResponse=page.waitForResponse(r=>r.url().endsWith('/recipient-import/preview'));await upload();assert((await previewResponse).ok());
  await dialog.getByRole('button',{name:'선택한 2행 반영',exact:true}).waitFor();
  const first=dialog.locator('.recipient-import-row').filter({hasText:name});await first.getByText('이름·생년월일 일치',{exact:false}).waitFor();await first.locator('summary').click();await first.getByText('2027-12-31',{exact:true}).first().waitFor();
  const choice=dialog.locator('.recipient-import-row').filter({hasText:'최신 주소'});await choice.getByRole('checkbox').check();assert.equal(await dialog.getByRole('checkbox',{checked:true}).count(),3);
  const other=dialog.locator('.recipient-import-row').filter({hasText:'예전 주소'});await other.getByRole('checkbox').check();assert.equal(await choice.getByRole('checkbox').isChecked(),false);await choice.getByRole('checkbox').check();
  assert.equal(await dialog.locator('.recipient-import-row').filter({hasText:'날짜오류'}).getByRole('checkbox').isDisabled(),true);
  assert(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+2),'import dialog has horizontal overflow');
  await dialog.locator('.recipient-import-body').evaluate(node=>{node.scrollTop=0;});
  await dialog.screenshot({path:`/private/tmp/miso-recipient-import-${viewport.width}.png`,animations:'disabled'});
  const before=await call('recipients/'+id);await call('recipients/'+id+'/contact','PUT',{phone:before.phone,address:'다른 화면의 최신 주소',representativeName:before.representativeName,representativeRelation:before.representativeRelation,representativePhone:before.representativePhone,updatedAt:before.updatedAt});
  await dialog.getByRole('button',{name:'선택한 3행 반영',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').innerText(),/명부가 변경/);assert.equal(await dialog.getByRole('checkbox',{checked:true}).count(),3);
  await dialog.getByRole('button',{name:'미리보기 다시 확인',exact:true}).click();await dialog.getByRole('button',{name:'선택한 2행 반영',exact:true}).waitFor();await dialog.locator('.recipient-import-row').filter({hasText:'최신 주소'}).getByRole('checkbox').check();
  const applyResponse=page.waitForResponse(r=>r.url().endsWith('/recipient-import/apply'));await dialog.getByRole('button',{name:'선택한 3행 반영',exact:true}).click();assert.deepEqual(await (await applyResponse).json(),{created:2,updated:1});await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:newName+' 수급자 상세',exact:true}).waitFor();const saved=await call('recipients/'+id);assert.equal(saved.careGrade,'4등급');assert.equal(saved.address,'다른 화면의 최신 주소');assert.equal(saved.phone,'010-1111-1111');assert.equal(saved.isDraft,false);assert.equal(saved.medicalHistory,'건강 기록 유지');assert.equal(saved.serviceEndDate,'2027-12-31');
  const people=await call('recipients');assert.equal(people.filter(p=>p.name===newName).length,1);assert.equal(people.find(p=>p.name===choiceName).address,'최신 주소');assert.equal(people.find(p=>p.name===newName).isDraft,true);
  // Reopening the same workbook must not create duplicate recipients.
  await page.getByRole('button',{name:'엑셀로 등록·업데이트',exact:true}).click();await upload();await dialog.locator('.recipient-import-row').first().waitFor();assert.equal(await dialog.getByRole('checkbox',{checked:true}).count(),0);await dialog.getByRole('button',{name:'엑셀 가져오기 닫기',exact:true}).click();
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: XLSX preview, value diff, one contract selection, invalid-row blocking, concurrent edit protection, selective apply, preserved data, draft creation and repeat upload`);await page.close();
 }
}finally{await browser?.close();await server?.close();if(api.exitCode===null){api.kill();await once(api,'exit');}await new Promise(resolve=>auth.close(resolve));await rm(dir,{recursive:true,force:true});}
