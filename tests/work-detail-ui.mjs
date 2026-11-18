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
    const memos = [{ id: 'typo', title: '잘못 쓴 메모', authorName: '직원 A', createdAt: '2026-11-04T03:00:00Z', canDelete: true }, { id: 'old', title: '지난달 메모', authorName: '직원 A', createdAt: '2026-10-03T03:00:00Z' }];
    let attempt;
    let initialReads = 0;
    let deleteAttempts = 0;
    let releaseSave;
    let releaseDelete;
    const delayedSave = new Promise(resolve => { releaseSave = resolve; });
    const delayedDelete = new Promise(resolve => { releaseDelete = resolve; });
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
      if (route.request().method() === 'DELETE') {
        assert(pathname.endsWith('/typo'));
        if (++deleteAttempts === 1) {
          await delayedDelete;
          return route.fulfill({ status: 503, json: { error: '메모 삭제 실패' } });
        }
        memos.splice(memos.findIndex(memo => memo.id === 'typo'), 1);
        return route.fulfill({ json: { id: 'typo' } });
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
        await delayedSave;
        const memo = { id: body.requestId, title: body.title, relatedName: body.relatedName, authorName: '직원 A', createdAt: '2026-11-18T03:00:00Z', closedAt: null };
        memos.push(memo);
        return route.fulfill({ json: memo });
      }
      assert(searchParams.has('month'));
      initialReads++;
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
    const typo = board.getByRole('button', { name: '잘못 쓴 메모 삭제' });
    await typo.waitFor();
    page.on('dialog', dialog => void dialog.accept());
    await typo.click();
    await typo.waitFor({ state: 'hidden' });
    releaseDelete();
    await board.getByText('메모 삭제 실패', { exact: false }).waitFor();
    await typo.click();
    await board.getByText('포스트잇을 삭제했습니다.', { exact: true }).waitFor();
    assert.equal(initialReads, 1);

    await input.fill('보호자에게 다시 연락');
    await related.fill('김테스트');
    await input.press('Enter');
    await board.getByText('메모 저장 실패', { exact: false }).waitFor();
    assert.equal(await input.inputValue(), '보호자에게 다시 연락');
    assert.equal(await related.inputValue(), '김테스트');
    await input.press('Enter');
    await board.getByText('저장 중…', { exact: true }).waitFor();
    await input.fill('다음 할 일');
    releaseSave();
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
    assert.equal(await input.inputValue(), '다음 할 일');
    assert.equal(initialReads, 1);
    assert.equal(await related.inputValue(), '김테스트');
    await board.getByRole('button', { name: '이전 달' }).click();
    await board.getByText('지난달 메모', { exact: true }).waitFor();
    assert.equal(await board.getByText('보호자에게 다시 연락', { exact: true }).count(), 0);
    await board.getByRole('button', { name: '이번 달', exact: true }).click();
    await board.getByText('완료 포스트잇', { exact: true }).click();
    await board.getByLabel('박준규 완료 도장').waitFor();
    assert(requests.every(path => path.includes('/quick-memos')), 'board should not load legacy work queries');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    console.log(`PASS ${viewport.width}px: square notes, month and stamps, optimistic save/delete, rollback and request counts`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
