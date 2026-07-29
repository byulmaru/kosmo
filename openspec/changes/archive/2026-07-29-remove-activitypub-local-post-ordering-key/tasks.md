## 1. PROD-512 Local Post direct delivery ordering 정정

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-512

**Deliverable**

Local Post direct delivery가 효과 없는 ordering key를 전달하지 않고 현재 순서 비보장 계약을 정확히 드러낸다.

**Guardrails**

- stable Create/Delete activity ID를 유지한다.
- Repost·Follow delivery와 PROD-448의 queue 범위를 변경하지 않는다.
- archive된 이전 OpenSpec change 이력을 rewrite하지 않는다.

**Verification**

- dispatcher와 Local Post Create/Delete 호출 options에 ordering key가 없음을 검증한다.
- 반복 Create/Delete activity ID가 안정적인지 검증한다.
- Fedify 테스트, TypeScript와 OpenSpec strict validation을 통과시킨다.

- [x] 1.1 Local Post dispatcher 입력과 Fedify direct delivery options에서 ordering key를 제거한다.
- [x] 1.2 Local Post Create/Delete caller와 테스트를 현재 direct delivery 계약에 맞춘다.
- [x] 1.3 canonical spec을 동기화하고 관련 검증을 통과시킨다.
