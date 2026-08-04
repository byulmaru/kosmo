## ADDED Requirements

### Requirement: Web Composer clipboard 이미지 입력

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/design/accessibility.md`, PROD-639. Web 앱은 사용자가 Media 첨부를 지원하는 Post Composer의 본문 입력에 focus한 상태에서 붙여넣은 clipboard image item을 현재 Composer Media 목록에 추가해야 하며(MUST), picker로 고른 이미지와 동일한 최대 4개·추가 순서·직접 업로드·항목 상태·제출 계약을 사용해야 한다(MUST). clipboard source를 이유로 새 MIME·크기·변환 정책이나 별도 업로드 lifecycle을 만들면 안 된다(MUST NOT).

#### Scenario: 이미지 하나를 붙여넣음

- **WHEN** Web 사용자가 Media 슬롯이 남은 Post Composer 본문 입력에 focus하고 browser가 `image/*` File로 제공한 이미지 하나만 붙여넣는다
- **THEN** 앱은 해당 File을 다음 Composer Media item으로 추가한다
- **AND** local preview와 upload 중 상태를 표시한다
- **AND** `issueMediaUploadUrl` → 제한 URL `PUT` → `completeMediaUpload` 순서로 같은 Media를 Ready로 만든다

#### Scenario: 여러 이미지를 남은 슬롯에 붙여넣음

- **WHEN** Web 사용자가 여러 clipboard image item을 붙여넣고 현재 Composer에 일부 Media가 이미 있다
- **THEN** 앱은 clipboard item 순서를 유지해 남은 슬롯 수까지만 하나의 Composer Media 목록 뒤에 추가한다
- **AND** Composer 목록은 picker와 paste source를 합쳐 최대 4개를 초과하지 않는다
- **AND** 슬롯을 초과한 clipboard item을 위해 Media upload를 시작하지 않는다

#### Scenario: picker와 paste Media를 함께 제출함

- **WHEN** 사용자가 picker와 clipboard paste로 추가한 Media를 모두 Ready로 만든 뒤 Post를 제출한다
- **THEN** 앱은 source와 무관하게 Composer 추가 순서의 `{ mediaId, altText }` item을 `createPost`에 전달한다
- **AND** preview·Alt Text·Sensitive Media·제거·성공 후 초기화 계약을 모든 item에 동일하게 적용한다

#### Scenario: 붙여넣은 이미지 업로드가 거부됨

- **WHEN** 붙여넣은 image File이 기존 Media Storage Service의 형식·크기·이미지 검증 또는 upload lifecycle을 통과하지 못한다
- **THEN** 앱은 해당 item을 기존 Composer 업로드 실패 상태와 오류 경계로 전환한다
- **AND** 사용자는 picker item과 동일하게 새 Uploading Media로 재시도하거나 item을 제거할 수 있다
- **AND** 실패 item이 남아 있는 동안 Ready Media만 골라 Post를 제출하지 않는다

#### Scenario: 지원하는 공용 Composer Web surface

- **WHEN** 일반 Post 또는 현재 공용 Post Composer Media 경계를 사용하는 다른 지원 Web surface에서 본문 입력에 image-only paste가 발생한다
- **THEN** surface는 같은 clipboard 이미지 첨부 결과와 Media lifecycle을 제공한다
- **AND** 이 변경만으로 Reply 전용 Media 버그나 별도 Composer 구현을 추가하지 않는다

### Requirement: Web 기본 paste와 platform 경계 보존

**Authority / Provenance:** `docs/design/accessibility.md`, PROD-639. Web 앱은 현재 focus된 지원 Composer 본문 입력의 clipboard payload에 image item이 없으면 browser의 기본 Plain Text·링크 붙여넣기를 유지해야 하며(MUST), Composer 밖의 paste나 Android·iOS OS clipboard를 이 capability가 가로채면 안 된다(MUST NOT).

#### Scenario: Plain Text를 붙여넣음

- **WHEN** 사용자가 focus된 Web Composer 본문 입력에 image item이 없는 Plain Text를 붙여넣는다
- **THEN** browser 기본 paste가 현재 selection에 텍스트를 삽입한다
- **AND** 앱은 Media item이나 upload 요청을 만들지 않는다

#### Scenario: 링크를 붙여넣음

- **WHEN** 사용자가 focus된 Web Composer 본문 입력에 image item이 없는 URL 텍스트를 붙여넣는다
- **THEN** 기존 Plain Text editor가 URL을 그대로 붙여넣는다
- **AND** 앱은 링크를 이미지 또는 rich-text HTML로 변환하지 않는다

#### Scenario: Composer 밖에 붙여넣음

- **WHEN** Web paste가 지원 Composer 본문 입력에 focus되지 않은 상태에서 발생한다
- **THEN** Post Composer는 Media item이나 upload 요청을 만들지 않는다
- **AND** 실제 event target의 기본 paste 동작을 방해하지 않는다

#### Scenario: Native Composer 입력

- **WHEN** Android 또는 iOS 사용자가 Post Composer 본문 입력을 사용한다
- **THEN** 이 capability는 OS clipboard 이미지 접근이나 paste listener를 추가하지 않는다
- **AND** 기존 Native 본문 입력과 picker Media 계약을 유지한다
