import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();let browser;
try{browser=await chromium.launch({executablePath:process.env.WORK_UI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const viewport of [{width:1400,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});await page.clock.install({time:new Date('2026-10-30T03:00:00Z')});const errors=[];page.on('pageerror',e=>errors.push(e.message));const months=new Map();let completed=0;
  const empty={status:'unplanned',date:'',assigneeId:'',version:0,taskId:null,taskVersion:null};
  const assignees=[{id:'staff-park-jungyu',name:'사회복지사 A'}];
  await page.route('**/src/auth.ts',r=>r.fulfill({contentType:'application/javascript',body:'export const getAuthHeaders=async()=>({});export const authFailureEvent="test";'}));
  await page.route('**/api/work/service-month?*',async route=>{
    assert.equal(route.request().method(),'GET');
    const month=new URL(route.request().url()).searchParams.get('month');
    const data=months.get(month)||{month,assignees,version:0,updatedAt:null,rows:['A','B','C'].map(id=>({
      id,name:id,operationalName:'',serviceStartDate:'',serviceEndDate:'',enabled:true,isDraft:false,
      checked:month==='2026-10'&&id!=='C',workers:id==='B'?[]:[{workerId:'worker',serviceType:'방문'}],rounding:{...empty}
    }))};
    months.set(month,data);return route.fulfill({json:data});
  });
  await page.route('**/api/work/service-rounding?*',async route=>{const month=new URL(route.request().url()).searchParams.get('month'),body=route.request().postDataJSON(),data=months.get(month),row=data.rows.find(r=>r.id===body.recipientId);assert.equal(body.version,row.rounding.version);if(body.status==='visited'){assert.equal(body.confirmComplete,true);assert.equal(body.date,'2026-10-01');assert.equal(body.assigneeId,assignees[0].id);completed++;}row.rounding={...body,version:body.version+1,taskId:body.status==='visited'?'visit-task':null,taskVersion:body.status==='visited'?1:null};return route.fulfill({json:{month,recipientId:body.recipientId,rounding:row.rounding}});});
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/recipient-service-month.html');
  const roster=page.locator('.service-month-table tbody');
  await roster.getByRole('rowheader',{name:'A',exact:true}).waitFor();
  assert.equal(await roster.getByRole('row').count(),1);
  assert.equal(await roster.getByRole('checkbox').count(),0);
  await page.getByRole('button',{name:'A 일정조율',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="A 일정조율"]').getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'A 라운딩 일자 수정'}).click();
  const dateInput=page.getByRole('textbox',{name:'A 라운딩 일자 입력'});assert.equal(await dateInput.getAttribute('maxlength'),'8');await dateInput.fill('20261001');await page.getByRole('button',{name:'A 라운딩 일자 저장'}).click();await dateInput.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'A 담당자 수정'}).click();await page.getByRole('combobox',{name:'A 담당자 선택'}).selectOption(assignees[0].id);await page.getByRole('combobox',{name:'A 담당자 선택'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'A 방문완료',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(completed,0);await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();assert.equal(completed,0);
  await page.getByRole('button',{name:'A 방문완료',exact:true}).click();await page.getByRole('button',{name:'확인 · 할일 완료'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(completed,1);await page.waitForFunction(()=>document.querySelector('[aria-label="A 방문완료"]').getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'11월',exact:true}).click();
  await page.getByText('이 달에 요양보호사가 연결된 수급자가 없습니다.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'10월',exact:true}).click();
  await roster.getByRole('rowheader',{name:'A',exact:true}).waitFor();
  await page.getByRole('button',{name:'2025년',exact:true}).click();
  await page.getByText('이 달에 요양보호사가 연결된 수급자가 없습니다.',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.close();
 }console.log('PASS: matched-only management, rounding edits, year/month navigation, desktop/mobile');
}finally{await browser?.close();await server.close();}
