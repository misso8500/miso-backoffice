# 구글 로그인 설정

처음 유지보수한다면 [개발·운영 인수인계](google-login-handover.md)에서 로그인 원리, 코드 위치, 계정 관리, 점검 및 오류 해결 방법을 먼저 확인한다. 이 문서는 최초 설정 순서를 요약한다.

기존 사용자 선택 화면을 제거했다. 승인된 구글 계정으로 로그인해야 수급자·근로계약·담당자 정보를 조회하거나 변경할 수 있다. 드라이브 파일 권한은 아직 요청하지 않는다.

## 1. Google OAuth 등록

Google Cloud의 Google Auth Platform에서 프로젝트를 선택한다.

1. 앱 이름과 지원 이메일을 설정한다. Audience가 Testing이면 이용할 구글 계정을 Test users에 추가한다.
2. Data Access에는 로그인용 `openid`, `userinfo.email`, `userinfo.profile`만 사용한다.
3. Clients에서 Web application용 OAuth Client ID를 만든다.
4. Authorized JavaScript origins에 실제 사용하는 개발 주소(예: `http://127.0.0.1:5173`, `http://localhost:5173`)와 배포 주소를 추가한다.
5. Authorized redirect URIs에 Supabase Authentication의 Google 설정 화면에 나오는 callback URL을 정확히 추가한다. 예: `https://PROJECT_REF.supabase.co/auth/v1/callback`.
6. Client ID와 Client Secret을 Supabase의 Google provider 설정에 입력하고 활성화한다. Secret은 소스 코드나 브라우저 환경 변수에 넣지 않는다.

## 2. Supabase URL 설정

Authentication → URL Configuration에서 Site URL을 실제 배포 주소로 설정한다. Redirect URLs에 실제 개발 주소의 `/`와 배포 주소의 `/`를 추가한다. 사용하지 않는 주소나 넓은 와일드카드는 등록하지 않는다.

구글 OAuth의 callback은 **Supabase 주소**이고, Supabase가 최종적으로 돌려보낼 주소는 **이 앱 주소**다. 두 주소를 혼동하지 않는다.

## 3. 서버 환경 변수

`.env.local` 또는 배포 환경에 다음을 설정한다. `.env.example` 참고.

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
AUTH_ALLOWED_EMAILS=first@gmail.com,second@gmail.com,third@gmail.com
```

`DATABASE_URL`은 동일 프로젝트의 유효한 Postgres 연결 문자열이어야 한다. 허용 목록이 비어 있으면 누구도 업무 데이터에 접근할 수 없다. Google의 Test users 설정과 앱의 허용 목록은 별도이므로 둘 다 설정한다.

브라우저는 `/api/auth/config`에서 URL과 공개 키만 받는다. 허용 이메일 목록, DB 비밀번호, Google Client Secret은 전달하지 않는다. `service_role` 키와 `sb_secret_` 키는 이 설정에 사용할 수 없다.

## 4. 데이터 접근 보호와 담당자

모든 업무 API는 Supabase Auth 서버에서 토큰을 검증하고, 구글 로그인·이메일 확인·허용 목록을 검사한다. SQLite API도 동일한 인증을 요구한다. 인증 없이 접근 가능한 경로는 공개 로그인 설정 조회뿐이다.

Postgres 스키마는 업무 테이블에 RLS를 활성화하고 `anon`, `authenticated`의 직접 테이블 접근 권한을 회수한다. 데이터 조회는 인증 검사를 하는 서버와 DB 소유자 연결을 통해서만 수행한다. 기존 프로젝트는 배포 전에 `npm run supabase:init`으로 적용한다. 별도로 만든 공개 view, 함수, Storage bucket이 있다면 접근 권한도 확인해야 한다.

기존 담당자 목록과 수급자의 담당자 배정은 보존한다. 이 목록은 로그인 계정 목록과 별개이며, 이름만으로 기존 담당자를 구글 계정과 자동 연결하지 않는다. 기존 사용자 생성·사용자 선택 API는 더 이상 제공하지 않는다.

## 5. 실행 및 확인

```bash
npm run supabase:check
npm run supabase:init
npm run api
# 별도 터미널
npm run dev
```

설정 변경 후 API를 재시작한다. 배포 환경 변수 변경 시 재배포한다.

- 로그인 전 업무 화면과 API가 차단되는지 확인한다.
- 허용된 계정은 업무 화면에 진입하고, 허용되지 않은 계정은 거부되는지 확인한다.
- 로그아웃과 다른 탭의 로그아웃 이후 화면이 닫히는지 확인한다.
- 로그인 후 수급자 조회, 계약 수정, 담당자 배정이 동작하는지 확인한다.
- OAuth 취소 후 다시 로그인할 수 있는지 확인한다.
- 구글 드라이브 미리보기 권한·파일 연결은 이후 작업이다.

공식 안내: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google), [사용자 검증](https://supabase.com/docs/reference/javascript/auth-getuser).
