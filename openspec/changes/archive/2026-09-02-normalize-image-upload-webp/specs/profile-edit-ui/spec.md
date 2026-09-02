## MODIFIED Requirements

### Requirement: Field-scoped Media upload and retry

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/domain/objects/media.md`, PROD-492, PROD-581, PROD-881 — production route는 avatar/header별 local asset, preview, upload generation과 Ready Media ID를 독립적으로 보존해야 한다(MUST). 선택 즉시 preview를 표시하고 공통 업로드 경계에서 이미지를 긴 변 최대 `2048px`와 품질 `0.8`의 WebP byte로 정규화한 뒤 issue-upload URL, 정규화 byte PUT, complete 순서로 Ready Media를 확보해야 하며(MUST), stale completion이나 실패한 field 때문에 다른 Ready field를 다시 업로드해서는 안 된다(MUST NOT).

#### Scenario: Upload selected image and ignore a stale completion

- **WHEN** 사용자가 이미지를 선택한 뒤 같은 field를 교체하거나 route를 떠나기 전에 이전 upload가 늦게 완료된다
- **THEN** route는 최신 local preview와 upload generation만 draft에 반영한다
- **AND** 공통 이미지 업로드 경계가 해당 field의 PUT byte와 Content-Type을 `2048px` 이내 WebP 결과로 정규화한다
- **AND** stale completion을 현재 Ready Media ID로 사용하지 않는다

#### Scenario: Retry only the failed image field

- **WHEN** 한 image field는 Ready이고 다른 field의 upload가 실패한다
- **THEN** form은 실패 field에 canonical 오류와 `다시 시도` action을 표시하고 저장을 disabled로 둔다
- **AND** retry는 실패 field의 issue→정규화→PUT→complete만 다시 실행한다
- **AND** Ready field와 text·policy draft를 유지한다

#### Scenario: Retry Profile save without reuploading Ready Media

- **WHEN** 모든 image upload가 Ready인 뒤 updateProfile 저장이 실패한다
- **THEN** route는 전체 draft와 Ready Media ID를 유지한다
- **AND** 저장 재시도는 같은 Ready ID를 사용하고 upload sequence를 다시 실행하지 않는다
