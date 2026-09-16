## Why

Profile 목록의 고정 Post 계약이 공용 UI 표본에만 남아 있어 Local Profile의 교체·동시성·자격과 Remote Profile의
ActivityPub `featured` 동기화가 일관되게 구현될 수 없다. PROD-809는 이 durable 제품 계약을 canonical 문서와
구현·검증 task로 연결하고, Profile 목록에서 중복·누락 없이 관찰 가능한 순서와 접근 제어를 확정한다.

## What Changes

- Local Profile은 작성한 Active Content Post·Reply·Quote 중 Public, Unlisted, Followers Only만 최대 하나 고정한다.
- 다른 Post로 교체할 때 기존 canonical ModalSheet confirmation을 사용하고, 서버는 현재 고정 기대값을 검증해 원자적으로
  교체한다. expected-current 불일치는 저장 상태를 보존한 stale/conflict 결과로 반환하며, 같은 Post 재고정과 이미
  없는/different Post 해제만 idempotent no-op으로 정규화한다.
- Remote Profile은 검증된 ActivityPub `featured` collection의 지원 Post 전체를 원격 순서로 보존·표시하며 Local의
  최대 1개 정책을 적용하지 않는다.
- Outbound Actor의 `featured` advertisement, Public/Unlisted 공개와 Followers Only signed fetch authorization, 기존
  Profile Update(Person) delivery lifecycle 재사용과 최신 표현 delivery 병합 허용을 정의한다.
- Inbound Featured collection page traversal, Followers Only authenticated fetch 검증, Remote Profile 등록·stale refresh·검증된
  Update(Actor/Person) production path 실행·예약, bounded traversal, 상위 Profile 결과 독립성, authoritative sync 교체와
  실패 시 마지막 성공 상태 보존을 정의한다.
- Profile 목록은 visible pinned segment를 고정 순서(Local 0..1, Remote는 원격 collection 순서)로 먼저 표시하고, 일반 chronology에서 pinned Post를
  cursor/page limit 전에 제외한다. Home·Local·Hashtag 순서는 바꾸지 않는다.
- Profile·Post lifecycle, visibility, block/domain 정책으로 숨겨지는 경우 pinned 노출을 제거한다.
- 이번 스펙 PR에는 app code, test fixture, Storybook interaction 또는 테스트 인프라를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/design/post-action-bar.md`
- Linear Contract: `PROD-809`
- Linear Implementations: `PROD-809` (전체 구현·검증·최종 archive 소유)

## Capabilities

### New Capabilities

- `profile-pins`: Local 단일 고정과 Remote ordered featured pin set의 identity·자격·mutation·lifecycle 계약
- `profile-pinned-post-list`: Profile 목록의 pinned-first ordering, visibility와 server-owned cursor/page contract
- `activitypub-profile-featured`: ActivityPub `featured` advertisement, outbound authorization, inbound traversal과
  authoritative synchronization

### Modified Capabilities

- 없음.

## Impact

- Domain canonical: Profile/Post object, Post List Policy와 Post Action Bar design 문서
- Server/domain: pin eligibility, atomic replacement/no-op mutation, ordered pin projection과 lifecycle 정리
- API/Relay: Profile 목록의 pinned-first 결과와 단일 서버-owned cursor/page 계약
- ActivityPub/Fedify: Actor `featured` advertisement, Featured collection authorization, inbound page traversal, Note
  materialization과 Profile Update(Person) delivery 재사용
- Verification: 구현 PR에서 DB/core/API/Relay/Fedify 및 Mastodon 호환 runtime 양방향 검증을 수행한다. 이 스펙 PR은
  OpenSpec strict validation, canonical domain validators, Prettier와 diff check만 수행한다.
