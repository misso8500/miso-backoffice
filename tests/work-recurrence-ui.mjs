import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { recurrenceDates } from '../shared/work-recurrence.mjs';
const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.WORK_UI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) for (const canManage of [true, false]) {
    const page = await browser.newPage({ viewport }), errors = [], rules = [], categories = [{ id: 'unclassified', name: '미분류 · 나중에 정리', active: 1, version: 1 }];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.route('**/src/auth.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export const getAuthHeaders=async()=>({});export const authFailureEvent="test";' }));
    await page.route('**/api/work/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.pathname.endsWith('/task-maps')) return route.fulfill({ json: { templates: [], runs: [], nodes: [], today: '2026-10-30' } });
      if (url.pathname.endsWith('/context')) return route.fulfill({ json: { me: { id: 'a', name: '기록자' }, assignees: [{ id: 'staff', name: '직원 A' }], members: [], references: [], categories: categories.filter(row => row.active).map(row => row.id), categoryLabels: Object.fromEntries(categories.map(row => [row.id, row.name])), canManageCategories: canManage } });
      if (url.pathname.endsWith('/tasks')) return route.fulfill({ json: [] });
      if (url.pathname.endsWith('/day')) return route.fulfill({ json: { date: url.searchParams.get('date'), assignee: 'all', plans: [], executions: [] } });
      if (url.pathname.endsWith('/categories') && method === 'GET') return route.fulfill({ json: { categories, canManage } });
      if (url.pathname.endsWith('/recurrences') && method === 'GET') return route.fulfill({ json: { rules, month: '2026-10' } });
      if (url.pathname.includes('/recurrences') && ['POST','PUT'].includes(method)) {
        const body = route.request().postDataJSON(), id = method === 'POST' ? `rule-${rules.length}` : url.pathname.split('/').at(-1), index = rules.findIndex(row => row.id === id);
        const row = { ...body, id, version: (rules[index]?.version ?? 0) + 1 };
        if (index >= 0) rules[index] = row; else rules.push(row);
        return route.fulfill({ json: { rule: row, created: method === 'POST' ? recurrenceDates(row, '2026-10').length : 0 } });
      }
      if (url.pathname.endsWith('/categories') && method === 'POST') { assert(canManage); const row = { id: 'custom', name: route.request().postDataJSON().name, active: 1, version: 1 }; categories.push(row); return route.fulfill({ json: row }); }
      throw Error(`Unexpected ${method} ${url.pathname}`);
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-detail-ui.html`);
    await page.locator('.work-primary-tabs button').nth(1).click();
    await page.getByRole('button', { name: '기존 반복 규칙', exact: true }).click();
    await page.getByLabel('업무 제목', { exact: true }).fill('월간 정산');
    await page.getByLabel('업무 담당자', { exact: true }).selectOption('staff');
    await page.getByRole('spinbutton').fill('31');
    await page.getByRole('button', { name: '규칙 저장 및 이번 달 생성', exact: true }).click();
    await page.getByText('규칙을 저장했습니다. 2026-10 업무 1개를 생성했습니다. 이미 생성된 업무는 유지됩니다.').waitFor();
    assert.equal(rules.length, 1); assert.equal(rules[0].dueDay, 31);
    await page.getByRole('button', { name: '중지', exact: true }).click();
    await page.getByRole('button', { name: '재개', exact: true }).waitFor(); assert.equal(rules[0].active, false);
    await page.getByLabel('생성 주기', { exact: true }).selectOption('daily');
    await page.getByLabel('업무 제목', { exact: true }).fill('RFID <YYMMDD> 체크');
    await page.getByLabel('업무 담당자', { exact: true }).selectOption('staff');
    await page.getByRole('checkbox', { name: '토요일 생성', exact: true }).check();
    await page.getByRole('checkbox', { name: '일요일 생성', exact: true }).check();
    await page.getByText('이번 달 생성 대상 31개', { exact: true }).waitFor();
    assert(await page.getByRole('checkbox', { name: /연차.*제외/ }).isDisabled());
    await page.getByRole('button', { name: '규칙 저장 및 이번 달 생성', exact: true }).click();
    await page.getByText('규칙을 저장했습니다. 2026-10 업무 31개를 생성했습니다. 이미 생성된 업무는 유지됩니다.').waitFor();
    assert.equal(rules.length, 2); assert.equal(rules[1].includeLeave, true);
    await page.getByRole('button', { name: '카테고리 관리', exact: true }).click();
    if (canManage) {
      await page.getByLabel('카테고리 이름', { exact: true }).fill('새 분류');
      await page.getByRole('button', { name: '카테고리 추가', exact: true }).click();
      await page.getByText('카테고리를 저장했습니다.').waitFor(); assert.equal(categories.length, 2);
    } else assert.equal(await page.getByRole('button', { name: '카테고리 추가', exact: true }).count(), 0);
    await page.locator('.work-primary-tabs button').nth(2).click();
    await page.getByRole('heading', { name: /하루 할 일/ }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px admin=${canManage}: monthly/daily preview, save, pause, category permissions, return to day`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
