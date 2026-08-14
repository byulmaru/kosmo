## Why

Kosmo Web의 OpenPanel 기반은 Profile·Post·Follow·검색 행동만 수집하므로 재게시·반응·북마크의 Account 단위 adoption, 반복 사용과 retention을 분석할 수 없다. PROD-539가 기존 opaque Account identity를 유지하면서 성공한 Post 상호작용만 최소 속성으로 계측하도록 계약을 닫는다.

## What Changes

- 재게시 생성·취소를 `repost_succeeded`와 allowlist `result`로 수집한다.
- 반응 추가·삭제를 `reaction_added`, `reaction_removed`와 `reaction_type: "default" | "custom"`으로 수집한다.
- 북마크 추가·삭제를 `bookmark_added`, `bookmark_removed`로 수집한다.
- 모든 이벤트를 PROD-469의 opaque Account identity에 연결하되 Account ID를 event property로 중복 전송하지 않는다.
- 대상 Post·Profile ID, 선택 Profile ID, Post 콘텐츠, custom emoji 식별 정보, 구체 Reaction 값과 오류 원문을 이벤트 속성에서 제외한다.
- 실제 서버 확정 mutation 성공 뒤에만 이벤트를 정확히 한 번 발생시키고, 분석 실패를 기존 제품 흐름과 격리한다.
- OpenPanel 운영 문서와 acceptance를 새 이벤트에 맞추고, 신뢰할 수 있는 Account 가입 이벤트가 없어 가입→최초 반응 funnel을 계산할 수 없는 현재 계측 gap을 기록한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/design/post-action-bar.md`, `docs/design/reactions.md`
- Operational Baseline: `docs/operations/openpanel.md`
- Linear Contract: `PROD-539` (supporting identity·집계 경계: `PROD-469`, `PROD-520`)
- Linear Implementations: `PROD-539`

## Capabilities

### New Capabilities

- `post-interaction-analytics`: Web 재게시·반응·북마크 성공 행동의 Account 연계 event taxonomy, 개인정보 경계와 장애 격리

### Modified Capabilities

없음.

## Impact

- `apps/app`: 기존 analytics 경계와 Post Action Bar의 재게시·반응·북마크 mutation 성공 callback 및 관련 test
- `docs/operations/openpanel.md`: 명시적 이벤트 목록과 production acceptance
- OpenPanel: 기존 Account identity에 연결되는 저카디널리티 event·property 추가
- GraphQL·DB·domain mutation·dependency 변경 없음
