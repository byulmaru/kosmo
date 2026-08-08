## MODIFIED Requirements

### Requirement: Media gallery 상호작용 경계

**Authority / Provenance:** `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-626, PROD-650 — 일반 목록·상세의 interactive Post Media gallery는 공개된 정상 이미지 tile을 같은 Post의 Media Viewer를 여는 독립적인 control로 MUST 제공한다. Tile은 선택한 Media의 document index를 전달하고 이미지 맥락과 viewer 진입 목적을 접근 가능한 이름으로 MUST 전달하며, Post shortcut·상세 navigation과 중첩된 interactive semantics를 만들거나 함께 실행하지 MUST NOT 한다. Sensitive Media 공개·다시 가리기와 실패한 이미지 재시도 control은 독립적인 role, accessible name, state와 입력 동작을 MUST 유지한다. 비대화형 Reply Composer 부모 preview는 같은 개수별 gallery 배치를 사용하되 viewer 진입을 포함한 내부 control을 MUST NOT 표시한다.

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
