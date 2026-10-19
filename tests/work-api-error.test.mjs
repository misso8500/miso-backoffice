import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workApiError } from '../shared/work-api-error.mjs';

test('both old API 404 formats explain server restart instead of an endless reload', () => {
  for (const text of ['Not found', '업무 API를 찾을 수 없습니다.']) {
    assert.match(workApiError(new Error(text),true).message,/npm run api/);
    assert.match(workApiError(new Error(text),true).message,/불러오기만으로는/);
    const deployed = workApiError(new Error(text),false).message;
    assert.match(deployed,/배포/); assert.doesNotMatch(deployed,/터미널|npm/);
  }
});
test('authentication, missing records, conflicts and network failures retain their original cause', () => {
  for (const text of ['로그인이 필요합니다.','기록을 찾을 수 없습니다.','다른 사용자가 기록을 바꾸었습니다.','Failed to fetch']) {
    const error = new Error(text); assert.equal(workApiError(error,true),error);
  }
  assert.equal(workApiError(null,true),null);
});
