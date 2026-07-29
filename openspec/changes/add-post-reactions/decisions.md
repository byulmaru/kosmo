## Context

이 결정 기록은 PROD-386에서 확정한 canonical Reaction Type, PROD-390과 구현 자식들의 Linear 범위, `reaction`·`data-model`·`post`·`post-reaction-ui`·`notification` specs, 그리고 현재 PostgreSQL/Drizzle·GraphQL·Relay·Notification 구현 제약을 반영한다. 현재 계약은 정확한 여섯 Unicode Reaction만 포함하며 사용자 정의 Reaction 저장 방향을 선결정하지 않는다.

## Decision Records

### Reaction 계약은 PROD-390의 하나의 공유 OpenSpec으로 관리한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 저장, mutation, 조회, UI와 Notification이 같은 유일성·권한·멱등 lifecycle을 공유하지만 구현은 여러 PR로 나뉜다.
- Decision Outcome: PROD-390이 `add-post-reactions` change, 최종 통합 검증과 archive를 소유한다. PROD-395, PROD-404, PROD-405, PROD-406, PROD-407, PROD-413, PROD-450, PROD-472, PROD-417, PROD-418, PROD-419는 하나씩 구현·테스트 slice를 소유한다.
- Alternatives Considered: DB/API/UI/Notification별 별도 OpenSpec은 같은 행동 계약을 복제하고 부분 archive 위험을 만들므로 채택하지 않았다.
- Consequences: 각 PR 완료와 전체 change 완료를 구분한다. PROD-432의 공통 Action Bar rollout은 별도 계약으로 유지한다.
- Confirmation / Follow-up: tasks heading과 dependency가 Linear 이슈 구조와 일치하는지 strict validation 및 부모 통합 단계에서 확인한다.

### 초기 built-in Reaction Type과 표시 순서를 제한한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 최초 구현이 허용할 Type과 정확한 Unicode 표현, count 동률 순서를 고정해야 한다.
- Decision Outcome: 현재 허용 Type은 `🥹` (`U+1F979`), `❤️` (`U+2764 U+FE0F`), `🎉` (`U+1F389`), `👀` (`U+1F440`), `☘️` (`U+2618 U+FE0F`), `🌈` (`U+1F308`)만 사용한다. 목록 나열은 count 동률 표시 순서를 정의하지 않는다.
- Alternatives Considered: 임의 Unicode, variation selector 정규화, 동률 fallback 순서는 canonical Domain Gate에서 제외하거나 보장하지 않기로 했다.
- Consequences: application validation은 exact 문자열을 유지한다. 임의 Unicode와 사용자 정의 Reaction은 이번 mutation·UI에서 거부한다.
- Confirmation / Follow-up: PROD-404 validation과 PROD-417 selector fixture에서 여섯 exact 표현을 검증한다.

### Reaction Type은 현재 canonical 문자열로 저장한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: Canonical Reaction은 Type을 문자열로 정의하고 PROD-386·390은 정확한 여섯 Unicode만 현재 범위에 포함한다. 별도 Type identity와 사용자 정의 Reaction 확장은 상위 계약에서 승인되지 않았다.
- Decision Outcome: `reaction.type`은 non-null text로 exact Unicode를 저장한다. 현재 허용 목록은 PROD-404 application service가 검증하며 database enum, seed registry 또는 `CHECK` constraint로 고정하지 않는다.
- Alternatives Considered: PostgreSQL enum과 `CHECK`는 허용 목록 변경을 schema migration에 결합한다. 별도 `reaction_type` registry는 미래 사용자 정의 Reaction을 전제로 identity와 lifecycle 방향을 현재 범위에서 선결정한다.
- Consequences: database에 직접 쓰면 허용 목록 밖 문자열도 저장할 수 있으므로 모든 production write는 application validation을 통과해야 한다. 미래 사용자 정의 Reaction이 승인되면 Domain Gate와 Issue Gate에서 저장 identity와 기존 row migration을 새로 결정한다.
- Confirmation / Follow-up: 2026-07-21 PR #299 review에서 canonical/Linear 불일치를 확인해 정정했다. PROD-395 migration test는 text column과 DB 허용 목록 제약 부재를 검증하고 PROD-404가 exact 허용 목록을 검증한다.

### Reaction foreign key lifecycle과 index를 존재 기반 관계에 맞춘다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: Profile/Post 물리 삭제와 후속 count·Profile 조회를 지원하는 최소 제약·index를 정해야 한다.
- Decision Outcome: Profile/Post 삭제는 Reaction을 cascade한다. unique index는 `(post_id, type, profile_id)` 순서로 count·Type별 Profile lookup과 멱등 conflict target을 함께 지원하며, Profile cascade/cleanup을 위해 `(profile_id)` index를 추가한다. Profile connection ordering index는 PROD-407까지 유예한다.
- Alternatives Considered: 모든 foreign key `NO ACTION`은 orphan 방지 삭제 순서를 caller에게 분산한다. `(profile_id, post_id, type)` unique와 별도 post/type index는 같은 세 값을 중복 저장한다. 미래 cursor index 선제 추가는 미확정 정렬을 고정한다.
- Consequences: Profile/Post 물리 삭제 뒤 Reaction history는 남지 않는다. future audit/history가 필요하면 별도 capability가 소유한다.
- Confirmation / Follow-up: catalog·migration test로 Profile/Post cascade와 실제 index 순서를 검증한다.

### Reaction mutation은 database 제약으로 멱등성을 보장한다

- Decision Date: 2026-07-20
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0012](../../../docs/domain/decisions/0012-post-interaction-followup-clarifications.md), [ADR 0016](../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-404](https://linear.app/byulmaru/issue/PROD-404/reaction을-추가한다), [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다), [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: 반복·동시 요청이 중복 Reaction이나 불필요한 실패를 만들 수 있다.
- Decision Outcome: add는 unique conflict를 원자적으로 처리하고 기존 Reaction을 성공 결과로 반환한다. delete는 selected Profile의 현재 Post/Type 관계를 원자적으로 제거하며 관계가 없으면 성공 no-op으로 처리한다. 명시적 pessimistic lock을 사용하지 않는다.
- Alternatives Considered: check-then-write만 사용하는 방식은 race가 있고, 명시적 row/table/advisory lock은 복구 가능한 social interaction에 과도하다.
- Consequences: add는 신규 생성 여부를 caller에게 노출하고, delete는 실제 제거된 관계 ID를 nullable 결과로 제공해 cache 제거와 Notification cleanup을 연결한다. 오래 지연된 Post/Type 삭제가 재생성된 현재 관계를 제거할 수 있는 ABA 가능성을 수용한다.
- Confirmation / Follow-up: PROD-404·405·472의 database-backed concurrency test에서 단일 row, 실제 삭제 ID와 성공 no-op을 검증한다.

### count와 Profile 목록의 visibility 책임을 분리한다

- Decision Date: 2026-07-20
- Decision Class: Derived Contract
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-406](https://linear.app/byulmaru/issue/PROD-406/reaction-type%EB%B3%84-%EA%B0%9C%EC%88%98%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4), [PROD-407](https://linear.app/byulmaru/issue/PROD-407/reaction%EC%9D%84-%EB%82%A8%EA%B8%B4-profile%EC%9D%84-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: viewer에 따라 count가 달라지면 Post 단위 cache가 불안정해지지만 unavailable Profile은 목록에 노출할 수 없다.
- Decision Outcome: Post 조회 권한을 통과한 모든 viewer에게 현재 Reaction 전체의 Type별 count를 동일하게 제공한다. Type별 Profile connection에만 viewer의 기존 Profile visibility를 SQL page limit 전에 적용한다. count는 내림차순이며 동률 순서는 보장하지 않는다.
- Alternatives Considered: count에도 viewer Profile visibility를 적용하는 방식은 viewer마다 count가 달라지고 canonical 계약과 충돌한다. client filtering은 pagination을 깨뜨린다.
- Consequences: summary count와 visible Profile 목록 길이는 다를 수 있으며 client가 이를 다시 맞추지 않는다.
- Confirmation / Follow-up: PROD-406·407과 PROD-418에서 서로 다른 viewer, unavailable Profile과 pagination을 함께 검증한다.

### Type별 Profile connection은 최신 Reaction순으로 정렬한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/domain/objects/reaction.md`
  - `PROD-407`
- Status: Active
- Context / Problem: PROD-407은 중복 없는 stable cursor pagination을 요구하지만 Profile 목록의 순서와 cursor 경계는 정하지 않았다. 같은 Post·Type에서 Profile마다 Reaction은 하나뿐이므로 count는 Profile 사이의 순서를 만들지 못한다.
- Decision Outcome: Type별 Profile connection은 `Reaction.createdAt DESC, Reaction.id DESC` 순서로 반환한다. opaque cursor는 두 값을 함께 표현하고, Profile visibility는 이 cursor 경계와 page limit을 적용하기 전에 SQL에서 필터링한다.
- Alternatives Considered: Profile 이름·handle 순서는 mutable 값과 collation에 pagination이 결합된다. Reaction ID만 사용하는 방식은 단순하지만 같은 millisecond에 생성된 UUIDv7의 실제 생성 순서를 명시적으로 보장하지 않는다. Profile별 Reaction count는 같은 Post·Type에서 모두 1이므로 정렬 기준이 되지 않는다.
- Consequences: 새 Reaction은 목록 앞에 나타나며 기존 page의 older 방향 keyset 경계는 안정적으로 유지된다. 조회 query는 `(post_id, type, created_at DESC, id DESC)` 순서를 지원하는 forward index가 필요하다.
- Confirmation / Follow-up: PROD-407 integration test에서 최신순, 동일 생성 시각 tie-break, 다중 page cursor 경계, 중복·누락 방지와 visibility-before-limit을 검증한다.

### Profile connection은 기존 Profile node만 공개한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/domain/objects/reaction.md`
  - `PROD-407`
- Status: Active
- Context / Problem: PROD-407의 전달 결과는 Reaction을 남긴 Profile 목록이며 전체 Reaction event history는 제외한다. 공개 row에 Reaction metadata를 포함하면 Reaction Node와 event history 계약을 추가로 정의해야 한다.
- Decision Outcome: Type별 조회 결과는 `Post.reactionProfiles(type: String!): ProfileConnection!` field에서 기존 Profile 객체를 node로 제공한다. `type`은 canonical Reaction Type 문자열 검증을 적용한다. Reaction 객체, Reaction ID와 `reactedAt`은 공개하지 않고 `createdAt`과 ID는 최신순 opaque cursor를 계산하는 내부 ordering key로만 사용한다.
- Alternatives Considered: `ReactionConnection`은 source 객체와 lifecycle을 공개 계약으로 확장한다. custom edge의 `reactedAt`은 현재 UI 전달 결과에 필요하지 않고 event history 제외 범위를 흐린다.
- Consequences: client는 기존 Profile fragment를 재사용할 수 있지만 각 Profile의 정확한 Reaction 시각은 표시할 수 없다. 시각 또는 Reaction event가 제품 요구가 되면 별도 Domain·Issue Gate에서 공개 계약을 확장해야 한다.
- Confirmation / Follow-up: PROD-407 schema와 integration test에서 node가 기존 Profile이고 Reaction metadata field를 새로 노출하지 않는지 확인한다.

### PROD-449는 fixture-first props 경계로 Reaction 요약 프레젠테이션을 전달한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/domain/objects/reaction.md`
  - `PROD-449`
- Status: Active
- Context / Problem: canonical Reaction 계약의 최종 UI는 viewer-independent Type별 count와 viewer-filtered Profile connection을 연결해 탐색해야 한다. PROD-449의 독립 전달 범위는 실제 Relay query·connection·modal/route 조립 전의 프레젠테이션과 상태 검증이므로, 이후 통합에도 재사용할 seam이 필요하다.
- Decision Outcome: PROD-449는 props-only `ReactionSummary`와 props-only `ReactionProfileList` seam을 먼저 제공하고, PROD-418은 같은 seam에 실제 Post count query와 `reactionProfiles` connection을 연결한다. seam은 supplied count order를 보존하고 zero-count Type을 만들거나 제거·정렬·필터링하지 않으며, loading/empty/error/populated 상태와 selection·retry·pagination callback을 받을 수 있다. Profile row는 기존 `ProfileListItem`에 Relay `Profile` fragment ref를 전달해 재사용하며, Storybook은 raw `$key` cast 없이 Relay mock fragment ref를 사용한다.
- Alternatives Considered: component 안에서 직접 Relay connection을 조회·페이지네이션하는 방식은 실제 connection과 cache/route 책임을 PROD-449에 앞당긴다. raw scalar로 새 Profile row를 만드는 방식은 기존 Avatar/name/handle/bio/Follow surface와 fragment contract를 중복한다.
- Consequences: 실제 `Post` count query와 `reactionProfiles` connection, modal/route, selected Profile/viewer cache 통합은 PROD-418에 남는다. supplied order는 server가 제공한 count 내림차순과 동률 무보장 계약을 그대로 보존하며, component는 이를 재해석하지 않는다. 이 선택은 최종 `post-reaction-ui` spec을 축소하거나 대체하지 않으며, 나중에 되돌릴 중간 제품 계약이 아니다.
- Confirmation / Follow-up: PROD-449는 fixture state, 복수 Type·동률, 기존 Profile row, callback interaction과 Relay mock fragment Storybook을 component 수준에서 검증한다. PROD-418은 같은 seam을 유지한 채 실제 query/connection, zero-count와 modal/route UX, cache 통합 및 최종 spec의 pagination 검증을 수행한다.

### PROD-418은 Reaction이 있는 Post에서 modal 기반 Profile 탐색을 제공한다

- Decision Date: 2026-07-25
- Decision Updated: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/domain/objects/reaction.md`
  - `docs/design/reactions.md`
  - `PROD-418`의 2026-07-25 설계 결정 댓글
- Status: Active for data·pagination·error behavior; entry interaction superseded by the 2026-07-29 PROD-417 decision
- Context / Problem: PROD-418은 이미 제공된 viewer-independent Type별 count와 viewer-filtered Profile connection을 현재 Post 맥락에서 연결해야 한다. Reaction이 없는 Post의 빈 요약, 별도 route, 조회 오류용 전역 알림과 매번 빈 loading부터 시작하는 modal은 이 결과에 불필요한 UI·cache 계약을 추가한다.
- Decision Outcome: `reactionCounts`가 비어 있으면 `ReactionSummary`를 렌더링하지 않고, 양수 count가 있으면 server 순서를 그대로 표시한다. PROD-418 전달 당시에는 Type token이 현재 Post 위 modal을 열었지만, 2026-07-29 PROD-417 계약부터 token은 same-Type Reaction toggle을 실행하고 Profile 목록은 Reaction 전용 More 버튼에서 연다. modal의 별도 route/URL 없음, 외부 영역·Android back dismiss, 별도 닫기 버튼 없음, 최초·추가 page inline retry, 기존 edge 보존, cache 우선 background 갱신과 selected Profile별 Relay Environment 격리는 유지한다.
- Alternatives Considered: Reaction이 없는 Post에 빈 요약을 표시하는 방식은 요약 진입점 없이 중복 empty UI를 남긴다. Profile 목록을 별도 route로 여는 방식은 현재 Post 맥락과 불필요한 URL 계약을 추가한다. 조회 오류를 snackbar로만 알리는 방식은 지속적인 복구 동작을 화면 밖의 일시적 알림에 의존하게 한다. 매번 network-only loading부터 시작하는 방식은 이미 조회한 목록을 불필요하게 숨긴다.
- Consequences: PROD-418의 기존 backend API, Relay connection, modal·cache 구현은 재사용한다. PROD-417은 같은 seam의 token interaction, Reaction 전용 More·emoji tab, 목록 surface와 mutation 상태 연결을 소유하며 API·DB를 확장하지 않는다.
- Confirmation / Follow-up: 기존 PROD-418 검증은 zero-count, server 순서, modal dismiss, 조회 오류·edge·cache 격리를 계속 보장한다. PROD-417은 새 token toggle·More/tab/list surface를 별도로 검증한다.

### PROD-450은 supplied option 기반 Quick Picker 프레젠테이션을 먼저 전달한다

- Decision Date: 2026-07-23
- Decision Updated: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/domain/objects/reaction.md`
  - `docs/design/reactions.md`
  - `PROD-450`
  - `openspec/changes/add-post-reactions/specs/post-reaction-ui/spec.md`
- Status: Active
- Context / Problem: 최종 Reaction selector는 selected Profile의 실제 add/delete mutation과 Relay cache를 연결해야 하지만, PROD-450은 API 없이 독립 검증 가능한 프레젠테이션과 상태 경계만 소유한다. 현재는 canonical 여섯 Unicode를 GitHub Reaction 선택기처럼 빠르게 고르는 panel이 필요하고, 장기 custom emoji 탐색은 별도 제품·federation 계약이 필요하다.
- Decision Outcome: PROD-450은 부모가 공급한 ordered option을 한 줄로 표시하는 props-only `ReactionSelector` Quick Picker panel과 opaque option identity, controlled selected·pending·error, toggle callback seam을 제공했다. 2026-07-29 PROD-417은 최신 canonical 디자인에 맞춰 Web option을 32×32 CSS px, emoji를 20px, pending spinner를 16×16px·2px stroke, option gap과 panel padding을 4px로 조정한다. border 없는 12px radius option, 분리한 `primary`/`primaryHover` selected layer의 70% opacity, error의 red border 없음, `zIndex` 없는 fading arc, 전체 disabled 미렌더링과 supplied option 계약은 유지한다. 이번 Web 우선 변경은 현재 Native 44 logical unit option과 spinner geometry를 변경하지 않는다.
- Alternatives Considered: Web 44px 유지는 WCAG 2.2 AA 최소 target보다 크지만 Figma Post Action Bar의 28px 밀도와 실제 Reaction row에 비해 과도한 높이를 만든다. 28px로 동일화하면 emoji·pending 상태의 독립 target 여유가 줄어 32px를 선택했다. full-opacity selected 배경, 기존 `ActivityIndicator`, 점·spoke spinner와 균일한 ring, 새 spinner package, component 내부 Type 고정과 custom emoji Full Picker는 기존 이유로 채택하지 않았다.
- Consequences: platform 분기를 presentation 내부에 유지하고 새 dependency를 추가하지 않는다. 현재 selector·summary의 44 logical unit과 Profile tab의 32 minimum은 iOS Profile tab 44×44pt 및 Android 48×48dp baseline을 모두 충족하지 않으므로, target 복구와 runtime 관찰은 Native 출시 gate로 유지하며 Web 32px 검증으로 대체하지 않는다. 장기 palette·Full Picker와 custom emoji renderer는 별도 Domain·Issue Gate 뒤 option 공급자로 연결한다.
- Confirmation / Follow-up: PROD-417 Storybook/component interaction에서 Web exact 32px option, 20px emoji, 16px·2px fading arc, 70% selected layer, supplied order·callback을 검증한다. 320px·390px·600px Web runtime과 Native 미실행 상태를 분리해 기록한다.

### PROD-417은 기존 Post Action Bar에 private anchored Reaction popover를 연결한다

- Decision Date: 2026-07-28
- Decision Updated: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/design/reactions.md`
  - `PROD-417`
  - `PROD-414`
  - `openspec/changes/add-post-reactions/specs/post-reaction-ui/spec.md`
- Status: Active
- Context / Problem: PROD-450의 `ReactionSelector`는 펼쳐진 props-only panel만 제공한다. PROD-417은 실제 Post Action Bar trigger와 모든 platform의 overlay를 소유해야 하며, 향후 Reply composer가 overlay를 사용할 가능성만으로 아직 공통 계약이 없는 `ActionMenu`나 범용 anchored overlay를 확장해서는 안 된다.
- Decision Outcome: PROD-417은 feature-local private `ReactionAction`과 `ReactionPopover`를 유지하고, `ReactionSelector`의 Web presentation만 최신 32px 계약에 맞춘다. `PostActionBar`는 공개 composite fragment, toolbar semantics와 action 순서를 유지한다. popover는 Web·iOS·Android 모두 trigger에 anchored된 작은 floating surface이며 공간에 따라 위·아래 전환, viewport/safe area 수평 clamp와 feature-local horizontal `ScrollView`를 사용한다. 같은 trigger, 외부 입력, Web `Escape`, Android back, Post unmount와 actor 전환으로 닫고 Web focus 이동·복원과 mutation 뒤 열린 상태를 유지한다. guest이거나 selected Profile이 없으면 trigger는 자리를 유지한 채 disabled이며 popover·mutation을 시작하지 않는다.
- Alternatives Considered: 기존 `ActionMenu` 일반화는 item-only Web menu와 native bottom sheet 계약을 임의 ReactNode·anchored native overlay까지 확장한다. 처음부터 공용 `AnchoredPopover`를 만들면 현재 단일 consumer와 확정되지 않은 Reply surface를 근거로 public abstraction을 선결정한다. mobile bottom sheet는 여섯 fixed option의 짧은 quick action에 과도하다.
- Consequences: ordinary·Quote Post는 own Post, 순수 Repost는 source Post를 Action Bar와 summary의 공통 `reactionTarget`으로 사용한다. Reply가 나중에 동일한 anchored UX를 확정하면 그때 공통 primitive를 추출할 수 있다. PROD-417은 Reaction 전용 More를 소유하지만 Reply composer·Post Action Bar의 일반 More action·전체 action 조립이나 onboarding 흐름은 소유하지 않는다.
- Confirmation / Follow-up: Web interaction은 retrigger, outside pointer, `Escape`, 첫 option focus, trigger focus 복원, `aria-haspopup`/`aria-expanded`, 열린 상태 유지, top/left와 bottom/right edge의 양방향 flip/clamp·좁은 너비 scroll과 selected Profile 부재 시 disabled/no-request를 검증한다. production Post fixture에서 ordinary·Quote·순수 Repost의 mutation target을 검증한다. iOS·Android 동작 계약은 유지하지만, 2026-07-28 사용자 결정에 따라 native app runtime 관찰은 현재 제품 범위와 PROD-417 PR Ready gate에서 제외하고 native app 작업 재개 시 후속 확인한다.

### PROD-417은 server-confirmed payload로 selected Profile Reaction cache를 갱신한다

- Decision Date: 2026-07-28
- Decision Updated: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance:
  - `docs/design/reactions.md`
  - `PROD-417`
  - `PROD-472`
  - `openspec/changes/add-post-reactions/specs/post-reaction-ui/spec.md`
- Status: Active
- Context / Problem: selector는 non-connection `Post.viewerReactions`를 selected Profile별 Relay Environment에서 읽는다. optimistic state와 불완전한 updater는 같은 Type 중복, idempotent delete의 nullable ID 오판, actor 전환 뒤 stale UI 갱신 또는 cache record 합성을 만들 수 있다.
- Decision Outcome: fixed 여섯 Type은 zero-count와 무관하게 client catalog가 공급하고 `viewerReactions`는 selected state를 제공한다. optimistic update는 사용하지 않는다. 기존 add/delete updater의 same-Type/data-ID dedupe, non-null Post normalization, `post: null` fallback, no-synthesis와 partial GraphQL payload 계약을 유지한다. 성공 payload 뒤에만 선택 상태와 count delta를 반영하고 대상 Post의 `reactionCounts`만 targeted refetch해 authoritative server count로 맞춘다. payload가 없거나 network가 실패하면 선택 상태와 count를 변경하지 않는다.
- Alternatives Considered: optimistic updater는 rollback·부분 응답·actor 전환 복잡도를 늘린다. add payload에 Post/count를 추가하면 API 범위를 확장한다. mutation 뒤 전체 surface refetch는 불필요한 network 범위가 크므로 대상 Post의 `reactionCounts`만 다시 조회한다. payload가 있는데 GraphQL error 하나만으로 전체 실패 처리하면 Relay가 이미 정규화한 결과와 충돌한다.
- Consequences: mutation, updater와 targeted refetch는 요청을 시작한 Relay Environment 안에서 끝난다. actor token 또는 operation guard가 다른 늦은 callback은 현재 화면의 popover·pending·error·selected·count를 바꾸지 않는다. 같은 Type의 한 surface 내 중복 입력은 막고 서로 다른 Type은 동시에 진행할 수 있지만, cross-surface same-Type 최종 상태는 server 응답 순서에 의존한다.
- Confirmation / Follow-up: 기존 updater matrix에 성공 전 count 불변, 성공 뒤 delta와 targeted refetch, refetch 실패·역순 완료·actor 전환 stale callback을 추가하고 Quick Picker와 summary token의 공유 상태를 검증한다.

### PROD-417은 목록·상세 Reaction token toggle과 More 기반 Profile 탐색을 연결한다

- Decision Date: 2026-07-29
- Decision Class: Product and Implementation Choice
- Authority / Provenance:
  - `docs/design/reactions.md`
  - `docs/design/accessibility.md`
  - `PROD-417`
  - `PROD-418`
  - `PROD-414`
- Status: Active
- Context / Problem: PROD-418이 전달한 summary token은 Profile modal 진입점이었고 상세에만 연결됐다. 실제 Reaction을 Discord·Slack처럼 기존 token에서 바로 toggle하려면 Quick Picker와 summary가 같은 actor·Post·pending/error/cache 상태를 공유해야 하며, Profile 탐색에는 별도 진입점이 필요하다. 순수 Repost의 기존 summary와 Action Bar가 서로 다른 Post를 가리키는 불일치도 제거해야 한다.
- Decision Outcome: private `PostReactionController`가 surface에서 한 번 결정한 `reactionTarget`의 `viewerReactions`, Type별 pending/error, add/delete와 count refetch를 소유하고 Quick Picker와 summary token에 공급한다. 목록과 상세 모두 body/source 아래와 Action Bar 위에 summary row를 표시한다. 일반·Quote는 own Post, 순수 Repost는 source Post를 사용한다. 양수 count token은 same-Type add/delete toggle이며 selected Profile이 없으면 보이되 disabled다. standalone `반응` 제목을 제거하고 Web token을 32px pill로 표시한다. selected token은 Quick Picker와 같은 분리된 `primary`/`primaryHover` 70% 배경 layer를 사용해 emoji·count의 opacity를 유지한다. 양수 count 뒤의 32px Reaction 전용 More는 selected Profile 유무와 무관하게 modal을 열며 server 순서의 emoji tab 중 첫 Type을 기본 선택한다. 가용 너비를 넘는 tab은 feature-local horizontal `ScrollView`에서 한 줄로 탐색하게 한다. 목록 제목은 선택 Type과 무관하게 `반응한 사람`으로 고정하고 Profile item의 emoji는 현재 tab Type에서 파생하며 separator는 인접한 Profile 사이에만 표시한다.
- Alternatives Considered: token 클릭으로 modal을 계속 열면 기존 Reaction에서 직접 toggle할 수 없다. plus는 Reaction 추가 affordance와 혼동되므로 Profile 전체를 탐색하는 ellipsis More를 선택했다. selected token에 기본 card 배경이나 border만 사용하면 선택 상태의 시각 대비가 약하고, full-opacity primary를 token 전체에 적용하면 Quick Picker와 달라지며 emoji·count까지 영향을 줄 수 있다. item에 emoji가 이미 있으므로 제목의 Type emoji 반복은 정보가 중복된다. Quick Picker·summary별 mutation state는 pending/error/count가 갈라진다. generic React context나 public controller는 현재 단일 feature 범위를 불필요하게 넓힌다. outer Repost summary를 유지하면 source Action Bar mutation과 표시 count가 다른 Post를 가리킨다.
- Consequences: PROD-417은 완료된 PROD-418의 API·Relay pagination·modal cache를 재사용하면서 entry interaction, emoji tab과 목록 surface를 변경한다. Reaction 전용 More는 Post Action Bar의 일반 More menu와 별개다. selected Profile이 없어도 viewer-independent count와 허용된 Profile 목록 조회는 가능하지만 mutation은 불가능하다. API·DB, custom emoji, generic Storybook/mock infrastructure와 global toast는 추가하지 않는다.
- Confirmation / Follow-up: Storybook/component/integration test는 exact Web geometry, selected token의 70% primary layer와 100% emoji·count, picker/token 공유 상태, 성공 전 불변·성공 뒤 count/refetch·실패 보존, 목록·상세 ordinary/Quote/source Repost target, selected Profile 부재, More·tab·`반응한 사람` 제목·item emoji·Profile 사이 separator·pagination/retry를 검증한다. 320px에서 여섯 tab의 horizontal scroll을 검증하고 320px·390px·600px Web runtime 관찰과 미실행 Native 관찰을 분리해 기록한다.

### Reaction Notification은 source 밖의 Best Effort projection으로 처리한다

- Decision Date: 2026-07-20
- Decision Class: Implementation Choice
- Authority / Provenance: [Notification canonical 객체](../../../docs/domain/objects/notification.md), [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-419](https://linear.app/byulmaru/issue/PROD-419/reaction-notification%EC%9D%84-%EC%A0%95%EB%A6%AC%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: Notification 실패가 Reaction 결과를 깨뜨리지 않으면서 source·Recipient·Related Profile·Post·Type 상관관계를 유지해야 한다.
- Decision Outcome: Reaction commit 뒤 새 source에 대해서만 같은 request에서 Notification create를 await/catch한다. 자기 Post와 Remote Recipient는 생성하지 않는다. Reaction delete commit 뒤 cleanup을 await/catch하며 실패해도 source 결과를 유지하고 source Reaction을 식별할 수 있게 오류를 기록한다. stale row는 source/visibility predicate로 모든 API surface에서 숨긴다.
- Alternatives Considered: 같은 transaction은 Notification 장애를 source 장애로 확대한다. fire-and-forget은 process 종료와 관측 경계를 잃는다. retry/outbox/queue/backfill은 이번 범위가 아니다.
- Consequences: 누락 또는 stale Notification이 물리적으로 남을 수 있다. Notification API는 kind별 source visibility를 filter-before-limit으로 적용해야 하며 cleanup 실패 로그가 남을 수 있다.
- Confirmation / Follow-up: PROD-413은 source 실패 격리·숨김·inbox/read/count를 검증했다. PROD-419는 cleanup 성공·반복·실패 격리·오류 관측과 stale visibility를 검증한다.

### Reaction Notification은 기존 Notification baseline 뒤에 확장한다

- Decision Date: 2026-07-20
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4)
- Status: Superseded
- Context / Problem: Notification backend는 병합됐지만 공통 목록 UI·badge·E2E와 active capability archive가 남아 있고 현재 SQL은 Follow source에 고정돼 있다.
- Decision Outcome: PROD-395와 Reaction mutation/query slice는 Notification UI 완료를 기다리지 않는다. `REACTION` kind migration, multi-kind list/count/read와 client item은 `add-in-app-notifications` archive 뒤 PROD-413·419가 추가한다.
- Alternatives Considered: active Notification change에 Reaction을 끼우면 PROD-273 범위와 archive 책임을 바꾸고 migration/snapshot 충돌을 만든다.
- Consequences: 공유 Reaction change는 Notification baseline에 대한 명시적 의존성을 유지한다. 부모 PROD-390 archive는 Notification 자식 완료를 기다린다.
- Confirmation / Follow-up: 2026-07-23의 “Reaction Notification 구현 gate는 완료된 직접 선행 slice로 판단한다”가 최신 Linear dependency를 반영해 이 기록을 대체한다.

### Reaction Notification 구현 gate는 완료된 직접 선행 slice로 판단한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), PROD-277, PROD-324, PROD-372
- Status: Active
- Context / Problem: 이전 기록은 `add-in-app-notifications` 전체 archive를 착수 조건으로 뒀지만 최신 PROD-413은 필요한 저장·API·UI 구현 이슈를 직접 blocker로 관리한다.
- Decision Outcome: PROD-413은 직접 blocker인 Notification 목록·badge·Read/navigation slice가 완료되면 착수한다. 부모 Notification change의 남은 E2E·archive는 별도 통합 책임이며 PROD-413을 차단하지 않는다.
- Alternatives Considered: 부모 change 전체 archive까지 기다리면 이미 승인·병합된 직접 기반을 사용하지 못하고 두 계약의 독립 구현 순서를 불필요하게 결합한다.
- Consequences: PROD-413은 현재 병합된 baseline을 독립 확인해 확장하며 `add-in-app-notifications`의 남은 task나 archive를 대신 완료하지 않는다.
- Confirmation / Follow-up: PROD-277·324·372의 Done 상태와 현재 `main`의 목록·badge·Read/cache 구현을 착수 전에 확인했다.

### Multi-kind Notification은 kind별 visible projection을 합친다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: [Notification canonical 객체](../../../docs/domain/objects/notification.md), [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: Follow와 Reaction은 서로 다른 source 관계와 visibility predicate를 가지지만 Node·list·count·Read는 같은 visible Notification 집합을 사용해야 한다.
- Decision Outcome: 각 kind가 source correlation과 visibility를 검증한 동일 shape의 projection을 만들고 이를 `UNION ALL`로 합친 뒤 공통 ID cursor pagination, unread count와 Read 대상을 결정한다.
- Alternatives Considered: kind-guarded `LEFT JOIN`과 `OR` predicate는 nullable source join과 kind 조건을 Node·list·count·Read마다 반복해 새 kind 추가 시 predicate drift 위험이 크다.
- Consequences: kind별 predicate는 독립적으로 검증할 수 있고 공통 표면은 합쳐진 projection만 소비한다. projection column shape와 cursor ordering은 kind 사이에서 같아야 한다.
- Confirmation / Follow-up: Follow와 Reaction 혼합 목록·count·Node·Read, unavailable source의 filter-before-limit을 API integration test로 검증한다.

### Notification item 이동과 Read를 분리한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-372](https://linear.app/byulmaru/issue/PROD-372/%EC%95%8C%EB%A6%BC-%ED%95%AD%EB%AA%A9-%EC%9D%BD%EC%9D%8C-%EC%83%81%ED%83%9C%EB%A5%BC-best-effort%EB%A1%9C-%EB%8F%99%EA%B8%B0%ED%99%94%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: Reaction item은 Related Profile이 아니라 Target Post로 이동하지만 기존 Read/cache 동기화의 비차단 계약을 유지해야 한다.
- Decision Outcome: item 활성화는 Target Post 이동을 즉시 시작하고 Read mutation은 응답을 기다리지 않는 Best Effort 요청으로 실행한다. Read pending·실패·재시도는 이동 결과를 바꾸지 않으며 성공 payload만 Recipient item/count cache를 갱신한다.
- Alternatives Considered: Read 성공 뒤 이동하면 network 실패가 핵심 navigation을 차단한다. 이동 뒤 별도 화면에서 Read를 시작하면 item activation과 source ID 상관관계를 잃기 쉽다.
- Consequences: Follow와 Reaction item은 목적지는 달라도 같은 Read/cache orchestration을 공유하며 selected Profile별 Relay Store 격리를 유지한다.
- Confirmation / Follow-up: 즉시 navigation, Read 실패·반복·Profile 전환과 성공 payload cache 반영을 client integration test로 검증한다.

### Reaction Type과 add mutation은 canonical 문자열 계약을 그대로 노출한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: PROD-404는 exact Unicode Type을 GraphQL에서 표현하고 Post와 현재 Type을 식별하는 add input 및 멱등 payload를 확정해야 한다.
- Decision Outcome: GraphQL은 `addReaction(input: { postId: ID!, type: String! })`을 제공한다. `postId`는 concrete `Post` global ID만 허용하고 `type`은 canonical Unicode 문자열을 그대로 받는다. 성공 payload는 `AddReactionPayload.reaction: Reaction!`만 반환하며 신규 생성 여부는 공개하지 않는다.
- Alternatives Considered: GraphQL enum은 canonical Unicode와 별도 symbolic mapping을 만들고 허용 목록 변경을 schema 변경에 결합한다. 별도 Reaction Type object나 opaque Type ID는 승인되지 않은 registry identity를 선결정한다. payload의 `created` boolean은 Notification 내부 분기를 공개 API에 누출한다.
- Consequences: 허용 목록 밖 문자열은 `VALIDATION`과 `field = type`으로 거부한다. 반복 add는 기존 Reaction과 같은 Node ID를 반환한다. 신규 source 구분은 실제 caller가 생기는 PROD-413에서 service 결과에 추가한다.
- Confirmation / Follow-up: GraphQL schema snapshot과 API integration test에서 input/payload shape, exact 문자열 validation, 반복 요청의 동일 Node ID를 검증한다.

### Reaction은 최소 필드의 Relay Node로 노출한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 멱등 add 결과와 후속 selector·delete cache가 동일한 durable Reaction 관계를 안정적으로 식별해야 하지만 아직 관계 navigation field의 구체 사용 사례는 확정되지 않았다.
- Decision Outcome: `Reaction`은 Relay Node이며 현재 `id`, `type`, `createdAt`을 노출한다. Node loader는 대상 Post의 기존 조회 정책을 적용한다. Profile·Post 관계 field는 구체 client query가 소유하는 후속 slice 전까지 공개하지 않는다.
- Alternatives Considered: non-Node payload는 같은 관계의 반복 결과와 후속 cache 제거 대상을 안정적으로 식별하지 못한다. Profile·Post field를 지금 모두 노출하는 방식은 현재 사용 사례와 별도 visibility 계약 없이 API 표면을 넓힌다.
- Consequences: client는 opaque Reaction global ID로 관계 identity를 유지한다. 조회할 수 없는 Post의 Reaction Node는 `null`이며 database UUID나 typename encoding에 의존할 수 없다.
- Confirmation / Follow-up: Node global ID round-trip, readable/unreadable Post loader와 mutation payload의 concrete `Reaction` typename을 검증한다.

### 조회할 수 없는 Post의 add는 존재를 숨긴다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: add mutation이 존재하지 않는 Post와 존재하지만 viewer가 조회할 수 없는 Post를 다른 오류로 구분하면 Post 존재를 추가로 노출한다.
- Decision Outcome: `addReaction`은 대상 Post가 없거나 기존 Post 조회 정책을 통과하지 못하면 모두 `NOT_FOUND`를 반환한다. 로그인 또는 selected Profile scope 자체가 없으면 기존 scope auth의 `PERMISSION_DENIED`를 유지한다.
- Alternatives Considered: unreadable Post에 `PERMISSION_DENIED`를 반환하면 원인은 명확하지만 global Node 조회의 숨김 계약과 달리 Post 존재를 확인시킨다.
- Consequences: client는 missing과 unreadable Post를 구분하지 않는다. 오류 뒤에는 Reaction과 Notification이 생성되지 않는다.
- Confirmation / Follow-up: 존재하지 않는 Post와 visibility별 unreadable Post가 같은 code를 반환하고 database rollback 뒤 Reaction이 남지 않는지 검증한다.

### Reaction add의 session 권한과 도메인 검증 책임을 분리한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [Core 서비스 경계](../../../docs/architecture/core-services.md), [PROD-404](https://linear.app/byulmaru/issue/PROD-404/reaction을-생성한다)
- Status: Superseded
- Context / Problem: GraphQL context는 Active Account, selected Profile membership과 Profile visibility를 검증하지만 core `addReaction`이 `accountId`를 받아 같은 membership을 다시 조회해 transport session 정책에 결합하고 있었다.
- Decision Outcome: GraphQL `usingProfile` entry point가 Active Account와 Account–Profile membership을 검증하고, core service에는 검증된 actor Profile identity만 전달한다. core는 actor가 Active/Normal Local Profile인지와 Post, Type, 멱등 저장을 계속 검증한다.
- Alternatives Considered: core가 `accountId`와 membership을 계속 재검증하면 session 정책을 중복 소유한다. actor 검증 전체를 API에 두면 core caller가 Local/Instance 상태를 우회할 수 있어 채택하지 않았다.
- Consequences: Account 또는 membership 변경과 core transaction 사이에는 context snapshot 기준의 짧은 시간차가 있을 수 있다. commit 시점의 membership 재검증이 필요해지면 transport identity를 core에 다시 결합하지 않고 entry point의 transaction-aware 검증으로 별도 설계한다.
- Confirmation / Follow-up: core test는 Local/Profile/Instance/Post/Type/멱등성에 집중하고, API integration test는 비활성 Account와 membership 부재가 `PERMISSION_DENIED`로 거부되는지 검증한다. PROD-405 등 후속 mutation도 같은 책임 경계를 따른다.

### Reaction core actor 검증은 origin과 reachability에 중립적이다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0019](../../../docs/domain/decisions/0019-selected-profile-authorization-boundary.md), [Core 서비스 경계](../../../docs/architecture/core-services.md), [PROD-404](https://linear.app/byulmaru/issue/PROD-404/reaction을-생성한다), [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다), [PROD-439](https://linear.app/byulmaru/issue/PROD-439/kosmo에서-uploading-local-media를-생성한다)
- Status: Active
- Context / Problem: 이전 결정은 Local GraphQL caller의 Account·membership·selected Profile 조건과 여러 진입점이 공유할 수 있는 Reaction core actor 조건을 섞어 core에서 Local Instance와 Reachable 상태를 강제했다.
- Decision Outcome: GraphQL `usingProfile` entry point는 Active Account와 Account–Profile membership, selected Profile의 Active/Normal 및 non-Suspended Instance 조회 가능 상태를 한 번 검증하며 Instance Type을 제한하지 않는다. resolver와 core add/delete는 같은 Account·membership·Profile/Instance 상태를 다시 검증하지 않는다. core add/delete는 검증된 actor identity를 받아 Post, Type, 소유 관계와 persistence만 검증한다.
- Alternatives Considered: core가 Profile/Instance 상태를 다시 검증하면 `usingProfile` snapshot과 같은 사실을 중복 소유하고 현재 유일한 production caller의 인증 정책에 결합한다. 향후 protocol entry가 생기면 signature와 actor 가용성을 해당 entry가 검증한 뒤 같은 core action을 호출한다.
- Consequences: GraphQL에서는 Membership이 있는 Local/Remote selected Profile을 같은 경계로 처리한다. ActivityPub federation 제외 범위는 바뀌지 않는다. 향후 ActivityPub entry는 signature, actor/object/recipient와 Post 접근 조건을 먼저 검증한 뒤 같은 core action을 사용할 수 있다.
- Confirmation / Follow-up: core database-backed test는 actor Profile/Instance 상태를 재조회하지 않는 add/delete와 Post·Type·소유 관계를 검증한다. API integration test는 비활성 Account, membership 부재와 selected Profile 조회 불가 상태를 계속 거부한다.

### Reaction 삭제는 관계의 global ID로 식별한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0012](../../../docs/domain/decisions/0012-post-interaction-followup-clarifications.md), [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다)
- Status: Superseded
- Context / Problem: PROD-405는 현재 Reaction Owner를 검증하면서 이미 제거한 관계의 반복·동시 삭제를 성공시켜야 한다. Profile/Post/Type 조합을 input으로 사용하면 오래된 삭제 재시도가 같은 조합으로 다시 생성된 새 Reaction까지 제거하는 ABA 문제가 생긴다.
- Decision Outcome: GraphQL은 `deleteReaction(input: { id: ID! })`을 제공하고 concrete `Reaction` global ID만 허용한다. 성공 payload는 입력과 같은 `DeleteReactionPayload.reactionId: ID!`를 반환하며 실제 삭제 여부를 공개하지 않는다. service는 유효한 actor를 먼저 검증하고, 현재 행이 타인 소유면 `PERMISSION_DENIED`로 거부하며, Owner 행은 ID와 actor를 조건으로 삭제한다. 이미 없는 ID는 같은 ID를 반환하는 성공 no-op이다. Post visibility는 조회하지 않는다.
- Alternatives Considered: `(postId, type)` input은 actor의 현재 조합만 주소화하지만 타인 소유 행 거부를 표현하지 못하고 오래된 요청의 ABA 삭제를 허용한다. soft delete나 idempotency ledger는 과거 Owner를 증명할 수 있지만 Reaction의 존재 기반 lifecycle과 현재 저장 범위를 확장한다.
- Consequences: 존재하지 않는 Reaction ID의 성공은 과거 소유권을 증명하지 않지만 어떤 현재 행도 변경하지 않는다. 삭제 뒤 같은 조합으로 다시 생성된 Reaction은 새 ID를 가지므로 이전 요청에서 보호된다. Notification cleanup 연결과 필요한 service 결과 확장은 실제 caller를 구현하는 PROD-419가 소유한다.
- Confirmation / Follow-up: GraphQL schema/payload, Owner·non-owner·unavailable Post, 이미 없는 ID, 반복·동시 요청과 삭제 후 같은 조합 재생성을 core/API test로 검증한다.

### Selector는 현재 Reaction 관계를 조회하고 Post와 Type으로 삭제한다

- Decision Date: 2026-07-25
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0016](../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: `Post.reactionProfiles(type:)`는 Profile만 반환하고 ID 기반 `deleteReaction`은 selector가 이전 session·화면에서 생성된 관계를 복원하거나 해제할 수 없게 한다. selector의 의도는 과거 Reaction 객체를 보존하는 것이 아니라 selected Profile의 현재 Type 선택을 관리하는 것이다.
- Decision Outcome: GraphQL은 `Post.viewerReactions: [Reaction!]!`로 현재 selected Profile이 Post에 남긴 Reaction 관계를 제공한다. guest와 selected Profile 부재에는 빈 목록을 반환한다. `deleteReaction(input: { postId: ID!, type: String! })`은 현재 selected Profile의 조합만 원자적으로 삭제한다. payload는 실제 삭제된 관계의 nullable `reactionId`와 현재 조회 가능한 nullable `post`를 반환한다. missing·반복·동시 loser는 `reactionId: null`인 성공이며 다른 Profile과 다른 Type을 변경하지 않는다. 삭제된 ID가 있을 때만 post-commit Notification cleanup을 시도한다.
- Alternatives Considered: Type scalar 목록은 selector에는 충분하지만 Reaction 관계 identity와 기존 Node/cache 경계를 잃는다. ID 입력을 유지하려면 모든 selector consumer가 기존 Reaction ID를 조회·보존해야 한다. soft delete나 idempotency ledger는 낮은 위험의 소셜 상호작용에 불필요한 history와 저장 범위를 추가한다.
- Consequences: 오래 지연된 Post/Type 삭제가 그 사이 같은 조합으로 다시 생성된 현재 Reaction을 제거할 수 있다. 이 ABA 가능성을 수용하고 사용자는 Type을 즉시 다시 선택할 수 있다. selector는 관계 Node의 ID와 Type을 복원하지만 삭제 요청에는 ID를 보존할 필요가 없다.
- Confirmation / Follow-up: schema와 API test는 selected Profile별 목록, guest·Profile 부재, multi-Post batching, Profile 전환, Post/Type 삭제 payload와 다른 Profile/Type 보존을 검증한다. core test는 missing·반복·동시 삭제, 허용된 ABA, actor/Type 검증과 실제 삭제 ID에만 연결되는 Notification cleanup을 검증한다.

### Reaction count는 Post의 non-null simple list로 노출한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-406](https://linear.app/byulmaru/issue/PROD-406/reaction-type%EB%B3%84-%EA%B0%9C%EC%88%98%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4)
- Status: Active
- Context / Problem: canonical과 PROD-406은 viewer-independent Type별 count와 정렬을 고정하지만 GraphQL field와 항목 shape는 구현 전 공개 계약으로 확정되지 않았다.
- Decision Outcome: GraphQL은 `Post.reactionCounts: [ReactionCount!]!`를 제공하고 `ReactionCount`는 `type: String!`과 `count: Int!`만 제공한다. 목록은 현재 Reaction이 하나 이상 존재하는 Type만 포함하며 Reaction이 없으면 빈 목록이다. Type별 Profile connection은 기존 `Post.reactionProfiles`로 분리한다.
- Alternatives Considered: Relay connection은 현재 Type 수가 제한되고 pagination 계약이 없어 불필요한 cursor 표면을 만든다. map 또는 JSON scalar는 Type과 count의 정적 schema 계약을 잃는다. `ReactionSummary` 명칭은 client presentation component와 API aggregate를 혼동시킨다.
- Consequences: API consumer는 서버가 제공한 count 내림차순을 그대로 사용하고 동률 순서에 의존하지 않는다. summary에는 zero-count Type을 합성하지 않으며 selector의 zero-count option 공급은 PROD-417의 별도 결정이다. 이 field는 어느 쪽도 합성하지 않는다.
- Confirmation / Follow-up: schema test와 PROD-406 integration test에서 non-null list·항목 shape, 빈 목록, viewer-independent 집계, 정렬, 삭제와 Post visibility를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-20의 “안정적인 `reaction_type` identity를 참조한다”와 “built-in Type UUID를 database가 생성한다” 결정은 상위 canonical/Linear에 없는 사용자 정의 Reaction 확장을 전제로 했으므로 2026-07-21의 “Reaction Type은 현재 canonical 문자열로 저장한다” 결정으로 대체됐다.
- PostgreSQL enum과 `text + CHECK` 제안은 허용 목록 변경을 schema migration에 결합하므로 채택하지 않았다.
- 2026-07-21의 “Reaction 삭제는 관계의 global ID로 식별한다” 결정은 selector의 현재 상태 복원·해제 계약을 충족하지 못하므로 2026-07-25의 Post/Type 삭제 결정으로 대체됐다.
