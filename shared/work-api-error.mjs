// Old work servers return a Korean 404; older generic servers use English.
// Neither response can be fixed by retrying the same read against that server.
export function workApiError(error, development) {
  if (!(error instanceof Error) || !['Not found', '업무 API를 찾을 수 없습니다.'].includes(error.message)) return error;
  return new Error(development
    ? '실행 중인 API 서버에 이 기능이 아직 반영되지 않았습니다. API 터미널에서 서버를 종료하고 npm run api로 다시 실행해 주세요. 화면의 불러오기만으로는 서버가 갱신되지 않습니다.'
    : '서버에 이 기능이 아직 반영되지 않았습니다. 최신 API가 포함된 배포가 필요합니다. 화면을 다시 불러오는 것만으로는 해결되지 않습니다.');
}
