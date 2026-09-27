## Why

Profile 목록의 고정 Post 계약이 공용 UI 표본에만 남아 있어 Local Profile의 동시성·자격과 Remote Profile의
ActivityPub `featured` 동기화가 일관되게 구현될 수 없다. PROD-809는 이 durable 제품 계약을 canonical 문서와
구현·검증 task로 연결하고, 별도 pinned presentation과 기존 Profile chronology의 독립성 및 접근 제어를 확정한다.

## What Changes

- Profile pin 저장·API projection은 ordered 0..N collection으로 정의한다. Local pin은 ordered set에 추가하고 unpin은 지정한
  Post만 제거한다. 현재 Local first-party frontend는 server-authoritative order의 첫 visible Post만 관리·렌더한다.
- 같은 Post 재고정과 이미 없는 Post 해제는 idempotent no-op으로 정규화한다. 임의 삽입·재정렬·current-slot replacement는
  reorder UI 계약이 생길 때 별도 도입한다.
- Remote Profile은 검증된 ActivityPub `featured` collection의 지원 Post 전체를 원격 순서로 보존·표시하며 Local
  first-visible UI 제한을 적용하지 않는다.
- Outbound Actor의 `featured` advertisement, Public/Unlisted 공개와 Followers Only signed fetch authorization, commit 후
  Profile Update(Person) 전달과 최신 표현 delivery 병합 허용을 정의한다.
- Inbound Featured collection page traversal, Followers Only authenticated fetch 검증, Remote Profile 등록·stale refresh·검증된
  Update(Actor/Person) 시 production path 실행·예약, bounded traversal, 상위 Profile 결과 독립성, URI 제거를 포함한 최신 sync만의 authoritative 교체와 실패 시
  마지막 성공 상태 보존을 정의한다.
- Profile 목록은 visible pinned segment를 server-authoritative ordered collection 순서로 먼저 표시한다. 현재 Local UI는 첫 visible
  항목만 pinned 상태로 렌더하고 Remote inbound UI는 검증된 Featured collection 전체를 표시한다. pin 관계는 기존 Profile
  chronology의 후보·순서·pagination을 바꾸지 않으므로 같은 Post의 pinned·chronology 중복 표시를 허용한다. Home·Local·Hashtag
  순서는 바꾸지 않는다.
- Profile·Post lifecycle, visibility, block/domain 정책으로 숨겨지는 경우 pinned 노출을 제거한다.
- 이번 스펙 PR에는 app code, test fixture, Storybook interaction 또는 테스트 인프라를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/design/post-action-bar.md`
- Linear Contract: `PROD-809`
- Linear Implementations: `PROD-973` (Local 저장·API·pagination), `PROD-974` (ActivityPub federation), `PROD-975` (Profile UI·Relay·runtime), `PROD-809` (통합·검증·최종 archive 소유)

## Capabilities

### New Capabilities

- `profile-pins`: ordered pin collection의 identity·자격·add/unpin·lifecycle 계약과 현재 Local first-visible UI 관리 정책
- `profile-pinned-post-list`: Profile 목록의 별도 pinned presentation, visibility와 기존 chronology 독립성
- `activitypub-profile-featured`: ActivityPub `featured` advertisement, outbound authorization, inbound traversal과
  authoritative synchronization

### Modified Capabilities

- 없음.

## Impact

- Domain canonical: Profile/Post object, Post List Policy와 Post Action Bar design 문서
- Server/domain: pin eligibility, additive add/unpin, ordered pin projection과 lifecycle 정리
- API/Relay: Profile 목록의 ordered pinned presentation과 기존 chronology·pagination 불변 계약
- ActivityPub/Fedify: Actor `featured` advertisement, Featured collection authorization, inbound page traversal, Note
  materialization과 Profile Update(Person) delivery
- Verification: 구현 PR에서 DB/core/API/Relay/Fedify 및 Mastodon 호환 runtime 양방향 검증을 수행한다. 이 스펙 PR은
  OpenSpec strict validation, canonical domain validators, Prettier와 diff check만 수행한다.
