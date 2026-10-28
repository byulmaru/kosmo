# PROD-1222 로그인 Web 추가 검증 — 2026-10-28

## 범위와 조건

최초 검증은 제품 revision `cfcb3275400a6a26851dec98369861fcbed2a5f7`을 새 production export로 실행했다. 아래 접근성 이름 후속 수정은 별도 기록이다. 이 보고서는 기능·접근성 QA이며 성능 A/B 재측정이 아니다. 최초 검증 단계에서는 제품 코드를 추가 변경하지 않았다.

- macOS, Playwright 1.60.0 번들 Chromium 148.0.7778.96. 내장 Browser 수동 검증은 별도로 수행했다.
- 실제 로컬 BFF/API와 실행별 격리 `kosmo_test_*` DB. 기존 fixture로 생성한 인증 세션을 사용했다. 내장 Browser는 로컬 OIDC mock의 로그인 링크를 통해 로그인했다. 운영 계정·데이터는 사용하지 않았다.
- Home: 본인·팔로우한 작성자의 게시글 필터링과 41개 게시글 fixture. Following: 프로필의 41개 팔로잉 관계. 현재 타임라인 탭은 Home/Local이며 Following을 별도 게시글 탭으로 가정하지 않았다.
- 미디어: 본문 길이가 다른 8행, 1200×300 가로·300×1200 세로 SVG를 지연 응답. 1280×900에서 390×844로 전환했다. Following은 1280×500, 기존 탭 테스트는 390·1440px에서 실행했다.
- HTML이 참조한 production entry: `index-36daadc8911b1dc5f6b6a5ee7e0dd231.js`, SHA-256 `59edb2426b178d383b815f6f683924d23fb947c5546d523a82e2f45b826b059a`.

## 동작 검증

- Home은 본인·팔로우한 프로필 글만 최신순으로 표시했다. 20행에서 상세 진입 중 새로운 pagination 요청이 없고, history back에서 목록과 offset을 보존했다. 복귀 후 끝 스크롤로 40행을 표시했다.
- Home 재선택으로 서버에 새로 만든 글이 반영됐다. 재조회 실패 시 기존 목록과 오류 Toast를 유지하고, `다시 시도` 성공으로 새 글을 표시하며 Toast를 정리했다. document reload 후에도 새 글과 Home 선택 상태를 유지했다. Local 재선택도 서버의 새 글을 반영했다.
- 기존 Home 테스트에서 in-flight 중복 요청 방지·settle 뒤 재실행, 오류 중 목록 보존을 확인했다. 기존 Local 테스트에서 재조회 실패 중 열린 답글 작성창·본문·focus를 유지했다.
- Following은 20행에서 첫 프로필 링크를 Enter로 열었으며 숨겨진 동안 추가 조회가 없었다. 복귀 후 휠 스크롤로 40행을 표시하고 새로고침에서도 같은 Following route를 유지했다.
- 지연 이미지 로드 전후 실제 행 높이 변화와 모바일 폭 전환을 확인했다. 최초 진단에서 가로 이미지 행 높이는 739→346.75px였다. 이미지가 있는 목록의 상세 왕복에서도 실제 pointerdown 시점의 offset으로 복원했다.
- 기존 Home/Local 상단 현재 탭 재선택은 390·1440px에서 pointer·Enter·Space 입력으로 최상단에 이동하고, 추가 조회 없이 선택 상태·focus를 유지했다.

최종 유효 결과는 기존·Home 시나리오 **9개 통과**(`final.log`)와 계측 보정 후 Following·이미지 **2개 통과**(`verified.log`)다. 11개가 한 실행에서 모두 통과했다고 표현하지 않는다. 최신 production export, QA spec/config의 TypeScript·ESLint·Prettier 검사를 통과했다.

## 접근성 관찰

- 미디어 버튼은 alt text 기반 이름으로 키보드 접근·Enter 활성화가 가능했다. Viewer의 dialog·aria-modal, Tab 이후 내부 focus, Escape dismiss와 원래 버튼 focus 복귀를 검증했다.
- 내장 Browser에서도 QA 로그인 Home, 미디어 키보드 open/dismiss/focus 복귀, 프로필의 Following 링크를 Enter로 실행하는 흐름을 관찰했다. 선택된 타임라인/관계 탭, FollowButton의 pressed 상태, 주요 메뉴·heading·미디어 이름이 접근성 트리에 노출됐다.
- 설치된 axe-core 4.11.4의 `wcag2a`, `wcag2aa`, `wcag21aa` 태그로 실제 페이지를 검사했다. Storybook의 color-contrast 제외 설정을 사용하지 않았다. 전체 WCAG 2.2 평가가 아니다.
- Following 화면에서 지원 표기 문구의 대비가 `#A5A5AF`/`#FFFFFF`, **2.44:1**로 검출됐다. [지원 표기 계약](../design/support-acknowledgement.md)의 명시적 승인 예외와 일치한다. 이 PR에서 해당 component와 token은 바뀌지 않았다. AA 대비를 충족하는 것으로 보고하지 않는다.
- 모바일 Home은 axe 위반 0건, 대비 수동 검토 3곳이다. Following은 위 지원 표기 대비 위반 1건, 대비 수동 검토 2곳 및 ARIA 수동 검토 4곳이다.
- ARIA 수동 검토는 `활성 프로필`, `활성 프로필 핸들`, `게시글 작성`, `글쓰기` 이름이 role 없는 일반 div에 적용된 경우다. axe는 해당 이름의 보조 기술 지원이 불확실하다고 보고했다. `incomplete`는 통과로 세지 않으며 실제 screen reader 검증이 남는다. 짧은 문구·겹치는 배경의 대비도 자동 판정의 한계로 원본에 남겼다.

## 계측 보정과 검증 경계

예비 실패에는 테스트의 잘못된 Following 링크 이름, 브라우저 evaluate 인자 누락, 너무 이른 반응형 높이 읽기가 포함됐다. 또한 짧은 Following 목록은 viewport에 따라 초기 자동 조회로 40행까지 채워질 수 있다. 초기 20행 조건을 고정하고 첫 링크를 사용해 focus 스크롤에 의한 사전 pagination을 분리했다.

history back 직후의 프로그램 `scrollTo`는 진행 중인 복원과 경쟁했다. 최종 확인은 실제 휠·키보드 입력을 사용한다. 기존 복원 코드는 wheel·keydown·pointerdown에서 복원을 중단한다. 이미지 상세 진입의 기대 offset은 클릭 자동 스크롤 전의 값이 아니라 실제 pointerdown에서 기록했다. 이런 예비 실패를 제품 결함 또는 성공으로 집계하지 않았다.

이 검증은 선택된 fixture의 동작 보존 증거다. 로그인 경로의 20/100/200행 성능·메모리 개선, 모든 이미지/본문 분포, 다른 브라우저·저성능 장치로 일반화하지 않는다. VoiceOver/NVDA 실제 낭독, live announcement, 전체 zoom·reflow·WCAG 적합성, iOS·Android runtime은 미검증이다.

## 재현 자료

로컬 비추적 `test-results/prod-1222/web-followup/`에 임시 spec/config/run script, 단계별 실행 로그, axe·접근성 트리 원본, 이미지 geometry·클릭 offset, 내장 Browser 화면을 보관한다. 새 테스트 인프라나 dependency를 추가하지 않았으며 임시 QA spec/config는 PR에 포함하지 않는다.

기존 격리 DB wrapper로 실행하며 macOS에서는 sandbox 밖에서 버전이 일치하는 bundled Chromium을 사용한다. 다른 작업의 서버·DB를 재사용하거나 초기화하지 않는다.

## 접근성 이름 후속 수정 — 2026-10-28

위 네 ARIA 항목을 검토한 결과, 이름을 지원하지 않는 일반 Web 컨테이너에 label이 적용되어 있었다.

- 활성 프로필 컨테이너에 Web `group` 역할을 부여했다. 자식 링크와 버튼은 독립적으로 유지한다.
- 활성 프로필 핸들의 Web label을 제거해 실제 `@handle` 텍스트가 노출되게 했다.
- 공용 Web Form의 이름을 wrapper에서 실제 `<form aria-label>`로 옮겼다.
- Composer의 일반 Web wrapper에 중복으로 붙은 이름을 제거했다. 실제 Form·dialog가 이름을 소유하며 Native label은 유지한다.
- 관련 Storybook·E2E 선택자는 역할과 실제 핸들 텍스트를 사용한다. 승인된 낮은 대비 예외와 색상 token은 변경하지 않았다.

수정한 production export와 동일한 격리 DB·번들 Chromium 조건에서 Following 및 지연 이미지·미디어 시나리오 **2개 통과**. 실제 페이지에서 `활성 프로필` group과 `게시글 작성` form을 접근 가능한 이름으로 찾을 수 있고, 잘못된 일반 div label은 사라졌음을 확인했다. axe의 ARIA 수동 검토 항목은 **4→0곳**이다. Following에는 승인된 대비 위반 1건과 대비 수동 검토 2곳, 모바일에는 위반 0건과 대비 수동 검토 3곳이 남는다.

Shell·Composer Storybook **109개**, Web Form의 이름 전달·IME 및 제출 단축키 단위 테스트 **1개**, 앱 TypeScript·변경 파일 ESLint·Prettier·production Web build를 통과했다. 원본은 로컬 비추적 `test-results/prod-1222/aria-followup/`에 보관한다. 실제 VoiceOver/NVDA 낭독과 Native runtime은 실행하지 않았으며 자동 검사 통과를 이를 대신하는 증거로 사용하지 않는다.

## 중복 Form 이름 회귀 수정 — 2026-10-28

CI의 `Composer Clipboard Failure And Scope Interaction`은 서로 다른 프로필의 작성 폼 두 개를 동시에 렌더한다. 이름을 실제 form으로 옮긴 뒤 두 landmark의 이름이 모두 `게시글 작성`이 되어 axe `landmark-unique` 검사가 실패했고, 동일 head에서 로컬 재현했다.

Web form 이름에 현재 작성 프로필의 핸들을 포함해 구분한다. Native 이름은 유지한다. 서로 다른 ID에 같은 핸들을 사용하던 alternate fixture를 실제 서로 다른 프로필 조건에 맞추고, 기존 붙여넣기·업로드 재시도·입력 범위 검증이 각 form의 접근 가능한 이름으로 대상을 찾게 했다. 새 prop이나 의존성은 추가하지 않았다.

Posts 전체·Composer tests·Composer ProfileSwitcher Storybook **165개 통과**. 최종 선택자로 실패 테스트 단독 재실행, 앱 TypeScript와 변경 파일 ESLint·Prettier도 통과했다. 앞선 Web runtime 결과의 `게시글 작성` form 이름은 이 변경 이후 `게시글 작성 (@handle)`이 된다. 이 후속 수정에서는 production Web QA와 실제 스크린리더·Native runtime을 재실행하지 않았다.

이전 head의 Web E2E shard 2는 테스트 시작 전 `config.webServer` 준비가 120초를 초과해 실패했다. 로그만으로 어느 서버가 지연됐는지는 확정할 수 없으며 폼 이름 회귀와 구분한다.

후속 CI에서 기존 이름과 정확히 일치하도록 찾던 E2E 선택자 누락도 확인했다. 게시·온보딩·프로필 전환·인증의 기존 helper를 새 form role/name에 맞췄다. 최신 production build와 격리 DB에서 관련 E2E는 **29개 통과, 1개 실패**했고, 실패한 프로필 viewerState 테스트는 코드 변경 없이 격리 재실행에서 **1개 통과**했다. 최초 실패 화면에는 새 프로필 delta 확인 뒤 route 이동 시 gamma가 활성 프로필로 표시되어 있었다. 전환 시점의 일시적 문제 가능성은 남으며 전체 30개가 한 실행에서 통과한 것으로 표현하지 않는다. Web TypeScript·변경 파일 ESLint·Prettier도 통과했다. 로컬 원본은 `test-results/prod-1222/unique-form-e2e/`에 보관한다.
