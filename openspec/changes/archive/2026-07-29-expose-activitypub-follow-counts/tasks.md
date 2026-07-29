## 1. PROD-560 ActivityPub follow count 공개

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-560

**Deliverable**

외부 서버가 Local actor에서 followers/following collection을 발견하고 membership 공개 없이 저장된 팔로워 수와
팔로잉 수를 읽을 수 있다.

**Guardrails**

- collection은 저장 count를 사용하고 관계 aggregate query를 수행하지 않는다.
- membership item과 pagination reference를 공개하지 않는다.
- unknown, non-local, inactive 또는 suspended Profile에는 collection을 제공하지 않는다.
- collection 조회는 actor key lifecycle이나 outbound followers fan-out을 실행하지 않는다.
- GraphQL, 앱 UI, DB schema와 follow lifecycle을 변경하지 않는다.

**Verification**

- Local actor JSON의 followers/following URI를 검증한다.
- 두 collection의 canonical ID, type, 서로 다른 `totalItems`, 빈 membership과 pagination 부재를 검증한다.
- unavailable Profile의 collection 응답과 actor key 비생성을 검증한다.
- Fedify package test, typecheck, lint, Prettier와 OpenSpec strict validation을 통과시킨다.

- [x] 1.1 Local actor read projection과 actor document에 followers/following count collection 참조를 추가한다.
- [x] 1.2 두 count-only collection과 Local Profile 공개 조건을 구현하되 delivery membership과 key lifecycle을
      변경하지 않는다.
- [x] 1.3 actor·collection 성공 및 unavailable Profile 회귀 테스트를 추가한다.
- [x] 1.4 관련 package 검증과 OpenSpec strict validation을 통과시킨다.
