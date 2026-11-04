# 기관 연락처·공문 서식

왼쪽 **기관 운영 서류 업무 → 기관 연락처·공문 서식**을 열고 ‘기관 연락처’와 ‘공문 서식’을 전환한다. 기존 보라색 공통 내비게이션과 처리 중 표시를 적용한다.

## 기관 연락처

기관명, 부서·담당 창구, 전화번호, 팩스번호, 메모를 저장한다. 전화·팩스는 숫자를 입력하면 하이픈을 자동 표시한다. 기관명·부서·번호·메모로 검색할 수 있으며 전화번호는 눌러 전화할 수 있다. 보관한 연락처는 보관함에서 복원한다. 등록 요청 ID로 재시도 중복을 막고 버전 검사로 다른 사용자의 수정 덮어쓰기를 막는다. 충돌 시 입력은 유지되며 최신 목록을 다시 불러올 수 있다.

## 공문 서식

1. 구글드라이브의 서식 전용 폴더를 같은 Drive 읽기 서비스 계정에 공유한다.
2. 서버의 `DRIVE_OFFICIAL_TEMPLATE_FOLDER_ID`에 해당 폴더 ID를 설정한다. 여러 폴더를 승인하려면 `DRIVE_OFFICIAL_TEMPLATE_FOLDER_IDS`, 상위 폴더와 그 하위 범위를 승인하려면 `DRIVE_OFFICIAL_TEMPLATE_ROOT_IDS`를 쉼표 구분으로 설정한다. 수급자·잠재고객 서류의 승인 범위를 자동으로 재사용하지 않는다.
3. 화면에 폴더 링크를 넣고 ‘폴더 연결 저장’을 누른다. 설정은 센터 공용으로 저장된다. 기본 환경 변수 폴더가 있으면 설정 저장 전에도 조회할 수 있다.
4. 파일명으로 검색하고, ‘드라이브에서 보기’ 또는 ‘다운로드’를 누른다. PDF·한글·Word·Excel·PowerPoint·이미지 서식을 지원한다. Google Docs 자체 형식의 내보내기는 지원하지 않는다.

파일 목록은 승인된 폴더 내부를 조회한다. 다운로드는 로그인 헤더를 포함해 서버를 거치며 매 요청마다 파일 종류·부모 폴더·삭제 여부·20MB 크기 제한을 확인한다. 폴더 밖 파일·바로가기·미지원 파일은 내려주지 않는다. 실제 바이트는 `attachment`와 한글 파일명으로 반환하며 임시 Blob URL은 사용 후 해제한다. 파일을 서버 DB에 복제하거나 Drive 원본을 수정하지 않는다.

폴더 연결에 실패하면 서버 설정·인증·공유 권한 오류를 안내하고 입력을 유지한다. 서식 폴더 조회 오류를 빈 목록으로 대체하지 않는다. 입력 중 다른 화면으로 이동하면 확인하며 저장·다운로드 중에는 이동을 막는다.

## API와 데이터

- `GET/POST /api/work/institution/contacts`
- `PUT /api/work/institution/contacts/:id`
- `GET/PUT /api/work/institution/template-settings`
- `GET /api/work/institution/templates`
- `GET /api/work/institution/templates/:fileId/download`

기존 업무 로그인·허용 계정 검사를 공통으로 거친다. 새 테이블은 `work_institution_contacts`, `work_institution_template_settings`이다. SQLite는 시작 시 `server/institution-schema.sql`, PostgreSQL은 기존 `server/postgres/schema.sql` 부트스트랩으로 적용한다. API 재시작/최신 서버 배포가 필요하다. PostgreSQL은 RLS를 켜고 anon/authenticated 직접 테이블 접근을 차단한다.

## 검증

- `tests/institution-resources.test.mjs`: 두 DB 어댑터의 저장·재시도·보관·복원·버전 충돌·롤백, 폴더 설정·서식 목록·다운로드, 로그인·권한·외부 파일·크기 제한·한글 파일명.
- `tests/institution-resources-ui.mjs`: 실제 임시 SQLite API로 PC/모바일 연락처 등록·수정·충돌·검색·보관/복원·재시작 보존을 확인한다. Drive 전송은 테스트 응답으로 파일 검색과 실제 브라우저 다운로드를 확인한다.
- 실제 공문 서식 폴더의 연결과 서비스 계정 권한은 폴더를 지정한 뒤 별도로 확인한다.
