import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.WORK_UI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.clock.install({ time: new Date('2026-10-27T03:00:00Z') });
    const task = { id: 't', title: '어제 계획한 업무', description: '', category: 'operations', dueDate: '', assigneeId: 'a', requesterId: 'a', status: 'open', version: 1, canEdit: true, related: [], completedAt: null, createdAt: '2026-10-26T01:00:00Z', updatedAt: '2026-10-26T01:00:00Z', updatedBy: 'a' };
    const plan = { id: 'p', taskId: 't', date: '2026-10-26', assigneeId: 'a', period: 'morning', status: 'planned', version: 1, snapshot: { title: task.title, category: 'operations', related: [] } };
    let execution = null;
    await page.route('**/src/auth.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export const getAuthHeaders=async()=>({});export const authFailureEvent="test";' }));
    await page.route('**/api/work/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/context')) return route.fulfill({ json: { me: { id: 'a', name: '기록자' }, assignees: [{ id: 'a', name: '직원 A' }, { id: 'b', name: '직원 B' }], members: [], references: [] } });
      if (url.pathname.endsWith('/tasks')) return route.fulfill({ json: [task] });
      if (url.pathname.endsWith('/day')) { const date = url.searchParams.get('date'); return route.fulfill({ json: { date, assignee: 'all', plans: date === plan.date ? [plan] : [], executions: execution?.date === date ? [execution] : [], linkedExecutions: execution?.status === 'recorded' ? [execution] : [] } }); }
      if (url.pathname.endsWith('/plans/p/execute')) {
        const body = route.request().postDataJSON();
        assert.equal(body.executionVersion, execution?.status === 'recorded' ? execution.version : 0);
        execution = { ...plan, id: body.requestId, planId: plan.id, date: body.date, period: body.period, content: task.title, status: 'recorded', version: 1 };
        return route.fulfill({ json: execution });
      }
      if (url.pathname.includes('/executions/')) {
        const body = route.request().postDataJSON(); assert.equal(body.version, execution.version);
        execution = { ...execution, ...body, version: execution.version + 1, ...(url.pathname.endsWith('/cancel') ? { status: 'voided' } : {}) };
        return route.fulfill({ json: execution });
      }
      throw Error(`Unexpected ${url.pathname}`);
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-detail-ui.html`);
    await page.getByLabel('기준 날짜', { exact: true }).fill(plan.date);
    await page.getByRole('button', { name: '오늘 수행', exact: true }).click();
    await page.getByRole('button', { name: '오후 수행 저장', exact: true }).click();
    await page.getByRole('button', { name: '수행 기록 되돌리기', exact: true }).waitFor();
    assert.equal(execution.date, '2026-10-27'); assert.equal(execution.planId, 'p'); assert.equal(plan.date, '2026-10-26');
    await page.getByRole('button', { name: '수행 기록 되돌리기', exact: true }).click();
    await page.getByRole('button', { name: '10/26에 수행', exact: true }).click();
    await page.getByRole('button', { name: '오전 수행 저장', exact: true }).click();
    await page.getByRole('button', { name: '수행일·처리자 수정', exact: true }).waitFor();
    assert.equal(execution.date, plan.date);
    await page.getByRole('button', { name: '수행 기록 되돌리기', exact: true }).click();
    await page.getByRole('button', { name: '다른 날짜', exact: true }).click();
    await page.getByLabel('실제 수행일', { exact: true }).fill('2026-10-25');
    await page.getByRole('button', { name: '오후 수행 저장', exact: true }).click();
    await page.getByRole('button', { name: '수행일·처리자 수정', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('날짜', { exact: true }).fill('2026-10-24');
    await dialog.getByLabel('실제 수행자', { exact: true }).selectOption('b');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('button', { name: '수행 기록 되돌리기', exact: true }).waitFor();
    assert.equal(execution.date, '2026-10-24'); assert.equal(execution.assigneeId, 'b');
    await page.getByRole('button', { name: '수행 기록 되돌리기', exact: true }).click();
    await page.getByText('수행 기록 변경을 되돌렸습니다. 계획은 유지됩니다.').waitFor();
    assert.equal(execution.date, '2026-10-25'); assert.equal(execution.assigneeId, 'a');
    console.log(`PASS ${viewport.width}px: today, plan date, custom date, performer/date correction and undo`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
