# Miso Backoffice 재가동·배포 복구 체크리스트

작성 기준: 2026-11-09, 현재 저장소 코드와 설정 문서. 사용자는 기존 개발키를 폐기했고 GitHub SSH 키만 새로 등록한 상태다. 아래 체크박스는 실제 서비스 콘솔에서 확인 후 완료한다. 이번 정리는 외부 계정 상태 확인, 키 발급, DB 접속 또는 배포를 수행한 결과가 아니다. 비밀값은 포함하지 않는다.

## 1. 현재 연결 구조와 우선 확인 사항

`GitHub → Vercel(React/Vite + Node API) → Supabase Postgres/Auth`

`Node API → Google 서비스 계정 → Google Drive 원본 서류`

Google 로그인용 OAuth 클라이언트와 Drive 조회용 서비스 계정은 별개다. GitHub SSH 키는 개발 PC의 저장소 접근용이며 Vercel의 GitHub 연동 권한을 대신하지 않는다.

- `.env.local`이 남아 있다. 실제 값이나 유효성은 확인하지 않았으므로 과거 키 복원본으로 사용하지 말고 새 값으로 교체한다.
- `data/miso-backoffice.sqlite`가 Git 추적 대상이다. 실제 개인정보 포함 여부는 확인하지 않았다. 포함되었다면 저장소 접근 이력과 과거 커밋까지 점검하고, 백업 후 추적 제외 및 필요시 이력 정리를 별도 진행한다. 현재 `.gitignore`에는 DB와 `miso-backoffice.local.json` 제외 규칙도 없다.
- `.env.example`에는 상담자 서류용 `DRIVE_PROSPECT_ROOT_IDS`, `DRIVE_PROSPECT_FOLDER_IDS`가 빠져 있다. 현재 코드는 비어 있으면 수급자 폴더 허용 설정으로 대체한다.
- `SUPABASE_JWKS_URL`은 예제에만 있고 현재 인증 코드에서는 읽지 않는다. 이를 추가하는 것만으로 로그인 복구나 세션 폐기가 되지 않는다.
- API는 시작 시 `server/postgres/schema.sql`을 실행한다. 기존 DB 백업과 스키마 검토를 API 첫 실행보다 먼저 한다. 추가 업무 테이블은 관련 코드에서도 생성하므로 기본 초기화 성공만으로 전체 기능 복구가 입증되지는 않는다.
- AWS, OpenAI, 메일 발송 키는 현재 조사한 앱 실행 코드에서 확인되지 않았다. 이 앱 복구를 위해 새로 만들 필요가 확인된 키가 아니다.

## 2. 사용자 작업 순서

### A. 계정·데이터·기존 접근 확인

- [ ] 신뢰할 수 있는 개발 PC에서 진행한다. PC 침해가 의심된다면 새 키를 넣기 전에 점검·복구한다.
- [ ] GitHub, Vercel, Supabase, Google Cloud, Bitwarden의 소유 계정·복구 이메일·MFA 및 복구 수단을 확인한다.
- [ ] 기존 키 폐기 기록과 각 콘솔의 남은 키·토큰·로그인 세션·연결 앱·협업자를 대조한다. 새 키 발급은 기존 접근 폐기의 증거가 아니다.
- [ ] 의심 접근·배포·DB 변경·Drive 공유 변경 및 비정상 과금을 확인한다. 사고가 의심되는 로그와 시각은 보존한다.
- [ ] 기존 Supabase 프로젝트와 DB 데이터, Drive 원본 및 폴더 구조가 남아 있는지 확인한다. 프로젝트가 남아 있다면 이를 복구하는 경로를 먼저 선택한다.
- [ ] DB 백업과 별도 위치 복사본을 확보하고 복구 가능 여부를 확인한다. Drive 문서도 별도로 백업한다. DB에는 문서 연결 ID만 있고 원본 이미지는 Drive에 있으므로 DB 백업만으로 문서를 복원할 수 없다.
- [ ] 예전 운영·Preview 배포 URL의 접근 상태를 확인한다. 미검증 배포로 운영 트래픽이 재개되지 않도록 한다.

### B. GitHub·개발 PC

- [ ] 새 SSH 키로 저장소 접근을 확인하고 기존 SSH/deploy key, PAT, GitHub App 권한이 의도한 상태인지 확인한다.
- [ ] 배포할 브랜치·커밋과 저장소 URL을 기록한다. 저장소 및 의존성 변경에 의심 내용이 없는지 검토한다.
- [ ] Node.js 24 계열과 npm을 준비한다. README의 로컬 기준은 Node 24 이상이다.
- [ ] `npm ci`로 잠금 파일 기준 설치하고 `npm audit` 결과를 검토한다. 자동 강제 업데이트는 별도 판단한다.
- [ ] 새 값으로 `.env.local`을 구성하고 로컬 JSON 키는 저장소 밖에 보관한다. `.env.local`과 키 파일의 접근 권한을 소유자에게 제한한다.

### C. Supabase DB·로그인

- [ ] 프로젝트가 중지 상태면 복구하고, 삭제되었다면 새 프로젝트와 백업 복원 계획을 준비한다.
- [ ] DB 비밀번호를 새로 설정하고 Dashboard Connect의 Session pooler 연결 문자열로 `DATABASE_URL`을 만든다. 비밀번호 특수문자는 URL 인코딩한다. 로컬·운영의 DB 목적지를 구별한다.
- [ ] 같은 프로젝트의 `SUPABASE_URL`과 publishable key를 확보한다. 노출된 secret/service-role 키가 있었다면 앱 사용 여부와 별개로 폐기 여부를 확인한다.
- [ ] 과거 Auth 세션·refresh token 무효화 필요성을 확인하고 처리한다. DB 비밀번호, API 키, JWT 서명키, 사용자 세션은 별개이므로 한 가지 교체로 전부 폐기되었다고 간주하지 않는다. JWT 서명키 유출이 의심되면 해당 키 교체와 기존 토큰 영향도 함께 검토한다.
- [ ] 백업 및 스키마 검토 후 `npm run supabase:check`, `npm run supabase:init`을 실행한다. 후자는 DB를 변경한다.
- [ ] 업무 테이블 RLS 및 `anon`/`authenticated` 직접 접근 제한을 확인한다. 별도로 생성한 view·함수·Storage가 있다면 함께 확인한다.
- [ ] 별도 개발 DB 사용 시 필요한 테스트 데이터와 Auth/OAuth 설정을 따로 준비한다. 운영 개인정보를 Preview에 연결하지 않는다.

### D. Google 로그인

- [ ] Google Cloud 프로젝트의 웹 OAuth 클라이언트를 확인하고 새 Client Secret을 발급·적용한다. 클라이언트 자체가 삭제됐다면 새 Client ID도 발급한다.
- [ ] 로그인 scope는 `openid`, `userinfo.email`, `userinfo.profile`로 설정한다.
- [ ] Google 승인 redirect URI에 해당 Supabase 프로젝트의 `https://PROJECT_REF.supabase.co/auth/v1/callback`을 등록한다.
- [ ] 사용하는 로컬 origin과 확정된 운영 origin을 Google 클라이언트에 등록한다.
- [ ] OAuth 동의 화면의 Audience, 게시 상태 및 Testing일 때 Test users를 확인한다.
- [ ] Supabase Google provider에 Client ID·새 Secret을 입력하고 활성화한다. OAuth Secret은 앱 `.env.local`이나 Vercel에 넣는 변수가 아니다.
- [ ] Supabase Site URL은 운영 URL, Redirect URLs는 실제 사용하는 로컬·운영 복귀 주소로 설정한다. 넓은 Preview 와일드카드는 피한다.
- [ ] `AUTH_ALLOWED_EMAILS`와 `WORK_CATEGORY_ADMIN_EMAILS`를 확인한다. Google Test users, 앱 허용 이메일, 카테고리 관리자 목록은 각각 별개다.

### E. Google Drive

- [ ] Google Drive API 활성화 상태와 서비스 계정을 확인한다.
- [ ] 기존 계정을 유지하면 폐기된 키 대신 새 JSON 키를 발급한다. 계정 자체를 교체했다면 새 서비스 계정 이메일에 필요한 폴더만 뷰어로 다시 공유한다.
- [ ] 키 유출로 이미 발급된 단기 토큰까지 의심되는 경우 키 삭제만으로 즉시 전부 무효화된다고 가정하지 말고 계정 비활성화·교체 필요성을 검토한다.
- [ ] 수급자, 상담자, 공문 서식 폴더 ID와 공유 권한을 확인한다. 서버 허용 목록과 Drive 공유가 모두 충족되어야 한다.
- [ ] 로컬에는 `GOOGLE_APPLICATION_CREDENTIALS`로 JSON 파일 절대 경로를 지정한다.
- [ ] Vercel에는 `GOOGLE_SERVICE_ACCOUNT_JSON`으로 JSON 전체를 서버 전용 Sensitive 값으로 등록한다. 로컬 파일 경로를 넣지 않는다. JSON 값은 파일 경로보다 우선하며 추가 따옴표로 감싸지 않는다.
- [ ] 테스트 폴더를 설정했다면 `npm run drive:check`를 실행한다. 실제 앱에서는 각 업무 폴더와 연결된 문서 조회도 따로 확인한다.

### F. 로컬 검증·Vercel 배포

- [ ] `npm run build`를 통과하고 인증·라우팅·Drive 관련 기존 테스트를 실행한다. 테스트 파일별 외부 DB 의존성을 먼저 확인한다.
- [ ] `npm run api`와 별도 터미널의 `npm run dev`로 로컬 로그인·조회·저장을 확인한다.
- [ ] Vercel GitHub App의 저장소 접근, 프로젝트·팀 소유자, Production 브랜치, 루트 디렉터리를 확인한다. Git 연동 방식이면 별도 Vercel API 토큰을 발급할 필요가 없다.
- [ ] Vercel Node 런타임을 코드와 맞추고 Build Command `npm run build`, Output Directory `dist`, `vercel.json` 및 `api/index.mjs`가 포함된 커밋을 배포한다.
- [ ] Production 환경 변수를 등록한다. DB URL과 서비스 계정 JSON은 Sensitive로 설정하고 Preview에는 별도 개발 자격증명만 제공한다.
- [ ] 확정된 운영 도메인·HTTPS·필요시 DNS를 확인한다. 과거 문서의 `miso-backoffice.vercel.app`이 현재 프로젝트 주소인지는 콘솔에서 확인한다.
- [ ] 새 환경 변수를 적용한 새 배포를 생성한다. 환경 변수 수정만으로 기존 배포가 갱신되지는 않는다.
- [ ] 아래 운영 확인표를 모두 통과한 후 사용자 접근을 재개한다. 이전 배포가 재노출되지 않는지도 확인한다.

## 3. 보관할 키·계정 목록 — Bitwarden 권장 항목

각 항목에 환경(dev/prod), 서비스 소유 계정, 프로젝트 ID, 발급·변경일, 키 ID/지문, 사용 위치, 폐기 방법과 마지막 확인일을 기록한다. 비밀값 없는 복구 현황 문서는 Git에 둘 수 있다.

| 권장 항목명 | 보관 내용 | 실제 적용 위치 |
|---|---|---|
| MISO / GitHub / 개발 PC SSH | 새 개인키·공개키·암호·지문·장치명, 저장소 URL | 개인키는 개발 PC/지원되는 SSH agent, 공개키만 GitHub |
| MISO / Supabase / prod DB | DB 비밀번호, 전체 DATABASE_URL, project ref, pooler 호스트·포트·사용자 | 로컬 또는 Vercel 서버 환경. dev DB는 별도 항목 |
| MISO / Supabase / Auth 설정 | 프로젝트 URL, publishable key, 허용 URL, Google provider 설정 참조 | 앱 서버 환경과 Supabase 콘솔. publishable key는 공개 가능 값 |
| MISO / Google / OAuth | Cloud project ID, Client ID, 새 Client Secret, callback·origin·동의화면 설정 | Client Secret은 Supabase Google provider |
| MISO / Google / Drive 서비스 계정 | JSON 원본 전체, 서비스 계정 이메일, private_key_id, Cloud project ID | 로컬 저장소 밖 JSON / Vercel 서버 Sensitive 변수 |
| MISO / Vercel / 배포 설정 | 팀·프로젝트 ID, 저장소·브랜치·도메인, 환경별 변수 구성과 비밀 항목 참조 | Vercel 프로젝트 설정 |
| MISO / 업무 접근·Drive 폴더 | 허용 이메일·관리자 이메일, 용도별 폴더 ID, 공유 대상 서비스 계정 | 로컬/Vercel 서버 환경 및 Drive 공유 |
| 각 서비스 / 관리자 로그인·복구 | 로그인 방식, 비밀번호/패스키, MFA 복구 코드, 복구 이메일 | GitHub/Vercel/Supabase/Google/도메인 계정. SSO면 제공자 기록 |
| MISO / 도메인·DNS (사용 시) | 등록기관·DNS 계정, 갱신일, 레코드, API 토큰은 실제 자동화 사용 시만 | 도메인/DNS 관리 서비스 |

Bitwarden에는 위 항목을 환경별로 분리해 보관한다. JSON은 보안 노트 또는 사용 요금제가 지원하는 파일 첨부로 원문을 보존한다. 붙여넣기 후 `private_key`의 줄바꿈 표기와 JSON 형식이 유지되는지 확인한다. 금고를 통한 보관과 실행 서버에 실제 적용하는 것은 별도 작업이다.

Bitwarden 자체의 복구 정보와 MFA 복구 코드는 금고에 접근하지 못할 때도 사용할 수 있는 별도 안전한 오프라인 장소에 보관한다. 금고 평문 내보내기 파일을 다운로드 폴더·Git·일반 클라우드 공유에 남기지 않는다. 폐기된 키 원문은 재사용용으로 보관하지 않고 식별자·폐기일·사유를 남긴다. 사고 증거 보존이 필요하면 별도의 제한된 보관 절차를 따른다.

## 4. 환경 변수 전체 목록

| 이름 | 필수성·설정 위치 | 성격·주의 |
|---|---|---|
| `DATABASE_URL` | 기본 Postgres 실행 필수, 로컬/Vercel | 비밀. DB 암호 포함 |
| `PGSSLMODE` | 로컬/Vercel: `require` | 일반 설정 |
| `PG_POOL_MAX` | 선택. 코드 기본 로컬 5, Vercel 1 | 연결 수 설정 |
| `SUPABASE_URL` | 로그인 필수, 로컬/Vercel | 공개 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 로그인 필수, 로컬/Vercel | 공개 가능. `sb_secret_`/service-role로 대체 금지 |
| `AUTH_ALLOWED_EMAILS` | 업무 접근 필수, 로컬/Vercel | 서버 전용. 쉼표 구분, 비면 모두 거부 |
| `WORK_CATEGORY_ADMIN_EMAILS` | 카테고리 변경 시 필요 | 서버 전용. 비면 모두 변경 거부 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 로컬 Drive 인증 | 저장소 밖 JSON의 절대 경로. 경로 자체는 키가 아님 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vercel Drive 인증 | 비밀. JSON 전체. 로컬에서도 설정되면 파일보다 우선 |
| `DRIVE_RECIPIENT_ROOT_IDS` | 수급자 서류 기능 | 승인할 상위 폴더 ID, 쉼표 구분 |
| `DRIVE_RECIPIENT_FOLDER_IDS` | 선택 | 개별 사람 폴더 예외 허용 |
| `DRIVE_PROSPECT_ROOT_IDS` | 상담자 서류 별도 범위 사용 시 | 미설정이면 수급자 root 설정으로 대체 |
| `DRIVE_PROSPECT_FOLDER_IDS` | 상담자 개별 폴더 승인 시 | 미설정이면 수급자 folder 설정으로 대체 |
| `DRIVE_OFFICIAL_TEMPLATE_FOLDER_ID` | 공문 서식 기능 | 전용 폴더 ID |
| `DRIVE_OFFICIAL_TEMPLATE_FOLDER_IDS` | 선택 | 추가 허용 서식 폴더 |
| `DRIVE_OFFICIAL_TEMPLATE_ROOT_IDS` | 선택 | 허용 서식 상위 폴더 |
| `DRIVE_TEST_FOLDER_ID` | Drive 테스트만 | 작은 비민감 테스트 폴더 권장 |
| `MISO_BACKOFFICE_DB_PATH` | SQLite 로컬 검증만 | 운영 Vercel DB 용도가 아님 |
| `PORT` | 선택, 로컬 API 기본 5174 | Vercel에 직접 설정할 필요 없음 |
| `SUPABASE_JWKS_URL` | 현재 코드 미사용 | 복구 필수 값 아님 |

`VERCEL`은 플랫폼 제공 변수이며 `DRIVE_INCLUDE_SUBFOLDERS`는 코드가 기능별로 지정한다. 둘 다 복구용 키로 만들 필요 없다. 현재 앱은 Supabase secret/service-role key, Google 일반 API key, 별도 JWT Secret, GitHub PAT, Vercel API 토큰을 기본 실행에 요구하지 않는다. 비밀값 및 허용 목록에 `VITE_` 접두사를 붙이지 않는다.

## 5. 보관할 파일·데이터

| 대상 | 보관 위치·방법 |
|---|---|
| Git 소스, `package-lock.json`, `vercel.json`, SQL, `.env.example` | GitHub와 필요시 별도 저장소 백업. 비밀값 제외 |
| 새 `.env.local` 구성 | 개발 PC의 Git 제외 파일. 원본 비밀은 Bitwarden 개별 항목으로 관리하고 구성 스냅샷은 필요시 암호화 보관 |
| 서비스 계정 JSON, SSH 개인키 | Bitwarden 및 필요한 실행 장치에만. JSON은 저장소 밖에 두고 최소 권한 부여 |
| DB 백업·복원 설명 | 별도의 접근 제한·암호화 백업 저장소. Bitwarden에는 위치·복호화키·복구 절차 참조 보관 |
| SQLite DB와 `miso-backoffice.local.json` (사용 시) | 로컬 검증 데이터도 개인정보 여부 확인 후 암호화 보관. Git 제외 |
| Drive 원본 서류·서식과 폴더 구조 | 권한 제한된 Drive 및 독립된 백업. 폴더/파일 ID가 바뀌면 DB 연결 재설정 필요 |
| `handoff/`, `tmp/`, 원본 Excel·가져오기 자료·QA 캡처 | Git에 없거나 임시 파일이어도 유일한 자료인지 확인 후 필요한 것만 암호화 보관. 개인정보 가능 |
| 계정 소유권·프로젝트 ID·OAuth URL·DNS·환경 설정 기록 | 비밀 없는 부분은 운영 문서, 비밀/접근 목록은 Bitwarden |

`node_modules/`와 `dist/`는 소스·잠금 파일로 재생성하므로 핵심 복구 원본이 아니다. DB 대용량 파일과 개인정보 서류 전체를 비밀번호 금고에 모으기보다 별도의 암호화 백업 저장소를 사용한다.

## 6. 운영 재개 완료 기준

- [ ] `/api/auth/config`가 200이고 URL·publishable key만 반환한다. 비밀값·허용 이메일은 없어야 한다.
- [ ] 비로그인 `/api/auth/me`, `/api/health`, `/api/recipients`, `/api/employment-contracts`, `/api/drive/test-files` 및 중첩 서류 API가 인증 거부된다. Vercel 일반 404로 실패하는 것과 구분한다.
- [ ] 허용 Google 계정 로그인 성공, 미허용 계정 업무 API 접근 거부, 로그아웃·다른 탭 로그아웃 반영을 확인한다.
- [ ] 기존 수급자·직원·계약·업무 데이터가 보존됐으며 최소한의 테스트 레코드 작성·수정·재조회가 된다.
- [ ] 수급자·상담자 문서와 공문 서식 읽기, 승인 범위 밖 폴더 거부를 확인한다.
- [ ] 서버 로그에 키·토큰·개인정보가 출력되지 않으며 `/.env.local`, 키 JSON, DB 파일, 서버 소스가 정적 파일로 공개되지 않는다.
- [ ] 백업 주기·보관 위치·복원 담당자, 계정/키 담당자, 장애 시 접근 제한 방법을 기록했다.
- [ ] 배포 URL·배포 커밋·검증일·확인자를 기록했다.

## 공식 참고

- [Supabase API 키 구분](https://supabase.com/docs/guides/getting-started/api-keys): publishable과 secret key의 역할을 구분한다.
- [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-sign-in/auth-google): Google OAuth와 Supabase provider 설정.
- [Vercel 환경 변수 관리](https://vercel.com/docs/environment-variables/managing-environment-variables): 변경 적용에는 새 배포가 필요하다.
- [Vercel Sensitive 환경 변수](https://vercel.com/docs/environment-variables/sensitive-environment-variables): 비밀 환경 변수 보관 옵션.
- [Google 서비스 계정 키 생성·삭제](https://docs.cloud.google.com/iam/docs/keys-create-delete): 키 및 기존 단기 자격증명의 폐기를 구분한다.
- [Google Cloud 자격증명 침해 대응](https://docs.cloud.google.com/docs/security/compromised-credentials): 의심 접근과 자격증명 대응 절차.
