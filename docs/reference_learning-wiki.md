# Learning Wiki 레퍼런스 개발 세팅 기술 명세

작성일: 2026-06-24

## 목적

이 문서는 현재 `learning-wiki` 프로젝트를 레퍼런스로 사용해 유사한 로컬 웹 애플리케이션을 개발할 때 필요한 기술 세팅과 구조를 정리한다.

이 프로젝트는 개인 학습 기록을 날짜별로 작성하고, 공부 대상과 태그, 검색을 통해 다시 찾는 로컬 우선 웹 앱이다. MVP 단계에서는 배포형 서비스보다 빠른 검증과 개인 실사용을 우선한다.

## 전체 구조

프로젝트는 프론트엔드 개발 서버와 로컬 API 서버를 분리해서 실행한다.

```text
Browser
  -> Vite dev server: http://127.0.0.1:5173
  -> /api proxy
  -> Node API server: http://127.0.0.1:5174
  -> SQLite file
```

역할 분리는 다음과 같다.

| 영역 | 기술 | 역할 |
|---|---|---|
| 프론트엔드 | React, TypeScript, Vite | 화면, 사용자 입력, 검색/필터 UI, 마크다운 미리보기 |
| API 서버 | Node.js `http`, `node:sqlite` | REST API, SQLite 초기화, 데이터 CRUD |
| 데이터베이스 | SQLite | 공부 대상과 일일 기록 저장 |
| 마크다운 렌더링 | `marked`, `dompurify` | 마크다운 HTML 변환 및 정화 |
| 아이콘 | `lucide-react` | 버튼과 상태 표현용 아이콘 |

## 실행 환경

### 권장 런타임

`server/api.mjs`가 Node 내장 모듈인 `node:sqlite`의 `DatabaseSync`를 사용하므로, Node.js 24 계열 이상을 기준으로 둔다.

확인 명령:

```bash
node --version
npm --version
```

### 의존성 설치

프로젝트 루트에서 다음 명령을 실행한다.

```bash
npm ci
```

`package-lock.json`을 기준으로 동일한 의존성 버전을 설치하기 위해 `npm install`보다 `npm ci`를 기본 명령으로 사용한다.

## 로컬 실행 방식

API 서버와 Vite 개발 서버를 각각 실행한다.

터미널 1:

```bash
npm run api
```

터미널 2:

```bash
npm run dev
```

기본 포트는 다음과 같다.

| 서버 | 명령 | 기본 주소 |
|---|---|---|
| API 서버 | `npm run api` | `http://127.0.0.1:5174` |
| Vite 개발 서버 | `npm run dev` | `http://127.0.0.1:5173` |

프론트엔드는 `/api`로 요청하고, Vite가 이 요청을 API 서버로 프록시한다.

```ts
server: {
  proxy: {
    "/api": "http://127.0.0.1:5174",
  },
}
```

## 프로젝트 파일 역할

```text
.
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── server/
│   └── api.mjs
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── markdown.ts
│   ├── storage.ts
│   ├── styles.css
│   └── types.ts
└── docs/
```

주요 파일 책임은 다음과 같다.

| 파일 | 책임 |
|---|---|
| `server/api.mjs` | API 서버 생성, DB 경로 결정, SQLite 테이블 생성, CRUD 라우트 처리 |
| `src/storage.ts` | 프론트엔드에서 사용하는 API 클라이언트 함수 |
| `src/types.ts` | 공부 대상과 학습 기록의 TypeScript 타입 |
| `src/markdown.ts` | 마크다운 렌더링과 HTML sanitize |
| `src/App.tsx` | 전체 화면 상태, 입력 폼, 검색, 태그 필터, CRUD 흐름 |
| `vite.config.ts` | React 플러그인과 `/api` 프록시 설정 |

## 데이터베이스 설정

기본 데이터베이스 파일은 프로젝트 루트 기준 아래 경로에 생성된다.

```text
data/learning-wiki.sqlite
```

`data/` 디렉터리는 로컬 런타임 데이터이므로 Git에 커밋하지 않는다.

`.gitignore`에는 다음 항목이 포함되어 있다.

```text
data/
learning-wiki.local.json
```

## DB 경로 결정 우선순위

API 서버는 다음 순서로 SQLite 파일 경로를 결정한다.

1. 환경 변수 `LEARNING_WIKI_DB_PATH`
2. 프로젝트 루트의 `learning-wiki.local.json`
3. 기본값 `data/learning-wiki.sqlite`

개인 환경별 DB 경로를 고정하려면 프로젝트 루트에 `learning-wiki.local.json`을 만든다.

Mac 예시:

```json
{
  "dbPath": "/Users/you/Library/CloudStorage/Dropbox/learning-wiki/learning-wiki.sqlite"
}
```

Windows 예시:

```json
{
  "dbPath": "C:\\Users\\you\\Dropbox\\learning-wiki\\learning-wiki.sqlite"
}
```

환경 변수로 임시 DB를 지정할 수도 있다.

```bash
LEARNING_WIKI_DB_PATH=/tmp/learning-wiki.sqlite npm run api
```

## SQLite 스키마

API 서버 시작 시 필요한 테이블과 인덱스를 자동 생성한다.

### `study_targets`

공부 대상 정보를 저장한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | 클라이언트에서 생성한 UUID |
| `title` | `TEXT NOT NULL` | 공부 대상 이름 |
| `type` | `TEXT NOT NULL` | `book`, `course`, `certificate`, `project`, `etc` |
| `description` | `TEXT NOT NULL DEFAULT ''` | 설명 |
| `status` | `TEXT NOT NULL` | `active`, `paused`, `completed`, `archived` |
| `created_at` | `TEXT NOT NULL` | ISO 문자열 |
| `updated_at` | `TEXT NOT NULL` | ISO 문자열 |

### `daily_entries`

날짜별 학습 기록을 저장한다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | 클라이언트에서 생성한 UUID |
| `study_target_id` | `TEXT NOT NULL` | `study_targets.id` 참조 |
| `study_date` | `TEXT NOT NULL` | `YYYY-MM-DD` 형식의 학습 날짜 |
| `title` | `TEXT NOT NULL` | 기록 제목 |
| `body_markdown` | `TEXT NOT NULL` | 마크다운 본문 |
| `tags` | `TEXT NOT NULL DEFAULT '[]'` | JSON 문자열로 저장한 태그 배열 |
| `created_at` | `TEXT NOT NULL` | ISO 문자열 |
| `updated_at` | `TEXT NOT NULL` | ISO 문자열 |

인덱스:

```sql
CREATE INDEX IF NOT EXISTS idx_daily_entries_target_date
  ON daily_entries(study_target_id, study_date DESC);
```

## API 명세

API 응답은 JSON을 사용한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/targets` | 공부 대상 목록 조회 |
| `POST` | `/api/targets` | 공부 대상 생성 |
| `PUT` | `/api/targets/:id` | 공부 대상 수정 |
| `DELETE` | `/api/targets/:id` | 공부 대상 삭제 |
| `GET` | `/api/entries` | 학습 기록 목록 조회 |
| `POST` | `/api/entries` | 학습 기록 생성 |
| `PUT` | `/api/entries/:id` | 학습 기록 수정 |
| `DELETE` | `/api/entries/:id` | 학습 기록 삭제 |

현재 API는 단일 사용자 로컬 사용을 전제로 하므로 인증, 권한, 사용자별 데이터 분리는 포함하지 않는다.

## 프론트엔드 데이터 흐름

프론트엔드는 `src/storage.ts`의 함수만 통해 API와 통신한다.

```ts
loadTargets()
createTarget(target)
updateTarget(target)
deleteTarget(targetId)
loadEntries()
createEntry(entry)
updateEntry(entry)
deleteEntry(entryId)
```

`src/App.tsx`는 앱 시작 시 `loadTargets()`와 `loadEntries()`를 함께 호출한 뒤, 클라이언트 상태에서 다음 값을 계산한다.

- 선택된 공부 대상
- 공부 대상별 기록 목록
- 태그 목록
- 검색 결과
- 최근 기록
- 샘플 데이터 생성 여부

검색과 태그 필터는 현재 프론트엔드 메모리에서 처리한다. 데이터가 커지면 API 검색 또는 SQLite FTS 도입을 검토한다.

## 마크다운 처리

학습 기록 본문은 마크다운 문자열로 저장한다.

렌더링 시에는 다음 순서로 처리한다.

1. `marked`로 마크다운을 HTML로 변환
2. `DOMPurify`로 HTML을 sanitize
3. React에서 `dangerouslySetInnerHTML`로 표시

설정:

```ts
marked.use({
  gfm: true,
  breaks: true,
});
```

## 로컬 데이터 동기화 정책

여러 기기에서 같은 데이터를 쓰려면 각 기기의 `learning-wiki.local.json`이 클라우드 동기화 폴더의 같은 SQLite 파일을 바라보게 한다.

이 방식은 간단하지만 서버형 동기화가 아니다. 동시에 두 기기에서 API 서버를 실행해 같은 SQLite 파일을 수정하는 용도로 사용하지 않는다.

권장 사용 순서:

1. 한 기기에서 앱 사용을 마친다.
2. API 서버와 개발 서버를 종료한다.
3. Dropbox, OneDrive, iCloud Drive 등의 동기화 완료를 확인한다.
4. 다른 기기에서 API 서버와 개발 서버를 실행한다.

## 레퍼런스 프로젝트로 재사용할 때의 기준

이 구조는 다음 조건의 프로젝트에 적합하다.

- 개인용 또는 단일 사용자 도구
- 빠른 MVP 검증이 중요한 앱
- 로컬 파일 기반 데이터 저장이 허용되는 앱
- 배포보다 개발 속도와 데이터 소유권이 중요한 앱
- CRUD 중심의 작은 지식 관리 도구

다음 조건에서는 구조 변경이 필요하다.

- 여러 사용자가 동시에 접속해야 한다.
- 웹에 상시 배포해야 한다.
- 모바일과 웹에서 실시간 동기화가 필요하다.
- 사용자 인증과 권한 분리가 필요하다.
- 데이터 충돌 없이 다중 기기 동시 편집을 지원해야 한다.

## 새 프로젝트에 적용하는 절차

1. Vite React TypeScript 프로젝트를 만든다.
2. `server/api.mjs`처럼 로컬 API 서버를 둔다.
3. API 서버는 `node:sqlite`로 SQLite 파일을 열고 시작 시 테이블을 생성한다.
4. `vite.config.ts`에서 `/api` 요청을 로컬 API 서버로 프록시한다.
5. 프론트엔드에는 `storage.ts` 같은 API 클라이언트 레이어를 둔다.
6. 도메인 타입은 `types.ts`에 모아 프론트와 API 계약을 문서화한다.
7. DB 파일과 개인 설정 파일은 `.gitignore`에 추가한다.
8. README에는 `npm ci`, `npm run api`, `npm run dev` 순서를 명시한다.

## 현재 MVP의 의도적 한계

현재 구조는 작고 명확한 MVP를 위해 다음을 의도적으로 제외한다.

- 로그인 / 회원가입
- 배포 서버
- 클라우드 데이터베이스
- 사용자별 데이터 분리
- API 테스트 자동화
- 마이그레이션 도구
- 동시 편집 충돌 해결
- 파일 첨부

이 한계는 결함이라기보다 MVP 단계의 범위 설정이다. 제품 사용 습관과 데이터 모델이 안정된 뒤, 필요에 따라 클라우드 DB, 인증, 배포 구조로 확장한다.

## 확장 후보

다음 버전에서 우선 검토할 수 있는 개선은 다음과 같다.

- `npm run api`와 `npm run dev`를 함께 실행하는 스크립트 추가
- 현재 사용 중인 DB 경로를 앱 화면에 표시
- DB 백업 내보내기
- DB 가져오기
- SQLite 마이그레이션 관리
- API 요청/응답 검증
- 기본 테스트 추가
- 배포형 전환 시 Postgres 계열 DB와 인증 도입

## 한 줄 요약

이 프로젝트는 React/Vite 프론트엔드와 Node 로컬 API 서버, SQLite 파일 저장소를 분리한 로컬 우선 MVP 구조이며, 개인용 학습 기록 앱이나 작은 지식 관리 도구를 빠르게 개발할 때 재사용하기 좋은 레퍼런스다.

## Miso Backoffice 적용 결정

2026-06-24 기준으로 Miso Backoffice MVP는 이 레퍼런스의 실행 구조를 적용한다.

적용 범위:

- Next.js 대신 React, TypeScript, Vite 사용
- 별도 Node 로컬 API 서버 사용
- MVP 데이터 저장소로 SQLite 사용
- 프론트엔드 데이터 접근을 `src/storage.ts`로 분리
- 로컬 설정 파일과 환경 변수로 DB 경로 선택

Miso Backoffice 전용 차이:

- DB 환경 변수는 `MISO_BACKOFFICE_DB_PATH`를 사용한다.
- 기본 DB 경로는 `data/miso-backoffice.sqlite`다.
- 수급자 개인정보가 포함될 수 있으므로 클라우드 동기화 폴더의 SQLite 파일을 여러 기기에서 공유하는 방식을 권장하지 않는다.
- 주민등록번호 전체 값은 현재 MVP 스키마에 포함하지 않는다.
- 다중 사용자 운영이 필요해지는 시점에는 인증과 서버형 데이터베이스로 전환한다.
