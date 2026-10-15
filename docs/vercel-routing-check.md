# Vercel API 경로 점검 및 수정

점검일: 2026-10-15

## 실제 배포 점검 결과

대상: https://miso-backoffice.vercel.app/

- 화면 HTML과 로그인 기능이 포함된 JS 파일은 200으로 응답했다.
- 로그인 없이 `/api/recipients`, `/api/employment-contracts`, `/api/health`를 요청하면 401과 ‘구글 로그인이 필요합니다’가 반환되었다.
- `/api/auth/config`, `/api/auth/me`, `/api/drive/test-files` 및 수급자 서류의 중첩 경로는 Vercel의 일반 텍스트 404를 반환했다.
- `/.env`, `/server/postgres/schema.sql`은 404였다.

단일 단계 경로는 API에 도착하고 중첩 경로는 도착하지 않는 패턴이다. 환경 변수나 Google 도메인 설정을 바꿔도 이 경로 문제는 해결되지 않는다.

## 코드 변경

기존 `api/[...path].mjs` 대신 명시적인 `api/index.mjs` 서버 함수를 사용한다. `vercel.json`에 `/api/:path*`를 이 함수로 전달하는 rewrite를 추가했다.

내부 쿼리 `__miso_path`에 전달한 원래 API 경로를 서버 진입점에서 복원한다. 폴더 ID 등 일반 쿼리, HTTP 메서드, 요청 본문, 인증 헤더를 보존하고 기존 Postgres API의 인증 검사를 그대로 거친다. 잘못되거나 중복된 내부 경로는 400으로 거부한다.

근거: https://vercel.com/docs/project-configuration/vercel-json#rewrites

## 배포 후 확인

이번 변경 코드가 포함된 버전으로 배포해야 한다. Vercel에서 이전 커밋을 단순 재배포하는 것만으로 로컬 수정이 반영되지는 않는다.

1. `/api/auth/config`가 200과 공개 로그인 설정을 반환하는지 확인한다. 비밀 키나 승인 이메일 목록은 응답에 없어야 한다.
2. 로그인하지 않은 `/api/auth/me`, `/api/recipients`, `/api/employment-contracts`, `/api/drive/test-files`, 수급자 서류 경로는 401이어야 한다.
3. 승인 계정으로 로그인하고 수급자 조회·간단 입력·저장을 확인한다.
4. 미승인 Google 계정은 업무 데이터 접근이 거부되는지 확인한다.
5. Vercel의 서버 인증 환경 변수와 승인 폴더 설정을 확인한 뒤 실제 이미지 조회를 점검한다.

로컬 검증: 라우팅·로그인·Drive 관련 검사 18개와 프로덕션 빌드 통과. 수정된 배포본의 실검증과 실제 Google 계정으로의 브라우저 로그인 검증은 아직 하지 않았다. 이번 비로그인 점검은 이전 배포 URL 전체를 포함한 보안 감사가 아니다.
