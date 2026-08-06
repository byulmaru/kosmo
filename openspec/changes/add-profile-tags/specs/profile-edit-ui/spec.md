## REMOVED Requirements

### Requirement: Production route excludes Profile Tag persistence until its owning change

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-492`, `PROD-527`

**Reason**: `PROD-527`이 기존 Profile edit route에 Profile Tag 조회·편집·저장·Relay 연결을 완료했으므로, owning change 전까지만 적용되던 임시 제외 계약을 유지하면 현재 구현 및 Profile Tag editor 계약과 충돌한다.

**Migration**: 기존 Profile edit route는 `PROD-491` editor를 재사용하고 Profile Tag 전체 목록을 다른 Profile draft와 같은 `updateProfile` transaction으로 제출한다. 구체 동작과 검증은 이 change의 `profile-tag-ui`, `profile-tag`, `profile` delta를 따른다.
