## Why

Kosmo Web에는 실제 사용자 여정과 기능 사용을 확인할 제품 분석이 없어 제품 우선순위와 UX 개선을 운영 데이터로 검증할 수 없다. 이미 배포된 self-hosted OpenPanel을 Web 클라이언트에 연결하되, 한국 개인정보 처리방침 기준과 제품 장애 격리를 함께 충족해야 한다.

## What Changes

- Client ID가 제공된 Web 빌드에서 OpenPanel 자동 화면·외부 링크·속성 추적과 10% session replay를 활성화한다.
- 익명 세션을 로그인 Account identity와 연결하고 로그아웃 뒤 identity를 초기화한다.
- Profile 생성·선택, 게시, 팔로우와 검색 흐름의 성공 이벤트를 공통 taxonomy로 수집한다.
- 모든 입력값과 Post Content를 replay에서 마스킹하고 분석 실패를 제품 흐름과 격리한다.
- Kosmo 공개 개인정보 처리방침과 Account별 분석 데이터 삭제 운영 절차를 제공한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain`·`docs/design` 문서 없음. 제품 분석은 durable domain 객체나 UI foundation이 아니며 최신 제품 계약은 Linear가 소유한다.
- Linear Contract: `PROD-469`
- Linear Implementations: `PROD-469`

## Capabilities

### New Capabilities

- `web-product-analytics`: Web 자동 수집, identity, 명시적 성공 이벤트, 검색 계측과 장애 격리
- `web-session-replay`: 10% replay와 입력·Post Content 마스킹
- `kosmo-privacy-notice`: 한국 개인정보 처리방침 작성지침에 맞는 Kosmo 공개 고지와 권리 행사 안내

### Modified Capabilities

없음.

## Impact

- `apps/app`: OpenPanel Web SDK, Session identity, 핵심 mutation 및 검색 계측, 공개 개인정보 처리방침
- `.github/workflows/docker-build.yml`, `Dockerfile`: 공개 OpenPanel Client ID 빌드 주입
- `docs/operations`: OpenPanel 설정·검증·삭제 runbook
- dependency: `@openpanel/web`
