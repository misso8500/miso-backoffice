import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import {documentDraft} from '../shared/staff-records.mjs';
import {recurrenceToday} from '../shared/work-recurrence.mjs';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const width of [1400,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/auth.ts',route=>route.fulfill({contentType:'application/javascript',body:"export const getAuthHeaders=async()=>({});export const authFailureEvent='test';"}));
 const month=recurrenceToday().slice(0,7),profile={name:'테스트',organization:'기관',jobTitle:'사회복지사'};
 const documents=Object.fromEntries(['attendance','journal'].map(kind=>[kind,{kind,period:month,payload:documentDraft(kind,month,profile),status:'draft',version:0}]));
 let saves=0;
 await page.route('**/api/work/**',async route=>{
 const url=new URL(route.request().url());let value;
 if(url.pathname.includes('/calendar')) value={plans:[],deadlines:[],unplanned:[{id:'task',title:'날짜 없는 할 일'}]};
 else if(url.pathname.includes('/workspace/')){const body=route.request().postDataJSON();for(const kind of ['attendance','journal'])documents[kind]={...documents[kind],payload:body[kind].payload,version:documents[kind].version+1};saves++;value={};}
 else {const kind=url.pathname.includes('/attendance/')?'attendance':'journal';await new Promise(resolve=>setTimeout(resolve,kind==='attendance'?500:900));value={document:documents[kind],executions:[],leaveDates:[],sourceHash:'test',sourceChanged:false};}
 await route.fulfill({json:value});
 });
 await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/staff-calendar-ui.html`);
 await page.locator('.app-data-loading').waitFor({state:'visible'});
 await page.locator('.work-operation-status.is-busy').getByText('처리 중',{exact:true}).waitFor();
 await page.locator('.work-operation-status.is-success').getByText('완료',{exact:true}).waitFor();
 await page.locator('.app-data-loading').waitFor({state:'detached'});
 const first=page.getByRole('button',{name:new RegExp(`${month}-01 .*검토 전`)});
 await first.click();
 await page.getByLabel('근태 비고·연차 사유',{exact:true}).fill('보존할 기록');
 await page.getByRole('button',{name:'근무기록 작성 닫기',exact:true}).click();
 await first.click();
 assert.equal(await page.getByLabel('근태 비고·연차 사유',{exact:true}).inputValue(),'보존할 기록');
 await page.getByRole('button',{name:'검토 완료',exact:true}).click();
 await page.locator('.record-editor-actions').getByRole('button',{name:'함께 저장',exact:true}).click();
 await page.getByText('근무기록을 저장했습니다.',{exact:false}).waitFor();
 assert.equal(saves,1);assert.equal(documents.attendance.payload.rows[0].note,'보존할 기록');assert.equal(documents.journal.payload.rows[0].reviewed,true);
 await page.getByRole('button',{name:/날짜 미지정 할 일/}).click();await page.getByText('날짜 없는 할 일',{exact:true}).waitFor({state:'visible'});
 const toggle=page.getByRole('button',{name:/월 근무기록/});await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,350)));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`horizontal overflow ${width}`);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: loading indicator, accordion, date editor, close/reopen preserves edits, review and save, no overflow`);
 await page.close();
 }
}finally{await browser?.close();await server.close();}
