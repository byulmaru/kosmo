## ADDED Requirements

### Requirement: Account identity에 연결된 Post 상호작용 분석

**Authority / Provenance:** `docs/operations/openpanel.md`, Linear `PROD-469`, Linear `PROD-539` — Kosmo Web은 성공한 재게시·반응·북마크 이벤트를 현재 OpenPanel의 opaque Account identity에 MUST 연결해야 한다. Account ID는 identity로만 사용하고 각 event property에 MUST 중복 전송하지 않아야 한다.

#### Scenario: 식별된 Account가 Post 상호작용을 완료한다

- **WHEN** OpenPanel이 opaque Account ID로 identify된 상태에서 재게시·반응·북마크 mutation이 성공한다
- **THEN** 대응 이벤트는 같은 Account identity의 행동으로 기록되고 Account ID property를 포함하지 않는다

#### Scenario: 같은 Account가 기간을 두고 반응을 반복한다

- **WHEN** 같은 opaque Account identity가 서로 다른 시점에 반응 mutation을 성공한다
- **THEN** 각 성공 이벤트는 같은 Account의 distinct 사용·빈도·cohort·retention 분석에 사용할 수 있는 identity 연결을 유지한다

### Requirement: 재게시 생성·취소 event taxonomy

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, Linear `PROD-539` — Kosmo Web은 재게시 생성 또는 취소가 서버 확정 성공한 뒤 `repost_succeeded`를 mutation 결과마다 정확히 한 번 MUST 기록해야 한다. 생성은 `result: "created"`, 취소는 `result: "removed"`만 MUST 사용해야 한다.

#### Scenario: 재게시 생성이 성공한다

- **WHEN** 선택 Profile의 재게시 생성 mutation이 서버 확정 성공한다
- **THEN** `repost_succeeded`가 `{ result: "created" }`만 포함해 한 번 기록된다

#### Scenario: 재게시 취소가 성공한다

- **WHEN** 선택 Profile의 기존 재게시 취소 mutation이 서버 확정 성공한다
- **THEN** `repost_succeeded`가 `{ result: "removed" }`만 포함해 한 번 기록된다

### Requirement: 기본·커스텀 반응 event taxonomy

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/design/reactions.md`, Linear `PROD-539` — Kosmo Web은 Reaction 추가 성공 뒤 `reaction_added`, 삭제 성공 뒤 `reaction_removed`를 mutation 결과마다 정확히 한 번 MUST 기록해야 한다. 두 이벤트의 유일한 property인 `reaction_type`은 `"default" | "custom"`만 허용해야 한다. 현재 canonical catalog의 `❤️`는 `default`, 다른 허용 Type인 `🥹`, `🎉`, `👀`, `☘️`, `🌈`는 `custom`으로 분류해야 한다. 향후 canonical catalog가 확장되더라도 별도 기본 반응으로 승인되지 않은 Type과 custom emoji는 식별 정보 없이 `custom`으로 분류해야 한다.

#### Scenario: 기본 반응을 추가한다

- **WHEN** `❤️` Reaction 추가 mutation이 서버 확정 성공한다
- **THEN** `reaction_added`가 `{ reaction_type: "default" }`만 포함해 한 번 기록된다

#### Scenario: 커스텀 반응을 추가한다

- **WHEN** 현재 canonical catalog의 `❤️`가 아닌 Reaction 추가 mutation이 서버 확정 성공한다
- **THEN** `reaction_added`가 `{ reaction_type: "custom" }`만 포함해 한 번 기록된다

#### Scenario: 반응을 삭제한다

- **WHEN** 현재 canonical Reaction 삭제 mutation이 서버 확정 성공한다
- **THEN** `reaction_removed`가 삭제한 Type의 `default | custom` 분류만 포함해 한 번 기록된다

#### Scenario: Reaction catalog가 확장된다

- **WHEN** 향후 canonical 계약이 새 Reaction Type 또는 custom emoji를 허용하고 이를 별도 기본 반응으로 승인하지 않는다
- **THEN** 계측은 해당 Type을 `custom`으로 분류하고 emoji ID·이름·shortcode·원문을 전송하지 않는다

### Requirement: 북마크 추가·취소 event taxonomy

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `docs/design/post-action-bar.md`, Linear `PROD-539` — Kosmo Web은 Bookmark 추가 성공 뒤 `bookmark_added`, 삭제 성공 뒤 `bookmark_removed`를 mutation 결과마다 정확히 한 번 MUST 기록해야 한다. 두 이벤트는 명시적 property를 MUST 포함하지 않아야 한다.

#### Scenario: 북마크 추가가 성공한다

- **WHEN** 선택 Profile의 Bookmark 추가 mutation이 서버 확정 성공한다
- **THEN** `bookmark_added`가 property 없이 한 번 기록된다

#### Scenario: 북마크 취소가 성공한다

- **WHEN** 선택 Profile의 Bookmark 삭제 mutation이 서버 확정 성공한다
- **THEN** `bookmark_removed`가 property 없이 한 번 기록된다

### Requirement: 서버 확정 성공 경계와 분석 장애 격리

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/reactions.md`, Linear `PROD-469`, Linear `PROD-539` — Kosmo Web은 기존 action 계약이 mutation 결과를 성공으로 확정한 뒤에만 대응 이벤트를 MUST 기록해야 한다. 성공 payload가 없는 응답과 network 오류는 성공 이벤트를 MUST 만들지 않아야 하며, OpenPanel 초기화·전송 실패는 mutation 결과, Relay 상태와 기존 사용자 오류 처리를 MUST 바꾸지 않아야 한다.

#### Scenario: mutation이 실패한다

- **WHEN** 재게시·반응·북마크 mutation이 성공 payload 없이 완료되거나 network 오류로 실패한다
- **THEN** 대응 성공 이벤트가 기록되지 않고 기존 실패 상태와 재시도 동작이 유지된다

#### Scenario: Reaction payload와 부분 GraphQL 오류가 함께 온다

- **WHEN** Reaction mutation이 authoritative payload를 반환하고 별개의 GraphQL 오류도 함께 반환한다
- **THEN** 기존 Reaction 계약대로 payload 결과를 성공으로 적용하고 대응 이벤트를 한 번 기록한다

#### Scenario: 분석 전송이 실패한다

- **WHEN** 성공한 mutation 뒤 OpenPanel 호출이 throw 또는 reject한다
- **THEN** mutation 성공, Relay 정규화와 기존 UI 완료 상태는 분석이 없는 경우와 동일하게 유지된다

### Requirement: 최소 event property와 대상 비식별

**Authority / Provenance:** `docs/operations/openpanel.md`, Linear `PROD-469`, Linear `PROD-539` — Kosmo Web의 PROD-539 이벤트는 `repost_succeeded.result`와 반응 이벤트의 `reaction_type` 외 property를 MUST 보내지 않아야 한다. 특히 대상 Post ID, 대상·선택 Profile ID, Post 콘텐츠, 구체 Reaction 값, custom emoji ID·이름·shortcode·원문, 오류 원문, 이름·handle·이메일 trait를 MUST 포함하지 않아야 한다.

#### Scenario: 이벤트 payload를 전송한다

- **WHEN** PROD-539의 어떤 성공 이벤트든 OpenPanel로 전달된다
- **THEN** event name에 허용된 고정 property만 존재하고 대상·콘텐츠·직접 식별 정보는 존재하지 않는다

#### Scenario: custom 반응을 분류한다

- **WHEN** 허용된 비기본 Reaction 또는 향후 custom emoji의 성공 행동을 계측한다
- **THEN** `reaction_type: "custom"`만 전송되고 실제 emoji 식별 값은 전송되지 않는다
