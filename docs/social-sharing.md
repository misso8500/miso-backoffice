# 카카오톡 링크 공유 메타데이터

서비스 주소: https://miso-backoffice.vercel.app/

## 구성

- 제목: 미소 백오피스
- 설명: 센터의 업무와 기록을 한곳에서 관리하는 업무 공간
- OG 이미지: `public/og/miso-backoffice-v1.png` (1200×630 PNG)
- 파비콘: `public/favicon.svg`
- 설정: 루트 `index.html`의 description, canonical, Open Graph 및 Twitter Card 태그

로그인·JavaScript 실행 없이 초기 HTML에서 공유 메타정보를 읽을 수 있다. 공유 이미지는 실데이터가 없는 소개용 그래픽이며 인증된 업무 데이터와 분리된 정적 파일이다. 업무 API의 인증은 변경하지 않았다.

## 배포 후 확인

1. 변경분을 기존 Vercel 서비스에 배포한다. 로컬 파일 수정만으로 운영 미리보기가 바뀌지는 않는다.
2. 로그인하지 않은 상태에서 루트 URL의 HTML 소스에 메타태그가 있는지 확인한다.
3. https://miso-backoffice.vercel.app/og/miso-backoffice-v1.png 가 로그인 없이 PNG로 열리는지 확인한다.
4. [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)에 서비스 URL을 넣어 확인한다. 기존 미리보기가 남으면 공유 캐시를 초기화하고 다시 확인한다.
5. 카카오톡에 서비스 URL을 붙여넣고 제목·설명·이미지를 실제 확인한다. 클라이언트별 이미지 잘림과 표시 방식도 확인한다.

카카오의 [공식 도구 안내](https://developers.kakao.com/docs/ko/tool/common)는 공유 URL의 OG 정보 확인과 공유 초기화를 설명한다. [공식 메시지 템플릿 안내](https://developers.kakao.com/docs/ko/message-template/common)에도 OG 태그를 통한 스크랩 구성이 설명되어 있다. 일반 링크 미리보기를 위해 앱에 카카오 공유 SDK를 추가하지 않았다.

## 이미지 수정

`scripts/generate-og-image.py`가 텍스트·도형으로 이미지를 생성한다. macOS에서 Pillow가 설치되어 있으면 다음 명령으로 재생성한다.

```sh
python3 scripts/generate-og-image.py
```

다른 OS에서는 `--font`에 한글을 지원하는 폰트, `--latin-font`에 영문 폰트 파일을 지정한다. 기본 macOS 폰트 파일 자체는 저장소에 포함하지 않는다. 생성된 PNG를 커밋하므로 Node/Vercel 빌드에는 Python·Pillow·폰트 설치가 필요 없다.

이미지를 바꾸면 파일명을 `miso-backoffice-v2.png`처럼 올리고 `index.html`의 OG/Twitter URL을 함께 바꾼다. 도메인이 바뀔 때는 canonical·og:url·이미지 절대 URL도 함께 수정한다.

이번 작업은 이미지 생성·메타태그 적용과 로컬 빌드 검증까지 수행한다. 운영 배포 및 실제 카카오톡 미리보기 검증은 별도다.
