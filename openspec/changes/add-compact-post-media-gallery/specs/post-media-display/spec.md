## ADDED Requirements

### Requirement: Media gallery 상호작용 경계

**Authority / Provenance:** `docs/design/accessibility.md`, PROD-626 — 공용 Post Media gallery는 이번 계약에서 이미지 tile 자체를 새 button이나 link로 만들지 MUST NOT 하며, Post shortcut·상세 navigation과 중첩된 interactive semantics를 만들지 MUST NOT 한다. 일반 목록·상세의 interactive gallery는 Sensitive Media 공개·다시 가리기와 실패한 이미지 재시도 control의 독립적인 role, accessible name, state와 입력 동작을 MUST 유지한다. 비대화형 Reply Composer 부모 preview는 같은 개수별 gallery 배치를 사용하되 내부 control을 MUST NOT 표시한다.

#### Scenario: 일반 이미지 tile

- **WHEN** 사용자가 목록이나 상세에서 정상적으로 표시된 이미지 tile을 탐색한다
- **THEN** tile은 별도 button이나 link role 없이 이미지의 접근 가능한 설명만 제공한다
- **AND** Post의 기존 shortcut과 상세 navigation 의미를 중첩하거나 대체하지 않는다

#### Scenario: gallery 안의 기존 control

- **WHEN** gallery가 Sensitive Media 공개·다시 가리기 또는 실패한 이미지 재시도 action을 표시한다
- **THEN** 각 action은 기존 접근 가능한 이름·상태와 Web keyboard 및 iOS·Android touch·screen reader 동작을 유지한다
- **AND** action 실행은 주변 Post navigation을 함께 실행하지 않는다

#### Scenario: 비대화형 Reply Composer 부모 preview

- **WHEN** Reply Composer가 부모 Post Media를 비대화형 preview로 표시한다
- **THEN** preview는 같은 개수별 gallery 배치와 이미지 설명을 사용한다
- **AND** Sensitive Media는 가려진 상태를 유지하며 공개·재시도 같은 내부 action을 표시하지 않는다

## MODIFIED Requirements

### Requirement: Media surface 비율

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/breakpoints.md`, PROD-571, PROD-626 — 공용 Post Media UI는 현재 Post Content의 Media 개수와 document 순서에 따라 목록과 상세에서 같은 surface를 MUST 사용한다. 한 장은 기존 Post body surface 폭과 원본 비율 규칙을 MUST 유지한다. 두 장은 token gap이 차지하는 폭을 제외한 이미지 영역을 2:1로 두고 같은 크기의 정사각 tile 두 개를 한 행에 배치하며, gallery 높이는 정사각 tile 한 변으로 결정해야 한다. 세 장은 전체 16:9 surface에서 첫 이미지를 왼쪽 전체 높이에 두고 나머지를 오른쪽 위·아래에 둔 1+2 분할, 네 장은 전체 1:1 surface의 동일한 2×2 분할을 MUST 사용한다. 다중 이미지 tile은 공용 theme token의 간격·radius 안에서 외곽 border 없이 `cover`로 경계를 채우되 원본을 늘이거나 찌그러뜨리지 MUST NOT 하며 gallery는 Post body 폭과 작은 viewport를 초과하지 MUST NOT 한다.

#### Scenario: 한 장의 가로 또는 정사각형 이미지

- **WHEN** 현재 Post Content가 한 장의 이미지를 가지며 원본 `width / height`가 1 이상이다
- **THEN** Media frame은 surface 폭을 채우고 원본 종횡비를 유지한다

#### Scenario: 한 장의 세로 이미지

- **WHEN** 현재 Post Content가 한 장의 이미지를 가지며 원본 `width / height`가 1보다 작다
- **THEN** Media frame은 surface 폭과 같은 높이의 1:1 경계를 사용한다
- **AND** 이미지는 해당 경계를 채우도록 중앙 기준으로 crop된다

#### Scenario: 두 장의 이미지

- **WHEN** 현재 Post Content가 두 장의 이미지를 가진다
- **THEN** gallery는 token gap을 제외한 이미지 영역을 2:1로 사용한다
- **AND** document 순서대로 같은 크기의 정사각 tile 두 개를 한 행에 표시한다
- **AND** gallery 높이는 정사각 tile 한 변과 같다

#### Scenario: 세 장의 이미지

- **WHEN** 현재 Post Content가 세 장의 이미지를 가진다
- **THEN** gallery는 전체 16:9 surface에서 document 순서의 첫 이미지를 왼쪽 전체 높이에 표시한다
- **AND** 두 번째와 세 번째 이미지를 오른쪽 위·아래에 같은 크기로 표시한다

#### Scenario: 네 장의 이미지

- **WHEN** 현재 Post Content가 네 장의 이미지를 가진다
- **THEN** gallery는 전체 1:1 surface 안에 document 순서대로 같은 크기의 2×2 tile을 표시한다

#### Scenario: 작은 viewport의 다중 이미지

- **WHEN** 다중 이미지 Post가 Post body 최대 폭보다 작은 Web viewport 또는 iOS·Android 화면에 표시된다
- **THEN** gallery와 모든 tile은 Post body의 사용 가능한 폭 안에서 개수별 geometry와 순서를 유지한다

### Requirement: Sensitive Media 명시적 공개

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-571, PROD-626 — 현재 Post Content document root의 `sensitiveMedia`가 true이면 공용 Post Media UI는 해당 revision의 모든 Media를 기본적으로 MUST 가린다. 일반 목록·상세의 interactive gallery는 사용자가 같은 Post 안에서 이미지를 명시적으로 표시하고 다시 가릴 수 있는 접근 가능한 control을 MUST 제공한다. 비대화형 Reply Composer 부모 preview는 같은 gallery 배치를 사용하되 Sensitive 이미지를 가린 상태로 유지하고 공개 control을 MUST NOT 제공한다. 가림 surface는 한 장일 때 1:1, 두 장은 정사각 tile에서 계산한 gallery 높이, 세 장은 16:9, 네 장은 1:1을 사용해 다중 이미지 공개 전후의 gallery 높이를 MUST 유지한다. 다중 이미지 가림 상태는 실제 gallery tile·내부 gap을 렌더하지 않는 단일 placeholder로 surface 높이만 예약하고 공개 뒤에만 개수별 분할 gallery를 표시해야 한다.

#### Scenario: 한 장의 Sensitive Media 기본 상태

- **WHEN** interactive gallery가 한 장의 Media를 가진 Sensitive Post를 처음 표시한다
- **THEN** 이미지 byte를 load하거나 표시하지 않고 1:1 가림 surface와 설명·표시 action을 제공한다
- **AND** 공개 뒤 이미지는 한 장의 Media surface 비율 계약을 사용한다

#### Scenario: 다중 Sensitive Media 기본 상태

- **WHEN** interactive gallery가 두 장부터 네 장까지의 Media를 가진 Sensitive Post를 처음 표시한다
- **THEN** 이미지 byte를 load하거나 표시하지 않고 해당 개수의 gallery와 같은 높이의 가림 surface와 설명·표시 action을 제공한다
- **AND** 가림 surface는 실제 gallery tile이나 내부 gap 없이 하나의 placeholder로 표시된다

#### Scenario: Sensitive Media 표시와 다시 가리기

- **WHEN** 사용자가 민감한 이미지 표시 action을 실행한다
- **THEN** 같은 Post의 Media가 개수별 분할 gallery로 표시되고 control은 expanded 상태와 다시 가리기 action을 전달한다
- **AND** 다시 가리기 action을 실행하면 같은 Post의 모든 Media가 가려진 기본 surface로 돌아간다
- **AND** Web keyboard focus는 두 상태 전환 뒤에도 같은 visibility control에 유지된다

#### Scenario: 비대화형 Sensitive 부모 preview

- **WHEN** Reply Composer가 Sensitive 부모 Post Media를 비대화형 preview로 표시한다
- **THEN** 이미지 byte를 load하거나 표시하지 않고 해당 개수의 가림 surface를 유지한다
- **AND** 공개 control을 제공하지 않는다

#### Scenario: 일반 Media

- **WHEN** `sensitiveMedia`가 false이거나 생략된다
- **THEN** 별도 공개 action 없이 이미지를 표시한다

### Requirement: Media 로딩 실패 격리와 재시도

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/design/accessibility.md`, `docs/design/post-media-gallery.md`, PROD-571, PROD-626 — 공용 Post Media UI는 URL을 사용할 수 없거나 이미지 로딩이 실패해도 Post 전체 rendering을 MUST NOT 실패시킨다. 일반 목록·상세의 interactive gallery는 현재 viewer-authorized 표시 URL을 다시 로드하는 접근 가능한 재시도 action을 MUST 제공하고, 재시도할 수 있는 오류 fallback은 단일·다중 이미지 모두 시각 오류 설명을 생략한 채 영향받은 이미지 맥락을 action의 accessible name으로 전달해야 한다. URL이 없거나 비대화형 Reply Composer 부모 preview여서 재시도할 수 없는 fallback은 상태 설명을 MUST 제공하고 재시도 action을 MUST NOT 제공한다. 재시도 control은 48 logical unit 높이를 사용하고 분할 tile에서는 전체 높이가 경계 안에 남아야 한다. 이미지별 loading·ready·error 상태는 해당 tile 경계를 채우고 전체 gallery의 geometry·순서·인접 tile 배치를 변경하지 MUST NOT 한다.

#### Scenario: 한 이미지 로딩 실패

- **WHEN** interactive gallery의 여러 Media 중 하나의 URL 로딩이 실패한다
- **THEN** 실패한 tile만 같은 경계 안의 오류 fallback과 재시도 action으로 바뀐다
- **AND** fallback은 시각 오류 설명을 생략하고 영향받은 이미지 맥락을 재시도 action의 accessible name으로 전달한다
- **AND** gallery의 surface 비율·순서·다른 tile 배치는 유지된다
- **AND** 기존 본문, 다른 이미지, Post action과 navigation은 계속 사용할 수 있다

#### Scenario: Media 표시 정보 unavailable

- **WHEN** 현재 Post Content의 필요한 Media 표시 정보가 partial list 대신 unavailable이다
- **THEN** Post는 Media unavailable fallback을 표시하고 본문·Post action·navigation을 유지한다

#### Scenario: 실패한 이미지 재시도

- **WHEN** 사용자가 실패한 Media의 재시도 action을 실행한다
- **THEN** UI는 같은 tile 경계에서 해당 Media의 현재 표시 URL로 새 이미지 load를 시작하고 loading 상태를 전달한다
- **AND** 다시 실패하면 같은 tile의 fallback과 재시도 action으로 돌아간다

#### Scenario: 짧은 분할 tile의 이미지 로딩 실패

- **WHEN** interactive gallery의 오류 tile 높이가 긴 상태 설명과 48 logical unit 재시도 action을 함께 수용하지 못한다
- **THEN** UI는 영향받은 이미지 맥락을 재시도 action의 accessible name으로 전달한다
- **AND** 재시도 action의 전체 48 logical unit 높이를 tile 경계 안에 유지한다
- **AND** gallery surface 비율을 바꾸거나 재시도 action을 축소하지 않는다

#### Scenario: 비대화형 preview의 이미지 로딩 실패

- **WHEN** Reply Composer 부모 preview의 Media URL 로딩이 실패한다
- **THEN** 실패한 tile은 같은 경계 안의 오류 fallback으로 바뀐다
- **AND** 상태 설명을 제공하되 재시도 action은 제공하지 않고 다른 tile과 부모 Post preview를 유지한다
