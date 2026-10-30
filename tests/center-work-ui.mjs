import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();let browser;
try {
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-10-30T03:00:00Z')});
    await page.route('**/src/auth.ts',r=>r.fulfill({contentType:'application/javascript',body:'export const getAuthHeaders=async()=>({});export const authFailureEvent="test";'}));
    const t={id:'m',title:'Contract',kind:'event',category:'staff',steps:[{id:'s',title:'Calculate hours',guide:''}]};
    const salary={...t,id:'salary',title:'Payroll',kind:'monthly'};
    let starts=0,reads=0;
    let savedDesign=null;
    let run={...t,id:'run',templateId:'m',version:1,date:'2026-10-30',assigneeId:'a',related:[]};
    await page.route('**/api/work/**',route=>{
      const u=new URL(route.request().url());
      if(u.pathname.endsWith('/task-maps/start')) { const input=route.request().postDataJSON();starts++;if(input.templateId==='salary')return route.fulfill({json:{...salary,id:'salary-run',templateId:'salary',date:input.date,assigneeId:'a',related:[],version:1}});assert.equal(input.related.length,2);return route.fulfill({json:run}); }
      if(u.pathname.endsWith('/task-maps') && route.request().method()==='GET') reads++;
      if(u.pathname.endsWith('/task-maps') && route.request().method()==='POST') {savedDesign=route.request().postDataJSON();return route.fulfill({json:{...savedDesign,id:'new',version:1}});}
      if(u.pathname.endsWith('/runs/run/check')) { assert.equal(route.request().postDataJSON().version,run.version);run={...run,version:2,steps:run.steps.map(s=>({...s,completedAt:'2026-10-30T03:00:00Z'}))};return route.fulfill({json:run}); }
      const data=u.pathname.endsWith('/context')?{me:{id:'a',name:'A'},assignees:[{id:'a',name:'A'}],members:[],references:[{id:'r',type:'recipient',name:'Sample recipient',info:''},{id:'w',type:'worker',name:'Sample worker',info:''}],categories:['staff']}:
      u.pathname.endsWith('/task-maps')?{templates:[t,salary],runs:[run],today:'2026-10-30',nodes:[{template:t,state:'idle',runs:[run],cells:[],completed:0,due:0,expected:0},{template:salary,state:'idle',runs:[],cells:[],completed:0,due:0,expected:0}]}:
      u.pathname.endsWith('/day')?{date:u.searchParams.get('date'),assignee:u.searchParams.get('assignee'),plans:[],executions:[]}:
      u.pathname.endsWith('/tasks')?[{id:'task',title:'Simple task',description:'',category:'staff',related:[],status:'open',assigneeId:'a',dueDate:null,version:1,canEdit:true}]:[];
      return route.fulfill({json:data});
    });
    await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/work-detail-ui.html');
    await page.locator('.traffic-root').waitFor();
    const fold=page.locator('.traffic-fold-toggle').first();await fold.click();assert.equal(await fold.getAttribute('aria-expanded'),'false');await fold.click();
    const initialReads=reads;
    await page.locator('.traffic-node').filter({hasText:'Payroll'}).getByRole('button',{name:'이번 달 업무 시작',exact:true}).click();
    await page.getByLabel('시작일',{exact:true}).fill('2026-10-01');
    await page.locator('.traffic-action-start .primary-button').evaluate(button=>{button.click();button.click();});
    await page.locator('.traffic-action-execution').waitFor();
    assert.equal(starts,1);assert.equal(reads,initialReads,'creation must use response instead of refetching the board');
    await page.locator('.traffic-node').filter({hasText:'Payroll'}).getByRole('button',{name:'업무 열기',exact:true}).click();
    assert.equal(starts,1,'opening an existing monthly run must not POST again');
    await page.locator('.traffic-node').filter({hasText:'Contract'}).getByRole('button',{name:'업무 선택',exact:true}).click();
    await page.getByLabel('관계자 검색').fill('Sample');
    for(const checkbox of await page.locator('.traffic-reference-list input').all()) await checkbox.check();
    assert.equal(await page.locator('.traffic-reference-list input:checked').count(),2);
    await page.locator('.traffic-action-start .primary-button').click();
    await page.locator('.traffic-action-execution').waitFor();
    await page.locator('.work-primary-tabs button').nth(1).click();await page.locator('.bau-designer').waitFor();
    assert.equal(await page.locator('.traffic-action-start').count(),0,'design view does not create occurrences');
    await page.locator('.bau-designer > fieldset > label input[maxlength="200"]').fill('New payroll');
    await page.locator('.bau-design-step input[maxlength="200"]').fill('New step');
    await page.locator('.bau-step-settings select').selectOption('a');
    await page.locator('.bau-step-settings input[type="number"]').fill('2');
    await page.locator('.bau-design-actions button[type="submit"]').click();
    await page.locator('.bau-designer').waitFor({state:'hidden'});
    assert.equal(savedDesign.steps[0].assigneeId,'a');assert.equal(savedDesign.steps[0].dueOffsetDays,2);
    await page.locator('.work-primary-tabs button').nth(2).click();await page.locator('.work-capture').waitFor();
    const contractBundle=page.locator('.work-bau-bundle').filter({hasText:'Contract'});
    await contractBundle.locator('summary').click();
    assert.equal(reads,initialReads,'map, design and todo share the same month query');
    await contractBundle.locator('input').click();
    await page.waitForFunction(()=>document.querySelector('.work-bau-bundle[open] input')?.checked);
    assert.equal(run.version,2);
    const group=page.locator('.work-task-group').filter({hasText:'Simple task'});await group.locator('summary').click();
    // A collapsed group stays accessible without removing its task.
    if(!await group.getAttribute('open'))await group.locator('summary').click();
    await page.getByRole('button',{name:'Simple task'}).click();await page.locator('.work-task-detail').waitFor();
    assert.equal(await page.locator('.work-secondary-tabs button').count(),4);
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    const beforeFocus=reads;
    run={...run,title:'Remote contract'};
    await page.clock.fastForward(61000);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.work-bau-bundle summary').filter({hasText:'Remote contract'}).waitFor();
    assert.equal(reads,beforeFocus+1,'focus refreshes one stale month request without blanking the list');
    assert.deepEqual(errors,[]);
    if(process.env.WORK_UI_SCREENSHOTS) await page.screenshot({path:`tmp/center-work-${viewport.width}.png`,fullPage:true});
    await page.close();
  }
  console.log('PASS: desktop/mobile navigation, structure folding, design, todo detail, no page overflow');
} finally {await browser?.close();await server.close();}
