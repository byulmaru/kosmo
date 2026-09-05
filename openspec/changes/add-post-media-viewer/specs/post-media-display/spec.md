## MODIFIED Requirements

### Requirement: Media gallery 상호작용 경계

**Authority / Provenance:** `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-626, PROD-650 historical, PROD-849 — 일반 목록·상세의 interactive Post Media gallery는 공개된 정상 이미지 tile을 같은 Post의 Media Viewer를 여는 독립적인 control로 MUST 제공한다. Tile은 선택한 Media의 document index를 전달하고 이미지 맥락과 viewer 진입 목적을 접근 가능한 이름으로 MUST 전달하며, Post shortcut·상세 navigation과 중첩된 interactive semantics를 만들거나 함께 실행하지 MUST NOT 한다. Sensitive Media 공개·다시 가리기와 실패한 이미지 재시도 control은 독립적인 role, accessible name, state와 입력 동작을 MUST 유지한다. 비대화형 Reply Composer 부모 preview는 같은 개수별 gallery 배치를 사용하되 viewer 진입을 포함한 내부 control을 MUST NOT 표시한다. 최종 Gallery→Viewer consumer 연결과 Sensitive 전달은 PROD-849가 소유하며 PROD-853 Storybook fixture는 Gallery·permission·Production 연결 완료를 증명하지 않는다.

#### Scenario: 공개된 정상 이미지 tile

- **WHEN** 사용자가 목록이나 상세의 interactive gallery에서 공개된 정상 이미지 tile을 실행한다
- **THEN** tile은 이미지의 document index를 전달해 같은 Post의 Media Viewer를 해당 위치에서 연다
- **AND** tile은 이미지 맥락과 viewer 진입 목적을 보조 기술에 전달한다
- **AND** 주변 Post shortcut이나 상세 navigation을 함께 실행하지 않는다

#### Scenario: gallery 안의 기존 control

- **WHEN** gallery가 Sensitive Media 공개·다시 가리기 또는 실패한 이미지 재시도 action을 표시한다
- **THEN** 각 action은 기존 접근 가능한 이름·상태와 Web keyboard 및 iOS·Android touch·screen reader 동작을 유지한다
- **AND** action 실행은 viewer 또는 주변 Post navigation을 함께 실행하지 않는다

#### Scenario: 비대화형 Reply Composer 부모 preview

- **WHEN** Reply Composer가 부모 Post Media를 비대화형 preview로 표시한다
- **THEN** preview는 같은 개수별 gallery 배치와 이미지 설명을 사용한다
- **AND** Sensitive Media는 가려진 상태를 유지하며 viewer 진입·공개·재시도 같은 내부 action을 표시하지 않는다

### Requirement: Gallery consumer delivery ownership

**Authority / Provenance:** `docs/design/post-media-viewer.md`, PROD-853, PROD-849 — 기존 Gallery를 DSN-63 Target shared Viewer surface consumer로 교체·연결하고 Sensitive 공개 뒤 viewer trigger와 permission 경계를 최종 Production consumer에 반영하는 동작은 PROD-849가 SHALL 소유한다. PROD-853은 연결되지 않은 공용 UI fixture와 그 component·Storybook 검증만 제공해야 하며, 이를 실제 Gallery·permission 완료로 표현 MUST NOT 한다.

#### Scenario: Storybook fixture와 Production consumer 구분

- **WHEN** PROD-853 Storybook에서 공용 Viewer surface를 확인한다
- **THEN** 상태·navigation·secondary surface의 disconnected contract만 확인한다
- **AND** Gallery tile 연결, Sensitive permission 또는 Production route 연결 완료로 해석하지 않는다

#### Scenario: 최종 Gallery consumer 연결

- **WHEN** PROD-849가 기존 Gallery를 shared Viewer surface consumer로 교체하고 Production Post surface에 연결한다
- **THEN** 공개된 정상 tile의 document index와 Sensitive reveal 경계를 실제 consumer에 전달한다
- **AND** 비대화형 Reply Composer 부모 preview와 Gallery 기존 action의 독립 경계를 유지한다
