## 1. PROD-378 Canonical viewer follow 계약

**Deliverable**

Profile의 viewer-relative established follow 관계가 GraphQL과 first-party Relay cache에서 `viewerState.follow` 하나로만 표현된다.

**Guardrails**

- follow/unfollow mutation 행동, count, 접근 정책과 pending request 의미를 변경하지 않는다.
- `Profile.viewerFollow`는 deprecation 기간 없이 제거한다.
- active `add-activitypub-remote-follow` change와 repository memory도 canonical 계약에 맞춘다.

**Verification**

- API 통합 테스트가 established, self, no-active-profile, pending 및 visibility 경로의 `viewerState.follow`를 검증한다.
- Relay compilation/type check와 active profile 전환 E2E가 canonical viewer state 동작을 검증한다.
- 전체 저장소 검색, OpenSpec strict validation과 포맷 검사가 제거된 계약의 잔존 참조를 확인한다.

- [x] 1.1 GraphQL schema와 API 테스트에서 `Profile.viewerFollow`를 제거하고 `viewerState.follow` 검증을 유지한다.
- [x] 1.2 first-party Relay artifact, active OpenSpec과 repository memory를 canonical viewer state 계약에 맞춘다.
- [x] 1.3 관련 API/App 테스트, active profile 전환 E2E, OpenSpec strict validation과 정적 검사를 통과시킨다.
