## Why

Kosmo에는 Quote 저장·표시 기반이 있지만, 로컬 작성과 원문 작성자의 동의, 외부 서버에 전달한 뒤의 승인·철회가
하나의 계약으로 연결되어 있지 않다. PROD-902에서 확정한 제품 정책을 OpenSpec으로 남겨 작성과 federation
구현이 같은 Source 노출·본문 보존 규칙을 따르게 한다.

## What Changes

- 기존 `createPost`에 Source 입력을 추가하고 Repost 메뉴에서 공용 Composer로 기본 Quote를 작성한다.
  Reply+Quote 작성 UI·API와 링크의 인용 카드 전환은 제외한다.
- 게시글별 인용 허용 정책 `모두 | 팔로워 | 본인만`을 제공한다. 새 글과 기존 Local Post는 `모두`로 시작하며
  기존 승인에는 소급 적용하지 않는다.
- 타인의 Public·Unlisted Source와 접근 범위를 넓히지 않는 자기 Followers Only 인용을 지원한다.
- 자기 인용을 제외한 원격 타인 원문에는 `interactionPolicy`의 automatic/manual 광고나 부재·해석 실패와
  관계없이 QuoteRequest를 보내고, 유효한 QuoteAuthorization으로 실제 승인을 확인한다.
- 원격 승인 대기 중 자체 Content를 먼저 게시·전달하고, 승인 후 Source 연결·Update, 거절·철회·원문 삭제 후
  본문 유지·Source 비노출을 보장한다. `interactionPolicy`는 작성 UI와 예상 eligibility의 힌트로만 사용한다.
- FEP-044f 요청·승인 결과·명시적 철회와 레거시 상호운용을 연결한다.
- 차단의 당사자 간 접근 제한과 제3자에게도 Source를 숨기는 명시적 승인 철회를 구분한다.
- PROD-902가 계약과 이 OpenSpec을 소유한다. PROD-431은 작성·Composer, PROD-924는 게시글별 정책과
  federation 구현·연합 통합 검증을 맡는다. 전체 선언 task 완료 후 archive는 PROD-924가 수행한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
  `docs/domain/objects/profile.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/design/post-action-bar.md`.
- Linear Contract: [PROD-902](https://linear.app/byulmaru/issue/PROD-902). 2026-09-08 갱신된 본문과 현재 대화의
  정책 선택 및 “902의 스펙을 작성해야지” 지시로 기존 OpenSpec 제외·소유권 이동을 정정했다.
- Linear Implementations: [PROD-431](https://linear.app/byulmaru/issue/PROD-431),
  [PROD-924](https://linear.app/byulmaru/issue/PROD-924).
- 유지되는 인접 계약: [PROD-792](https://linear.app/byulmaru/issue/PROD-792)의 원격 Quote 수신과
  [PROD-793](https://linear.app/byulmaru/issue/PROD-793)의 Source signed fetch. 이 change에서 중복 구현하지 않는다.

## Capabilities

### New Capabilities

- `quote-consent`: 게시글별 정책, 로컬 Quote 작성 허용, 승인과 조회 권한, 차단·철회·삭제의 제품 결과.
- `activitypub-quote-federation`: 로컬 Quote 발신, Kosmo 원문용 승인 발급, 원격 승인 결과, 승인 후 갱신과 철회 연합.

- `post-quote-composer`: 인용 메뉴, direct Source preview, 공용 작성 기능과 actor별 성공·실패 처리.

### Modified Capabilities

- `post`: 기존 작성 입력에 Source를 추가하고 Quote Source 반환에 인용 승인 조건을 적용한다.
- `post-repost-ui`: 인용 항목 보류를 해제하고 기본 Quote 작성 진입을 연결한다.

기존 관계 조합·일반 Create/Delete·원격 수신 계약은 유지한다.

- 2026-09-09 범위 정정: PROD-431 사용자 지시에 따라 Reply+Quote 작성과 링크 인용을 제거했다.
  현재 canonical과 Linear PROD-431·902·924의 정정 내용을 적용하며 이전 승인본을 수정본의 승인으로 간주하지 않는다.

## Impact

Core의 Post 작성·정책·승인 행동, API의 작성 입력과 정책·철회 조작, Composer와 게시된 Source 표시,
Fedify의 Local Note 표현·inbox·dispatcher, effects Workflow와 통합 검증에 영향을 준다.
실제 API 이름·저장 구조는 기존 계약을 확인한 구현 설계에서 선택하며 이 제안이 새 durable 객체를 정의하지 않는다.

Profile 기본값은 PROD-925 Backlog로 제외한다. Kosmo 자체 건별 수동 승인 UI, 인용 알림·목록, 사용자용 본문 수정,
일반 원격 Note 처리와 기존 Repost 재구현은 제외한다. 이 문서 작성은 제품 구현이나 Spec Gate 최종 승인이 아니다.
