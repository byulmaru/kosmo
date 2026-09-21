## ADDED Requirements

### Requirement: Account identity에 연결된 Post 상호작용 분석

**Authority / Provenance:** `docs/domain/objects/account.md`, `docs/domain/objects/reaction.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·개인정보 경계, [PROD-795](https://linear.app/byulmaru/issue/PROD-795)의 identity 통합, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 공개 identify/reset 계약 — Kosmo Web은 로그인 뒤 내부 불변 Account ID로 identify된 PostHog identity에 성공한 재게시·반응·북마크 이벤트를 MUST 연결해야 한다. Account ID를 명시적 이벤트 속성에 MUST 중복 전송하지 않아야 한다.

#### Scenario: 식별된 Account가 Post 상호작용을 완료한다

- **WHEN** PostHog가 내부 불변 Account ID로 identify된 상태에서 해당 Account의 재게시·반응·북마크 mutation이 성공한다
- **THEN** 대응 이벤트는 같은 Account에 귀속되고 명시적 속성에는 Account ID를 넣지 않는다

#### Scenario: 같은 Account가 다른 Profile로 행동을 반복한다

- **WHEN** 같은 Account가 selected Profile을 바꾸거나 다른 시점에 반응 mutation을 성공한다
- **THEN** 이벤트는 같은 Account의 행동으로 분석할 수 있으며 대상·선택 Profile ID를 명시적 속성에 넣지 않는다

### Requirement: 재게시 생성·취소 event taxonomy

**Authority / Provenance:** `docs/domain/objects/post.md`의 재게시·삭제 행동, `docs/design/post-action-bar.md`의 Repost action menu·실패 처리, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·성공 경계 — Kosmo Web은 재게시 생성 또는 취소의 서버 확정 성공 결과마다 `repost_succeeded`를 정확히 한 번 MUST 호출해야 한다. 명시적 속성은 생성 시 `{ result: "created" }`, 취소 시 `{ result: "removed" }`만 MUST 전달해야 한다.

#### Scenario: 재게시 생성이 성공한다

- **WHEN** 선택 Profile의 재게시 생성 mutation이 성공 payload를 반환하고 기존 action이 성공으로 판정한다
- **THEN** `repost_succeeded`를 명시적 속성 `{ result: "created" }`로 한 번 호출한다

#### Scenario: 재게시 취소가 성공한다

- **WHEN** 선택 Profile의 기존 재게시 취소 mutation이 성공 payload를 반환하고 기존 action이 성공으로 판정한다
- **THEN** `repost_succeeded`를 명시적 속성 `{ result: "removed" }`로 한 번 호출한다

#### Scenario: 메뉴를 열거나 pending 중 다시 누른다

- **WHEN** 사용자가 메뉴만 열거나 pending 차단으로 새 mutation을 시작하지 못한다
- **THEN** 그 입력만으로는 성공 이벤트를 추가하지 않는다

### Requirement: 기본·커스텀 반응 event taxonomy

**Authority / Provenance:** `docs/domain/objects/reaction.md`의 허용 Type·멱등 행동, `docs/design/reactions.md`의 서버 확정 상태, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의 — Kosmo Web은 Reaction 추가 성공 뒤 `reaction_added`, 삭제 성공 뒤 `reaction_removed`를 mutation 성공 결과마다 정확히 한 번 MUST 호출해야 한다. 명시적 속성은 `reaction_type: "default" | "custom"`만 MUST 허용해야 한다. 현재 `❤️`는 `default`, `🥹`·`🎉`·`👀`·`☘️`·`🌈`는 `custom`으로 MUST 분류해야 한다. 향후 별도 기본 반응으로 승인되지 않은 Type과 custom emoji도 식별 정보 없이 `custom`으로 MUST 분류해야 한다.

#### Scenario: 기본 반응을 추가한다

- **WHEN** `❤️` Reaction 추가 mutation이 서버 확정 성공한다
- **THEN** `reaction_added`를 명시적 속성 `{ reaction_type: "default" }`로 한 번 호출한다

#### Scenario: 현재 비기본 반응을 추가한다

- **WHEN** 현재 catalog에 있는 `🥹`·`🎉`·`👀`·`☘️`·`🌈` 중 하나를 추가하는 mutation이 서버 확정 성공한다
- **THEN** `reaction_added`를 명시적 속성 `{ reaction_type: "custom" }`으로 한 번 호출한다

#### Scenario: 반응을 삭제한다

- **WHEN** Reaction 삭제 mutation이 서버 확정 성공한다
- **THEN** `reaction_removed`를 삭제 요청 Type의 `default | custom` 분류만 명시적 속성에 넣어 한 번 호출한다

#### Scenario: 멱등 성공 payload를 받는다

- **WHEN** 기존 Reaction을 유지하는 추가 또는 이미 없는 Reaction의 삭제가 canonical 계약에 따른 성공 payload를 반환한다
- **THEN** 해당 mutation의 성공 결과에 대응하는 이벤트를 한 번 호출하고 실제 관계 증감 여부를 추측해 별도 이벤트를 만들지 않는다

#### Scenario: Reaction catalog가 확장된다

- **WHEN** 향후 canonical 계약이 새 Type 또는 custom emoji를 허용하고 별도 기본 반응으로 승인하지 않는다
- **THEN** 해당 반응은 `custom`으로 분류하며 emoji ID·이름·shortcode·원문을 명시적 속성에 보내지 않는다

### Requirement: 북마크 추가·취소 event taxonomy

**Authority / Provenance:** `docs/domain/objects/bookmark.md`의 추가·삭제 행동, `docs/design/post-action-bar.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·성공 경계 — Kosmo Web은 Bookmark 추가의 서버 확정 성공 뒤 `bookmark_added`, 삭제의 서버 확정 성공 뒤 `bookmark_removed`를 각각 정확히 한 번 MUST 호출해야 한다. 두 이벤트에는 명시적 속성을 MUST 추가하지 않아야 한다.

#### Scenario: 북마크 추가가 성공한다

- **WHEN** 선택 Profile의 Bookmark 추가 mutation이 성공 payload를 반환하고 기존 action이 성공으로 판정한다
- **THEN** `bookmark_added`를 명시적 속성 없이 한 번 호출한다

#### Scenario: 북마크 취소가 성공한다

- **WHEN** 선택 Profile의 Bookmark 삭제 mutation이 성공 payload를 반환하고 기존 action이 성공으로 판정한다
- **THEN** `bookmark_removed`를 명시적 속성 없이 한 번 호출한다

### Requirement: 서버 확정 성공 경계와 분석 장애 격리

**Authority / Provenance:** `docs/design/post-action-bar.md`의 기존 실패 처리, `docs/design/reactions.md`의 mutation과 서버 확정 상태, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 성공 경계, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 fail-open 경계 — Kosmo Web은 기존 action이 성공으로 판정한 서버 payload 뒤에만 대응 이벤트를 MUST 호출해야 한다. 실패, 성공 payload가 없는 응답, network 오류에서는 성공 이벤트를 MUST 호출하지 않아야 한다. PostHog 설정 누락·초기화·전송 실패는 mutation 결과, Relay 상태와 기존 사용자 오류 처리를 MUST 바꾸지 않아야 한다.

#### Scenario: callback에는 오류가 없지만 성공 payload가 없다

- **WHEN** 재게시 또는 북마크 생성의 완료 callback이 GraphQL 오류 없이 호출되지만 성공 payload는 없다
- **THEN** 성공 이벤트를 호출하지 않으며 계측을 이유로 기존 제품 오류 처리를 변경하지 않는다

#### Scenario: mutation이 실패한다

- **WHEN** action이 서버 결과를 실패로 판정하거나 network 오류가 발생한다
- **THEN** 대응 성공 이벤트를 호출하지 않고 기존 실패·재시도 동작을 유지한다

#### Scenario: 북마크 삭제가 요청 대상을 확인한다

- **WHEN** 북마크 삭제 응답이 요청한 Bookmark를 성공 payload로 확인하고 기존 action이 성공으로 판정한다
- **THEN** 별개 필드의 GraphQL 오류가 있더라도 `bookmark_removed`를 명시적 속성 없이 한 번 호출한다

#### Scenario: 북마크 삭제 응답이 요청 대상을 확인하지 못한다

- **WHEN** 북마크 삭제 응답에 요청한 Bookmark를 확인하는 성공 payload가 없다
- **THEN** 성공 이벤트를 호출하지 않고 기존 실패 처리를 유지한다

#### Scenario: Reaction payload와 부분 GraphQL 오류가 함께 온다

- **WHEN** Reaction mutation의 필요한 성공 payload와 별개의 GraphQL 오류가 함께 반환된다
- **THEN** 기존 Reaction 계약대로 서버 상태를 적용하고 대응 이벤트를 한 번 호출한다

#### Scenario: 성공 결과 하나를 여러 렌더링에서 소비한다

- **WHEN** 같은 mutation의 성공 결과가 상태 갱신이나 재렌더링으로 다시 관찰된다
- **THEN** 그 결과의 성공 이벤트를 중복 호출하지 않는다

#### Scenario: 분석이 비활성화되거나 전송에 실패한다

- **WHEN** 설정 누락으로 PostHog가 비활성화되거나 성공 mutation 뒤 SDK 호출이 throw 또는 reject한다
- **THEN** mutation 성공, Relay 정규화와 기존 UI 완료 상태를 유지한다

### Requirement: 명시적 event property의 최소 수집

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 개인정보 경계, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 typed custom event·SDK 표준 metadata 경계 — Kosmo Web은 이 change의 명시적 속성을 `repost_succeeded.result`와 반응 이벤트의 `reaction_type`으로 MUST 제한해야 한다. Account ID, 대상 Post ID, 대상·선택 Profile ID, Post 콘텐츠, 구체 Reaction 값, custom emoji ID·이름·shortcode·원문, 오류 원문과 이름·handle·이메일 trait를 명시적 속성에 MUST 포함하지 않아야 한다. 이 제한을 SDK 표준 metadata를 제거하는 전역 필터로 MUST 확대하지 않아야 한다.

#### Scenario: 명시적 이벤트 속성을 전달한다

- **WHEN** 이 change의 이벤트를 공용 analytics 경계에 전달한다
- **THEN** 이벤트별 허용 속성만 존재하며 북마크 이벤트에는 명시적 속성이 없다

#### Scenario: SDK가 identity와 표준 metadata를 결합한다

- **WHEN** PostHog가 custom event에 SDK 소유 identity와 표준 metadata를 결합한다
- **THEN** PROD-819의 표준 metadata 수집과 별도 Replay 보호 계약을 유지하고 PROD-539의 속성 제한을 이유로 SDK 필드를 일괄 제거하지 않는다
