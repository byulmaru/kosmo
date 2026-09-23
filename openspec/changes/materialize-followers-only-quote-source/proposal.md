## Why

원격 Quote가 아직 저장되지 않은 Followers Only Source를 참조하면, 조회 자격이 있는 Local Follower가 있어도 기존 Source 관계를 연결할 수 없다. 검증된 작성자 정보를 바탕으로 실제 Follow 권한을 가진 identity로 원문을 가져와 기존 Quote 표시 흐름에 연결한다.

## What Changes

- 인증된 선행 처리에서 검증한 Source URI와 저장된 Remote Actor의 대응이 있을 때만 조회를 시작한다. URI만 있는 Source는 건너뛴다.
- Source 작성자를 팔로우하는 Active Local Profile 중 하나를 결정적으로 선택하고, 그 identity의 Fedify authenticated document loader를 사용한다.
- 네트워크 조회 뒤 Source ID, 작성자, canonical followers audience와 선택한 같은 Profile·Follow를 저장 직전에 재검증한다. 실패한 시도는 Source 관련 상태를 남기지 않는다.
- 검증된 Source를 기존 production helper와 PROD-509의 materializer로 저장하고, PROD-792의 Quote resolution revision 및 `Posts.repostSourceId`에 멱등하게 연결한다.
- Source 카드에는 기존 Quote 승인 상태와 viewer별 조회 정책을 함께 적용한다. Source를 조회할 수 없어도 outer Quote 본문은 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`의 「미저장 Followers Only Quote Source 조회」·「Post Visibility」·「Post Eligibility」·「ActivityPub Local Note 표현」, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0014-post-structure-relations.md`.
- Canonical Design: `docs/design/post-action-bar.md`의 기존 Quote Source 표시·탐색 계약을 소비하며 시각적 계약을 변경하지 않는다.
- Linear Contract: [PROD-793](https://linear.app/byulmaru/issue/PROD-793)의 실행 자격·인증 조회·재검증·Quote 연결 계약과 2026-09-08 Source 작성자 신뢰 경계 결정.
- Linear Implementations: PROD-793이 이 change의 구현·행동 검증·통합 검증·delta spec 동기화와 최종 archive를 소유한다.
- 선행 계약: 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost`와 [PROD-509](https://linear.app/byulmaru/issue/PROD-509)의 materializer, [PROD-792](https://linear.app/byulmaru/issue/PROD-792)의 Quote resolution 및 검증된 Source 작성자 정보 전달 연결. [PROD-360](https://linear.app/byulmaru/issue/PROD-360)의 기존 Followers Only 수신·조회 정책을 보존한다.
- 승인 범위: 2026-09-08 사용자가 검증된 Source URI↔작성자 정보가 있는 경우만 처리하는 권장안을 확정했다. canonical 문서와 PROD-793·792를 먼저 정렬했다. 2026-09-18 사용자는 최신 정정본을 포함한 PROD-793 Spec 전체를 최종 승인했다. 이 승인은 구현 착수나 선행 구현 완료를 의미하지 않는다.

2026-09-18 동기화: PROD-661은 PROD-509에 흡수되어 Canceled이며 선행 의존이 아니다. 의존 순서는 PROD-465 → PROD-509 → PROD-792 → PROD-793이다. PROD-465·509는 main 병합과 Done을 확인했고, PROD-792는 Spec 승인 후 로컬 복구 구현이 있으나 main·PR delivery와 dependency gate가 남아 있다. 이 change의 Spec Gate는 승인됐으며 구현 착수는 별도다.

## Capabilities

### New Capabilities

- `activitypub-followers-quote-source`: 검증된 Source 작성자와 Local Follower를 사용한 미저장 Followers Only Quote Source의 인증 조회, 재검증, materialization과 기존 Quote resolution 연결.

### Modified Capabilities

없음. 기존 inbound Create 수신과 viewer access 요구사항을 재정의하지 않고, 별도 Source 조회 진입점을 추가한다.

## Impact

- `packages/fedify`: Source별 signer 선택과 인증 조회·protocol 검증. 기존 Note projection과 저장 경계를 재사용한다.
- `packages/core`: 기존 Post 저장·transaction·visibility 계약을 소비한다. PROD-509의 Public/Unlisted 신규 조회에 private admission을 일괄 허용하지 않는다.
- `apps/worker`: PROD-792의 revision별 resolution에 이번 조회 경로를 연결하고 기존 retry·stale 정책을 유지한다.
- GraphQL과 기존 Quote UI: 새 타입이나 화면 없이 승인 및 viewer access 결과를 검증한다.
- 선행 상태: 2026-09-18 확인한 `origin/main`은 `c1de28da0d2ce01a36ae4b72e670d6993b9fc0c8`다. PROD-465 PR #820과 PROD-509 PR #826은 main에 병합됐고 두 이슈는 Done이다. PROD-792는 Spec 승인 상태지만 main 반영·commit·push·PR이 없고, 2026-09-17 복구 worktree의 구현은 delivery gate를 통과하지 않았다. Fedify `2.4.0-dev.1922`는 개발 검증용 exact pin이며 stable 채택, package closure·API/vocabulary diff·전체 검증과 clean frozen install이 남아 있다. 전달 가능한 PROD-792 구현과 검증된 작성자 입력의 production 공급 경로를 확인한 뒤 구현한다.
- 제외 범위: URI만으로 작성자 탐색, Public/Unlisted Source 조회, 이미 저장된 Followers Only Source 연결, Direct, 일반 signed-fetch API, 임의 backfill, 로컬 Quote 작성·발신, Quote 승인·철회 정책 자체의 변경.
- PROD-793 담당자가 이 change 전체의 통합 검증과 archive를 소유한다. Spec 단계에는 구현, 런타임 검증, archive를 수행하지 않는다.
