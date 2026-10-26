import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.WORK_UI_CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport }), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `task-${i}`, title: `업무 ${i}`, description: '', category: 'operations', dueDate: '2026-10-28', assigneeId: 'a', requesterId: 'a', status: 'open', version: 1, canEdit: true, related: [], completedAt: null, createdAt: '2026-10-26T01:00:00Z', updatedAt: '2026-10-26T01:00:00Z', updatedBy: 'a' }));
    await page.route('**/src/auth.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export const getAuthHeaders=async()=>({});export const authFailureEvent="test";' }));
    await page.route('**/api/work/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/context')) return route.fulfill({ json: { me: { id: 'a', name: '직원 A' }, assignees: [{ id: 'a', name: '직원 A' }], members: [], references: [] } });
      if (url.pathname.endsWith('/tasks')) return route.fulfill({ json: tasks });
      if (url.pathname.endsWith('/day')) return route.fulfill({ json: { date: url.searchParams.get('date'), assignee: url.searchParams.get('assignee'), plans: [], executions: [] } });
      if (url.pathname.endsWith('/calendar')) return route.fulfill({ json: { from: url.searchParams.get('from'), to: url.searchParams.get('to'), assignee: url.searchParams.get('assignee'), plans: tasks.map(t => ({ id: `plan-${t.id}`, taskId: t.id, assigneeId: 'a', date: '2026-10-26', status: 'planned', period: 'morning', snapshot: { title: t.title, category: t.category, related: [] } })), executions: [{ id: 'e', taskId: tasks[0].id, assigneeId: 'a', date: '2026-10-27', status: 'recorded', period: 'afternoon', content: tasks[0].title }], deadlines: tasks.filter(t => t.status === 'open'), unplanned: [] } });
      const task = tasks.find(t => url.pathname.includes(`/tasks/${t.id}`));
      if (task && route.request().method() === 'PUT') { const body = route.request().postDataJSON(); assert.equal(body.version, task.version); Object.assign(task, body, { version: body.version + 1 }); return route.fulfill({ json: task }); }
      if (task && url.pathname.endsWith('/complete')) { task.status = 'done'; task.version++; return route.fulfill({ json: task }); }
      if (task && url.pathname.endsWith('/reopen')) { task.status = 'open'; task.version++; return route.fulfill({ json: task }); }
      throw Error(`Unexpected ${url.pathname}`);
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-detail-ui.html`);
    await page.getByLabel('기준 날짜', { exact: true }).fill('2026-10-26');
    await page.getByRole('button', { name: '주간', exact: true }).click();
    await page.getByRole('button', { name: '2026-10-26 업무 0 상세 열기', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '주간', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByRole('button', { name: '업무 제목 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '업무 제목 수정' }).fill('수정한 주간 업무');
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    await page.getByText('수정한 내용을 모두 저장했습니다.').waitFor();
    await page.getByRole('button', { name: '업무 상세 닫기', exact: true }).click();
    await page.getByRole('button', { name: '2026-10-27 수정한 주간 업무 상세 열기', exact: true }).waitFor();
    await page.getByRole('button', { name: '2026-10-28 수정한 주간 업무 상세 열기', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: '수정한 주간 업무 완료하기', exact: true }).first().check();
    await page.getByRole('button', { name: '완료 되돌리기', exact: true }).click();
    await page.getByRole('button', { name: '월간', exact: true }).click();
    await page.getByRole('button', { name: '5개 더 보기', exact: true }).first().click();
    const agenda = page.getByRole('region', { name: '2026-10-26 업무 모아보기', exact: true });
    assert.equal(await agenda.locator('.work-calendar-item').count(), 8);
    await agenda.getByRole('button', { name: '2026-10-26 업무 7 상세 열기', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '월간', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('complementary', { name: '선택한 업무 상세' }).count(), 1);
    assert.deepEqual(errors, []);
    await page.locator('.work-detail-slot').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
    const bounds = await page.getByRole('complementary', { name: '선택한 업무 상세' }).boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y >= 0);
    if (process.env.WORK_UI_SCREENSHOTS) await page.screenshot({ path: `tmp/work-calendar-${viewport.width}.png` });
    console.log(`PASS ${viewport.width}px: week/month stay in view, edit, complete/undo, separate dates, overflow, single sidebar`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
