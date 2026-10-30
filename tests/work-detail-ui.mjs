// Run with playwright-core available, or WORK_UI_PLAYWRIGHT_MODULE pointing to its index.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.WORK_UI_CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  for (const viewport of [{ width: 1200, height: 750 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
    page.on('pageerror', error => errors.push(error.message));
    const tasks = ['sample', 'other'].map(id => ({ id, title: `${id} 업무`, description: '설명', category: 'operations', dueDate: '2026-10-26', assigneeId: 'a', requesterId: 'a', status: 'open', version: 1, canEdit: true, related: [], completedAt: null, createdAt: '2026-10-26T01:00:00Z', updatedAt: '2026-10-26T01:00:00Z', updatedBy: 'a' }));
    const updates = [];
    let rejectNext = false;
    await page.route('**/src/auth.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const getAuthHeaders=async()=>({}); export const authFailureEvent="test";' }));
    await page.route('**/api/work/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/task-maps')) return route.fulfill({ json: { templates: [], runs: [], nodes: [], today: '2026-10-30' } });
      if (url.pathname.endsWith('/context')) return route.fulfill({ json: { me: { id: 'a', name: '직원 A' }, assignees: [{ id: 'a', name: '직원 A' }, { id: 'b', name: '직원 B' }], members: [], references: [] } });
      if (url.pathname.endsWith('/day')) return route.fulfill({ json: { date: url.searchParams.get('date'), assignee: url.searchParams.get('assignee'), plans: [], executions: [] } });
      if (url.pathname.endsWith('/tasks')) return route.fulfill({ json: tasks });
      const index = tasks.findIndex(task => url.pathname.endsWith(`/tasks/${task.id}`));
      if (index !== -1 && route.request().method() === 'PUT') {
        if (rejectNext) { rejectNext = false; return route.fulfill({ status: 409, json: { error: '다른 사용자가 수정했습니다.' } }); }
        const body = route.request().postDataJSON();
        assert.equal(body.version, tasks[index].version);
        tasks[index] = { ...tasks[index], ...body, version: body.version + 1 };
        updates.push(body);
        return route.fulfill({ json: tasks[index] });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-detail-ui.html`);
    await page.locator('.work-primary-tabs button').nth(2).click();
    await page.getByRole('button', { name: 'sample 업무', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: '선택한 업무 상세' }).count(), 1);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: '업무 제목 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '업무 제목 수정' }).fill('수정한 제목');
    await page.getByRole('button', { name: '분류 수정', exact: true }).click();
    await page.getByRole('combobox', { name: '분류 수정' }).selectOption('service');
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    await page.locator('.work-operation-status.is-busy').waitFor({ state: 'visible' });
    await page.getByText('수정한 내용을 모두 저장했습니다.').waitFor();
    await page.locator('.work-operation-status.is-success').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '상세 내용 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '상세 내용 수정' }).fill('저장 후 연속 수정');
    await page.getByRole('button', { name: '담당자 수정', exact: true }).click();
    await page.getByRole('combobox', { name: '담당자 수정' }).selectOption('b');
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    await page.getByText('수정한 내용을 모두 저장했습니다.').waitFor();
    if (viewport.width < 1100) await page.getByRole('button', { name: '업무 상세 닫기', exact: true }).click();
    await page.getByRole('button', { name: 'other 업무', exact: true }).click();
    await page.getByRole('button', { name: '마감일 수정', exact: true }).click();
    await page.getByRole('button', { name: '전체 취소', exact: true }).click();
    await page.getByRole('button', { name: '업무 제목 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '업무 제목 수정' }).fill('저장 실패 시 유지');
    rejectNext = true;
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    await page.locator('.work-operation-status.is-error').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('textbox', { name: '업무 제목 수정' }).inputValue(), '저장 실패 시 유지');
    await page.getByRole('button', { name: '전체 취소', exact: true }).click();
    assert.equal(updates.length, 2);
    assert.equal(tasks[0].title, '수정한 제목');
    assert.equal(tasks[0].category, 'service');
    assert.equal(tasks[0].description, '저장 후 연속 수정');
    assert.equal(tasks[0].assigneeId, 'b');
    assert.deepEqual(errors.filter(message => !message.includes('409')), []);
    console.log(`PASS ${viewport.width}px: single detail sidebar, consecutive edits, busy/success/error indicators`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
