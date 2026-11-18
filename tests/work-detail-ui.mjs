// Run with playwright-core installed or use WORK_UI_PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.WORK_UI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href : 'playwright-core');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.WORK_UI_CHROME_PATH, headless: true });
  for (const viewport of [{ width: 1200, height: 750 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.clock.setFixedTime(new Date('2026-11-18T03:00:00Z'));
    const memos = [{ id: 'old', title: '지난달 메모', authorName: '직원 A', createdAt: '2026-10-03T03:00:00Z' }];
    let attempt;
    const requests = [];
    await page.route('**/src/auth.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const getAuthHeaders=async()=>({}); export const authFailureEvent="test";' }));
    await page.route('**/api/work/**', async route => {
      const { pathname, searchParams } = new URL(route.request().url());
      requests.push(pathname);
      if (pathname.endsWith('/complete')) {
        assert.equal(route.request().postDataJSON().assigneeId, 'staff-park-jungyu');
        const memo = memos.at(-1);
        Object.assign(memo, { closedAt: '2026-11-18T03:00:00Z', closedByName: '박준규', stampAssigneeId: 'staff-park-jungyu' });
        return route.fulfill({ json: { memo } });
      }
      assert(pathname.endsWith('/quick-memos'));
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        assert.equal(body.relatedName, '김테스트');
        if (!attempt) {
          attempt = body.requestId;
          return route.fulfill({ status: 503, json: { error: '메모 저장 실패' } });
        }
        assert.equal(body.requestId, attempt);
        const memo = { id: body.requestId, title: body.title, relatedName: body.relatedName, authorName: '직원 A', createdAt: '2026-11-18T03:00:00Z', closedAt: null };
        memos.push(memo);
        return route.fulfill({ json: memo });
      }
      assert(searchParams.has('month'));
      const items = memos.filter(memo => memo.createdAt.startsWith(searchParams.get('month')) && Boolean(memo.closedAt) === searchParams.has('closed'));
      return route.fulfill({ json: { items, next: null } });
    });

    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-detail-ui.html`);
    const board = page.getByRole('region', { name: '이 달의 할 일 코르크 보드' });
    const previousMonth = await board.getByRole('button', { name: '이전 달' }).boundingBox();
    const nextMonth = await board.getByRole('button', { name: '다음 달' }).boundingBox();
    assert(Math.abs(previousMonth.y - nextMonth.y) < 2, 'month arrows stay in the same row');
    const input = board.getByRole('textbox', { name: '공동 메모 한 줄' });
    const related = board.getByRole('textbox', { name: '관련자' });
    assert.equal(await board.locator('.is-composer textarea').count(), 1);
    await input.fill('보호자에게 다시 연락');
    await related.fill('김테스트');
    await input.press('Enter');
    await board.getByText('메모 저장 실패', { exact: false }).waitFor();
    assert.equal(await input.inputValue(), '보호자에게 다시 연락');
    assert.equal(await related.inputValue(), '김테스트');
    await input.press('Enter');
    const complete = board.getByRole('button', { name: '완료', exact: true });
    await complete.waitFor();
    await board.getByText('관련자 · 김테스트', { exact: true }).waitFor();
    assert.equal(await board.locator('.work-stamp-choices button').count(), 0);
    for (const card of await board.locator('.work-note').all()) {
      const note = await card.boundingBox();
      assert(Math.abs(note.width - note.height) < 2, 'composer and posted notes are square');
    }
    await page.screenshot({ path: `/private/tmp/miso-board-${viewport.width}.png` });
    await complete.click();
    assert.deepEqual(await board.locator('.work-stamp-choices button').allTextContents(), ['센터장', '박준규', '황영상']);
    await page.keyboard.press('Escape');
    assert.equal(await board.locator('.work-stamp-choices button').count(), 0);
    await complete.click();
    await board.getByRole('button', { name: '박준규 도장 찍기' }).click();
    await board.getByLabel('박준규 완료 도장').waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(await related.inputValue(), '');
    await board.getByRole('button', { name: '이전 달' }).click();
    await board.getByText('지난달 메모', { exact: true }).waitFor();
    assert.equal(await board.getByText('보호자에게 다시 연락', { exact: true }).count(), 0);
    await board.getByRole('button', { name: '이번 달', exact: true }).click();
    await board.getByText('완료 포스트잇', { exact: true }).click();
    await board.getByLabel('박준규 완료 도장').waitFor();
    assert(requests.every(path => path.includes('/quick-memos')), 'board should not load legacy work queries');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    console.log(`PASS ${viewport.width}px: square notes, monthly scope, stamp reveal, saved note and retry`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
