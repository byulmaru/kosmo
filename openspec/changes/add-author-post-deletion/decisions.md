## Context

이 기록은 PROD-598의 승인된 Domain/Issue Gate, `docs/domain/objects/post.md`의 Account 요청 Post 삭제, `docs/design/post-action-bar.md`의 Post 삭제 More menu와 접근성 계약을 구현자가 지켜야 할 결정으로 정리한다. 기존 Core/GraphQL 경계와 새 사용자 surface를 연결하되 `add-post-action-bar`의 링크 복사·통합 생명주기와는 독립적으로 완료한다.

## Decision Records

### 기존 Core 삭제 계약과 GraphQL resolver 경계를 재사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-598`
- Status: Active
- Context / Problem: Post 삭제 service와 GraphQL mutation이 이미 있는데 사용자 surface 추가를 이유로 Core·DB·schema를 다시 만들면 같은 lifecycle과 권한 계약이 중복된다.
- Decision Outcome: Account 요청은 `usingProfile`으로 검증된 selected Profile과 concrete Post ID를 기존 Core 삭제 service에 전달하고, 성공 payload로 삭제된 Post의 global `postId`를 반환하는 현재 GraphQL 경계를 재사용한다. 현재 구현이 이 결과를 이미 만족하면 새 backend source diff를 강제하지 않고 integration evidence로 완료를 증명한다.
- Alternatives Considered: 새 삭제 mutation이나 별도 UI 전용 service를 추가하는 방식은 기존 공개 계약을 중복하므로 채택하지 않았다. Core/DB를 함께 재구현하는 방식은 승인된 제외 범위라 채택하지 않았다.
- Consequences: backend 작업은 resolver 경계 재검증과 필요한 최소 test 보완에 한정된다. GraphQL schema, DB migration과 Core lifecycle 변경은 없다.
- Confirmation / Follow-up: Author·비Author·guest·잘못된 concrete ID와 global `postId` payload를 API integration evidence에서 확인한다.

### 케밥 icon은 작성자 삭제 More menu를 연다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-598`
- Status: Active
- Context / Problem: 케밥 icon을 직접 삭제 button으로 해석하면 기존 More action 의미와 확인 단계를 우회하고, guest·다른 Profile에도 destructive affordance가 노출될 수 있다.
- Decision Outcome: `MoreHorizontal`은 `더 보기` ActionMenu trigger이며, selected Profile이 Action Bar target의 Author이고 target이 Active contentful Post일 때만 `삭제` item을 표시한다. 링크 복사가 함께 있으면 삭제를 마지막 danger item으로 둔다.
- Alternatives Considered: icon 활성화 즉시 삭제하거나 권한 없는 viewer에게 disabled item을 표시하는 방식은 승인된 확인·노출 계약과 맞지 않아 채택하지 않았다.
- Consequences: 현재 삭제 item이 하나도 없고 링크 복사도 아직 연결되지 않은 surface에서는 More trigger를 표시할 이유가 없다. 후속 링크 복사는 같은 item 배열 앞에 결합할 수 있다.
- Confirmation / Follow-up: 일반 Post·Reply·Quote·Reply이면서 Quote와 guest·다른 Profile·Tombstone·Content 없는 Repost fixture를 검증한다.

### 순수 Repost의 삭제 target은 direct Source다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-598`
- Status: Active
- Context / Problem: 순수 Repost surface는 Source 콘텐츠와 Source Action Bar를 표시하므로 바깥 Repost ID와 Source ID 중 어느 것을 More 삭제가 사용해야 하는지 일관되어야 한다.
- Decision Outcome: 기존 Action Bar 배치 계약과 같이 More 삭제 eligibility, Author 비교와 mutation ID는 direct Repost Source를 사용한다. 바깥 Repost 취소는 Repost action menu가 계속 소유한다.
- Alternatives Considered: More 삭제가 바깥 Repost를 지우는 방식은 Repost 취소와 중복되고 표시 콘텐츠의 Author 삭제 의미와 어긋나므로 채택하지 않았다.
- Consequences: cache update는 target Source뿐 아니라 현재 표시한 pure Repost representation이 eligibility를 잃는 결과도 처리해야 한다.
- Confirmation / Follow-up: Source Author와 Repost Author가 다른 fixture에서 정확한 menu 노출과 mutation ID를 확인한다.

### 확인 뒤 단일 실행하고 pending에는 입력을 잠근다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `PROD-598`
- Status: Active
- Context / Problem: Post 삭제는 복구를 제공하지 않는 destructive action이므로 menu 선택만으로 실행하거나 pending 중 중복 요청을 허용하면 사용자가 의도하지 않은 삭제와 focus 혼란이 생긴다.
- Decision Outcome: menu 선택은 확인 dialog만 열고 `삭제` 확인으로 mutation을 한 번 실행한다. 확인 copy는 `게시글을 삭제할까요?`, `삭제한 게시글은 복구할 수 없습니다.`, `취소`, `삭제`로 고정하며 안전한 취소에 초기 focus를 둔다. pending에는 action과 dismiss를 잠그고 busy 상태를 노출한다.
- Alternatives Considered: native에서만 system alert를 사용해 플랫폼별 copy·focus를 달리하는 방식과 확인 없는 즉시 실행은 Web·Native 공통 계약을 깨뜨려 채택하지 않았다.
- Consequences: menu dismiss focus와 dialog initial focus 순서를 조정해야 하며, 성공하면 제거되는 trigger에 focus를 복구하지 않는다.
- Confirmation / Follow-up: Web keyboard/Escape와 Native back/backdrop, pending 중복 활성화와 접근성 state를 검증한다.

### 서버 성공 뒤 현재 actor Store만 갱신한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-598`
- Status: Active
- Context / Problem: optimistic 삭제는 실패 시 여러 목록 edge와 상세 상태를 복원해야 하고, selected Profile 전환 뒤 이전 callback이 새 Store를 바꾸면 actor 격리가 깨진다.
- Decision Outcome: optimistic cache 삭제를 사용하지 않고 성공 payload의 `postId`를 확인한 뒤 요청을 시작한 현재 Relay actor Store의 목록·상세만 갱신한다. 실패에는 cache를 유지하고 dialog와 한국어 alert toast를 재시도 가능한 상태로 복구한다.
- Alternatives Considered: mutation 시작 시 record 제거는 복구 비용과 오류 위험 때문에 채택하지 않았다. 모든 actor Store를 초기화하는 방식은 다른 Profile의 독립 cache를 불필요하게 버리므로 채택하지 않았다.
- Consequences: 성공 updater 또는 surface refetch가 비관리 connection, reply thread와 pure Repost Source representation을 명시적으로 검증해야 한다. 구체 Relay cleanup mechanism은 spec 결과를 만족하는 범위에서 구현이 선택할 수 있다.
- Confirmation / Follow-up: Home·Profile 목록, 상세, actor 전환, network/GraphQL 실패와 재시도 payload test를 분리해 확인한다.

### More menu의 도메인 상태는 private child가 소유한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-598`
- Status: Active
- Context / Problem: 목록과 상세 surface마다 Author 비교, menu, mutation과 pending을 조립하면 계약이 중복되고 `PostActionBar` container가 target 정책과 mutation payload를 직접 알게 될 수 있다.
- Decision Outcome: Repost action과 같은 private child 경계가 target Post fragment, selected Profile 비교, ActionMenu, 확인과 deletion mutation state를 함께 소유한다. `PostActionBar`는 고정 순서와 공통 control 조립 책임을 유지한다.
- Alternatives Considered: 각 surface가 callback과 modal state를 따로 만드는 방식은 목록·상세 drift가 생겨 채택하지 않았다. toolbar container에 모든 mutation 로직을 인라인하는 방식은 child ownership을 깨뜨려 채택하지 않았다.
- Consequences: 공용 ActionMenu는 optional destructive presentation만 확장하고, Post 삭제 domain 의미는 post feature child에 남는다.
- Confirmation / Follow-up: 목록·상세가 같은 child fragment와 mutation identity를 사용하는지 component test에서 확인한다.

### PROD-598 change를 Action Bar 통합 change와 독립적으로 완료한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-598`
- Status: Active
- Context / Problem: active `add-post-action-bar` change는 링크 복사 외 More 항목을 제외하고 여러 선행 action의 최종 통합을 기다리므로 author deletion을 그 생명주기에 결합하면 독립 구현·검증·출시가 지연된다.
- Decision Outcome: `add-author-post-deletion`은 PROD-598의 삭제 menu·확인·cache 동기화와 통합 증거만 소유하며, 완료 조건이 충족되면 PROD-598이 archive한다. PROD-432의 링크 복사와 전체 Action Bar archive 책임은 그대로 남긴다.
- Alternatives Considered: 기존 `add-post-action-bar` tasks에 삭제를 추가하는 방식은 서로 다른 범위와 완료 시점을 결합하므로 채택하지 않았다.
- Consequences: 같은 component를 수정하더라도 각 change의 spec과 task는 자기 행동 계약만 검증한다. 후속 통합은 이미 구현된 삭제 item을 회귀시키지 않아야 한다.
- Confirmation / Follow-up: 이 change의 tasks와 PR이 PROD-598 범위만 포함하고 독립 archive evidence를 남긴다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
