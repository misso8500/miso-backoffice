# 구글 로그인 개발·운영 인수인계

작성일: 2026-10-13 · 대상: 구글 로그인을 처음 유지보수하는 개발자

이 문서는 현재 저장소의 구현을 설명합니다. 사용자가 구글 로그인 성공을 확인한 상태에서 작성했으며, 배포 환경의 설정과 보안 점검까지 완료되었다는 뜻은 아닙니다. 실제 이메일·비밀번호·토큰은 문서에 기록하지 않습니다.

## 1. 다시 시작할 때 먼저 읽을 내용

이 기능은 **Google이 신원을 확인하고, Supabase가 앱의 로그인 상태를 관리하며, 우리 서버가 업무 접근을 허용할지 결정**하는 구조입니다.

- 이메일을 `.env.local`에 넣는 것만으로 Google 로그인이 활성화되지는 않습니다.
- Google Cloud의 OAuth 클라이언트와 Supabase의 Google 제공자 설정도 필요합니다.
- 구글 로그인 성공과 업무 접근 허가는 별개입니다. 업무 접근에는 `AUTH_ALLOWED_EMAILS` 등록이 필요합니다.
- 로그인한 크롬 프로필과 계정 선택 화면에서 고른 계정은 다를 수 있습니다. 앱에 표시된 이메일을 확인합니다.
- 로그인 권한에는 드라이브 계약서 읽기 권한이 포함되지 않습니다. 드라이브 미리보기는 후속 개발입니다.

지금 할 일이 다음 중 하나라면 해당 절부터 읽으세요.

| 할 일 | 볼 곳 |
|---|---|
| 개발 서버 실행 | 6절 |
| 사용자 추가·접근 차단 | 7절 |
| 오류 해결 | 9절 |
| 로그인 관련 코드 변경 | 3절, 10절 |
| 배포 주소 변경 | 5절, 11절 |

## 2. 처음 접하는 용어

| 용어 | 이 프로젝트에서의 의미 |
|---|---|
| OAuth | 구글 비밀번호를 우리 앱이 받지 않고, 구글의 로그인·동의 절차를 사용하는 방식 |
| 인증 | “이 사람이 누구인가?”를 확인하는 과정 |
| 인가 | “이 사람이 업무 데이터를 볼 수 있는가?”를 판단하는 과정 |
| Provider | 로그인 제공자. 현재는 `google`만 허용 |
| Client ID | Google이 이 앱을 구분하는 식별자 |
| Client Secret | Google과 Supabase 사이에서 쓰는 비밀 값. 브라우저에 넣지 않음 |
| Callback / Redirect | 로그인 진행 중 다음 화면으로 돌아갈 주소 |
| Session | 로그인 상태. Access Token과 Refresh Token 등을 SDK가 관리 |
| Access Token | 업무 API 요청에 붙이는 만료 시간이 있는 인증 증표 |
| Refresh Token | Access Token을 갱신할 때 사용하는 민감한 값 |
| PKCE | 로그인 시작 브라우저와 돌아온 인증 코드를 연결해 검증하는 절차. SDK에 구현을 맡김 |
| RLS | DB에서 행 접근을 제한하는 기능. 현재 업무 테이블은 일반 클라이언트의 직접 접근을 차단 |

## 3. 실제 로그인 흐름과 코드 위치

```mermaid
sequenceDiagram
    participant B as 브라우저
    participant A as 우리 API
    participant S as Supabase Auth
    participant G as Google
    B->>A: GET /api/auth/config
    A-->>B: Supabase 주소 + 공개 키
    B->>S: Google 로그인 시작(PKCE)
    S->>G: 계정 선택 및 로그인
    G-->>S: 인증 결과(callback)
    S-->>B: 앱 주소로 복귀
    B->>S: SDK가 코드 교환·세션 관리
    B->>A: GET /api/auth/me + Bearer 토큰
    A->>S: GET /auth/v1/user로 사용자 검증
    S-->>A: 검증된 사용자 정보
    A->>A: 구글 계정·이메일 확인·허용 목록 검사
    A-->>B: 허용 시 사용자 정보 / 거부 시 오류
    B->>A: 이후 업무 API에도 토큰 첨부
    A->>S: 업무 요청마다 다시 사용자 검증
```

구글 비밀번호는 Google 화면에서 입력합니다. 우리 서버에 전달하지 않습니다. Google·Supabase의 설정 절차는 [공식 Google 로그인 안내](https://supabase.com/docs/guides/auth/social-login/auth-google)를 따릅니다.

| 파일 | 담당 역할 / 수정할 때 볼 부분 |
|---|---|
| [`src/main.tsx`](../src/main.tsx) | `App` 대신 `AuthGate`를 최초 렌더링 |
| [`src/AuthGate.tsx`](../src/AuthGate.tsx) | 로그인 버튼, `/api/auth/me` 확인, 허용 후 앱 표시, 로그아웃, 실패 안내 |
| [`src/auth.ts`](../src/auth.ts) | Supabase 클라이언트 한 번 생성, PKCE·세션 유지·자동 갱신, Bearer 헤더 생성 |
| [`src/storage.ts`](../src/storage.ts) | 업무 요청마다 토큰 첨부. 401·403이면 로그인 화면에서 재확인하도록 이벤트 발생 |
| [`src/App.tsx`](../src/App.tsx) | 로그인 사용자 이름·이메일 및 로그아웃 표시. 기존 사용자 선택 제거 |
| [`server/auth.mjs`](../server/auth.mjs) | 서버 인증·허용 목록 검사. 접근 제어의 핵심 |
| [`server/postgres/api.mjs`](../server/postgres/api.mjs) | 업무 처리 전에 공통 인증 실행 |
| [`server/api.mjs`](../server/api.mjs) | SQLite 모드에서도 같은 인증 실행 |
| [`api/[...path].mjs`](../api/[...path].mjs) | 배포 환경에서 Postgres API로 연결 |
| [`server/postgres/schema.sql`](../server/postgres/schema.sql) | 업무 테이블 RLS 및 직접 접근 권한 회수 |
| [`server/load-env.mjs`](../server/load-env.mjs) | 환경 변수 읽기 |
| [`tests/auth.test.mjs`](../tests/auth.test.mjs) | 인증·허용 목록·비밀 키 노출 방지 테스트 |

화면을 가리는 `AuthGate`만으로 데이터를 보호할 수는 없습니다. 서버 인증을 거치지 않는 새 API를 만들면 보호가 빠집니다. 새 업무 API도 공통 인증 이후에 처리해야 합니다.

### API별 접근 조건

| 경로 | 로그인 필요 | 의미 |
|---|---|---|
| `GET /api/auth/config` | 아니요 | 공개 URL·공개 키만 반환 |
| `GET /api/auth/me` | 예 | 검증된 사용자 ID·이름·이메일 반환 |
| `/api/recipients`, `/api/employment-contracts` | 예 | 조회·등록·수정 등 업무 처리 |
| `GET /api/backoffice-users` | 예 | 기존 담당자 배정용 목록. 로그인 계정 목록과 다름 |
| `GET /api/health` | 예 | DB 연결 정보 조회 |
| 기존 사용자 생성·선택 요청 | 예, 이후 405 | 수동 사용자 선택 기능은 폐지 |

`OPTIONS` 사전 요청에는 업무 데이터 없이 응답합니다. `/api/auth/config`에 공개 키가 보이는 것은 의도된 동작입니다. 공개 키가 있다는 이유로 DB 자료까지 공개되어서는 안 됩니다.

## 4. 설정 값은 어디에 있는가

| 값 | 설정 장소 | 브라우저 공개 여부 |
|---|---|---|
| Google Client ID | Google에서 발급 → Supabase Google 설정에 입력 | 식별자이며 비밀번호는 아님 |
| Google Client Secret | Google에서 발급 → Supabase Google 설정에 입력 | 비공개 |
| `SUPABASE_URL` | 로컬 `.env.local` / 배포 서버 환경 변수 | 공개 |
| `SUPABASE_PUBLISHABLE_KEY` | 로컬 `.env.local` / 배포 서버 환경 변수 | 공개 |
| `AUTH_ALLOWED_EMAILS` | 로컬 `.env.local` / 배포 서버 환경 변수 | 서버에서만 사용 |
| `DATABASE_URL` | 로컬 `.env.local` / 배포 서버 환경 변수 | 비공개. DB 비밀번호 포함 |
| Access Token·Refresh Token | SDK가 브라우저 저장소에 세션으로 관리 | 사용자의 민감한 인증 정보 |

`getPublicAuthConfig`는 `sb_publishable_` 키 또는 기존 `anon` 역할 키만 받아들입니다. `sb_secret_`·`service_role` 키는 반환하지 않습니다. 이를 우회하도록 수정하지 않습니다.

환경 변수는 **이미 셸·호스팅에 설정된 값 > `.env.local` > `.env`** 순으로 우선합니다. `.env.local`을 고쳤는데 반영되지 않으면 API 재시작 여부와 셸에 같은 변수가 설정되어 있는지 확인합니다. 값을 확인하기 위해 비밀번호까지 로그에 출력하지 않습니다.

## 5. 가장 헷갈리는 두 종류의 복귀 주소

| 주소 | 등록 장소 | 용도 |
|---|---|---|
| `https://PROJECT_REF.supabase.co/auth/v1/callback` | Google OAuth 클라이언트의 승인된 리디렉션 URI | Google → Supabase 복귀 |
| `http://127.0.0.1:5173/` 또는 실제 배포 주소의 `/` | Supabase Authentication → URL Configuration → Redirect URLs | Supabase → 우리 앱 복귀 |

현재 사용 중인 Supabase callback 예시:

```text
https://qvvnefsdxewzaykrsrev.supabase.co/auth/v1/callback
```

Google Cloud 프로젝트: **MisoBackoffice**, 프로젝트 ID: `misobackoffice`. 프로젝트를 바꾸면 주소와 키도 함께 확인합니다. Supabase 프로젝트 ID와 Google Cloud 프로젝트 ID는 서로 다른 값입니다.

Google의 승인된 JavaScript 원본에는 앱의 origin을 등록합니다. 개발 예시는 `http://localhost:5173`과 `http://127.0.0.1:5173`입니다. 이 둘은 브라우저에서 서로 다른 주소입니다. 현재 앱은 로그인 복귀 주소를 `window.location.origin + '/'`로 만듭니다. 로그인 시작과 복귀의 주소를 일치시키고, Vite 포트가 5174 등으로 변경되었다면 먼저 실행 포트를 확인합니다.

새 프로젝트에서 처음 설정하는 전체 순서는 [구글 로그인 설정 문서](google-login.md)에 있습니다. Google 콘솔 메뉴는 바뀔 수 있으므로 [Google Auth Platform 안내](https://support.google.com/cloud/answer/15544987?hl=ko)도 참고합니다.

## 6. 매일 개발할 때의 실행 순서

처음 소스를 내려받았으면 Node.js 24 이상을 준비하고 `npm ci`로 의존성을 설치합니다. 기존 `.env.local`이 있으면 덮어쓰지 않습니다. 새 환경에서는 `.env.example`을 참고해 만듭니다.

```dotenv
# 실제 값은 로컬 파일과 배포 서버에서만 관리
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
AUTH_ALLOWED_EMAILS=first@gmail.com,second@gmail.com,third@gmail.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require
PGSSLMODE=require
```

터미널 1:

```bash
npm run supabase:check
npm run api
```

터미널 2:

```bash
npm run dev
```

Vite가 출력한 주소로 접속해 구글 로그인을 진행합니다. `supabase:check`는 Supabase API와 DB 연결을 점검하며, 구글 계정 선택·로그인 성공까지 검사하지는 않습니다.

`npm run supabase:init`은 최초 환경 구성 또는 스키마 변경 적용 시 사용합니다. 단순 연결 점검 명령이 아니며 DB 테이블·권한을 변경하므로 대상 프로젝트를 먼저 확인합니다. 현재 Postgres API도 시작할 때 스키마를 적용하고 DB 연결이 실패하면 시작하지 못합니다. 따라서 DB 오류로 `/api/auth/config`까지 열리지 않을 수 있습니다.

## 7. 사용자 추가·변경·접근 차단

### 한 명 추가

1. 사용할 구글 이메일을 확인합니다. 비밀번호는 받지 않습니다.
2. Google 앱의 Audience가 Testing이면 **Test users**에도 해당 계정을 추가합니다.
3. `.env.local`의 `AUTH_ALLOWED_EMAILS`에 쉼표로 구분해 추가합니다.
4. 실행 중인 API를 `Ctrl+C`로 종료하고 `npm run api`로 다시 시작합니다.
5. 배포 중이라면 배포 환경 변수도 별도로 변경하고 재배포합니다.
6. 당사자가 로그인하여 앱 상단 이메일과 업무 조회 성공을 확인합니다.

Google의 테스트 사용자 설정과 우리 앱의 허용 목록은 다른 설정입니다. 테스트 사용자 제한 적용 여부는 Google 앱 상태와 범위에 따라 달라도, 우리 앱은 항상 허용 목록을 검사합니다. 이메일 비교는 대소문자와 주변 공백을 정리하며, 와일드카드나 도메인 전체 허용 기능은 없습니다.

### 접근 차단

1. 해당 이메일을 로컬·배포 환경의 허용 목록에서 제거합니다.
2. API 재시작 또는 재배포 후, 해당 계정의 다음 업무 요청이 403으로 거부되는지 확인합니다.
3. 실제 계정 유출 상황이면 Google 계정과 Supabase 세션도 별도로 정리합니다.

화면에 이미 내려받은 데이터나 사용자가 저장한 파일까지 회수되지는 않습니다. 허용 목록을 바꾸기 위해 보안을 끄거나 DB 사용자를 삭제할 필요는 없습니다.

로그인 계정 추가가 기존 수급자 담당자 목록에 자동 등록되는 것은 아닙니다. 담당자 데이터는 기존 배정을 보존하며 이름만으로 구글 계정에 연결하지 않습니다.

## 8. 사용자가 알아야 할 동작

- **로그인:** 큰 구글 로그인 버튼 → 계정 선택 → 앱 상단 이메일 확인.
- **새로고침:** SDK가 브라우저에 남은 세션을 복원한 뒤 서버 확인을 거칩니다.
- **자동 갱신:** SDK가 토큰을 갱신합니다. 갱신 자체로 작성 중인 화면을 초기화하지 않도록 구현했습니다.
- **권한 오류:** 업무 API가 401·403을 반환하면 로그인 검사를 다시 진행합니다.
- **로그아웃:** 이 브라우저의 앱 세션을 종료합니다. Google 계정 자체나 다른 PC까지 모두 로그아웃하는 기능은 아닙니다.
- **여러 탭:** 같은 origin의 탭끼리 SDK가 로그인 상태 변화를 전달합니다. 다른 주소·브라우저·PC는 별개입니다.
- **첨부:** 현재 계약서 이미지는 임시 미리보기입니다. 로그인 성공이 이미지 영구 저장이나 드라이브 연결 완료를 뜻하지 않습니다.

로그아웃이 이미 발급된 모든 Access Token을 즉시 무효화하는 것은 아닙니다. 전체 기기 로그아웃·강제 세션 종료 요구가 생기면 별도 설계가 필요합니다. [Supabase 로그아웃 설명](https://supabase.com/docs/guides/auth/signout), [세션 설명](https://supabase.com/docs/guides/auth/sessions)

## 9. 오류가 발생했을 때 보는 순서

먼저 **어느 화면에서 실패했는지** 구분합니다. Google 화면의 오류는 Google 설정, Supabase 주소에서 발생한 오류는 제공자·복귀 주소 설정, 앱으로 돌아온 뒤의 오류는 우리 서버의 권한·연결을 우선 확인합니다.

| 오류·증상 | 주로 확인할 곳 | 조치 |
|---|---|---|
| `Unsupported provider: provider is not enabled` | Supabase Authentication → Google | Google 제공자 활성화, Client ID·Secret 저장, 앱과 같은 Supabase 프로젝트인지 확인 |
| `redirect_uri_mismatch` | Google OAuth 클라이언트 | Supabase callback을 승인된 리디렉션 URI에 정확히 등록 |
| Google `access_denied` | Google Audience / 사용자의 취소 여부 | Testing 상태라면 테스트 사용자 확인, 취소했으면 재시도 |
| 로그인 후 다른 사이트·localhost로 이동 | Supabase URL Configuration | 현재 앱 주소를 Redirect URLs에 등록하고 Site URL도 확인 |
| 코드 교환 실패·PKCE 오류 | 로그인 시작·복귀 주소와 브라우저 | 같은 브라우저·origin에서 새 로그인 시작. 이전 callback URL을 재사용하지 않음 |
| “사용 권한이 없는 계정” / 403 | 앱 표시 이메일·`AUTH_ALLOWED_EMAILS` | 선택한 계정, 목록, 재시작·재배포 확인 |
| “로그인 허용 계정이 설정되지 않았습니다” / 503 | API 환경 변수 | 비어 있는 허용 목록을 설정. 빈 값은 전체 허용이 아니라 전체 차단 |
| “로그인 설정을 확인해 주세요” / 503 | Supabase URL·공개 키 | 누락·오타·프로젝트 불일치 확인. 비밀 키를 넣어 해결하지 않음 |
| “로그인이 만료되었습니다” / 401 | 세션 | 재로그인. 반복되면 Supabase Auth 응답 확인 |
| “로그인 확인에 연결하지 못했습니다” / 503 | 서버 → Supabase 네트워크 | 연결 상태 확인. 브라우저 로그인 성공과 서버 연결은 별개 |
| “로그인을 준비하지 못했습니다” | `/api/auth/config`, API 터미널 | API 실행·프록시 확인. DB 초기 연결 오류도 확인 |
| `tenant/user ... not found` | `DATABASE_URL` | Supabase Connect에서 해당 프로젝트 연결 문자열 재확인. Google 설정으로 해결되지 않음 |

### 크롬 개발자 도구로 확인하기

1. 개발자 도구를 열고 **Network** 탭을 선택합니다.
2. 앱 새로고침 후 `/api/auth/config`를 찾습니다. 정상은 200이며 URL과 공개 키만 있어야 합니다.
3. 로그인 후 `/api/auth/me`를 찾습니다. 정상은 200이며 사용자 ID·이름·이메일을 반환합니다.
4. 업무 요청의 상태 코드를 봅니다. 401은 인증, 403은 접근 권한, 503은 설정·연결 문제를 우선 확인합니다.
5. 오류를 전달할 때 요청 경로, 상태 코드, 오류 문구, 발생 단계만 기록합니다. Authorization 헤더와 세션 값은 가립니다.

토큰을 복사해서 채팅에 붙이거나 `Copy as cURL` 결과·HAR 파일을 그대로 공유하지 않습니다. 인증 정보나 개인정보가 들어 있을 수 있습니다.

## 10. 개발 후 점검 방법

자동 점검:

```bash
node --test tests/auth.test.mjs
npm run build
git diff --check
```

인증 테스트는 외부 인증 서버 응답을 가짜 응답으로 대체합니다. 토큰 누락, 허용 계정, 비허용 계정, Google 이외 인증, 설정 누락, 인증 서버 장애, 비밀 키 노출 방지를 검사합니다. Google 콘솔 설정이나 실제 브라우저 로그인은 자동 테스트만으로 확인할 수 없습니다.

수동 점검은 테스트 데이터로 진행합니다.

| 점검 | 기대 결과 |
|---|---|
| 시크릿 창으로 앱 열기 | 업무 데이터 없이 로그인 화면 |
| 허용된 Google 계정으로 로그인 | 상단 이메일 일치, 수급자·계약 조회 성공 |
| 새로고침 | 로그인 복원 후 업무 화면 |
| 테스트 계약 오탈자 수정 | 같은 계약에 저장, 새 계약이 중복 생성되지 않음 |
| 업무 화면에서 다른 탭으로 이동했다 돌아오기 | 불필요한 로그인 반복·작성 내용 초기화 없음 |
| 로그아웃 및 같은 origin의 다른 탭 확인 | 업무 화면이 닫힘 |
| Google 로그인 취소 | 다시 로그인 가능. 오류 화면에 갇히지 않음 |
| Google 인증은 가능한 비허용 테스트 계정 | 앱의 `/api/auth/me`가 403, 업무 데이터 접근 불가 |
| 로그인 계정을 목록에서 제거 후 서버 재시작 | 다음 업무 API가 403. 화면에 남은 데이터 회수와는 구분 |

익명 API 차단 확인은 토큰 없이 실행할 수 있습니다.

```bash
curl -i http://127.0.0.1:5174/api/employment-contracts
```

기대 결과는 **401과 로그인 필요 메시지**입니다. 200으로 계약 데이터가 오면 배포를 진행하지 않습니다. API가 실행 중이고 DB 초기 연결도 성공한 상태에서 검사합니다.

## 11. 배포하거나 주소를 변경할 때

1. 실제 배포 주소를 정하고 Google 승인된 JavaScript 원본과 Supabase Redirect URLs에 반영합니다.
2. Site URL을 실제 운영 주소로 설정합니다. Supabase 프로젝트가 같으면 Google에 등록한 callback은 그대로입니다.
3. 배포 서버에 Supabase URL·공개 키·DB 연결 문자열·허용 이메일 목록을 모두 설정합니다. 로컬 `.env.local`은 자동 배포되지 않습니다.
4. 대상 DB를 확인하고 RLS·권한 변경 스키마가 적용되었는지 확인합니다. 현재 서버는 DB 소유자 연결을 전제로 합니다.
5. 재배포 후 실제 주소에서 10절의 허용·비허용·익명 접근 점검을 실행합니다.

설정만 바꾸는 경우에도 실제 로그인 점검이 필요합니다. 기존 운영 설정이 정상이면 무작정 OAuth 클라이언트를 새로 만들지 말고 변경된 값부터 비교합니다.

## 12. 현재 한계와 다음 담당자가 기억할 것

- 허용된 사용자는 현재 동일한 업무 API를 이용합니다. 대표·직원별 읽기/수정 권한 분리는 아직 없습니다.
- 업무 API마다 Supabase에 검증을 요청하므로 인증 서비스 연결 장애는 업무 접근에도 영향을 줍니다.
- 브라우저 세션 저장을 사용합니다. XSS 방지와 공용 PC 사용 습관도 보호에 중요하며, RLS나 별표 표시만으로 이를 대신할 수 없습니다.
- 로그인 구현이 개인정보 전체 보안 점검의 완료를 뜻하지 않습니다. 공개 view·함수·파일 저장소, 백업, 로그, 관리자 계정도 운영 전 확인해야 합니다.
- Google Drive 권한·파일 연결·이미지 영구 저장은 현재 로그인 기능의 범위 밖입니다.

장애·변경을 기록할 때는 **발생 일시 / 개발 또는 운영 주소 / 실패 단계 / 상태 코드 / 바꾼 설정 항목 / 재점검 결과**를 남깁니다. 비밀 값 대신 설정 항목 이름만 기록합니다.
