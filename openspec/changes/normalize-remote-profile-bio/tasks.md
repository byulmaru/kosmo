## 1. PROD-536 ActivityPub Remote Profile bio 평문화

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `PROD-536`

**Deliverable**

원격 actor의 string 및 language-tagged HTML `summary`가 최초 materialization과 refresh에서 표시 가능한 평문 `Profile.bio`로 저장된다.

**Guardrails**

- HTML projection 뒤에 `Profile.bio`의 trim·nullable·500자 검증을 적용한다.
- remote Note와 Profile은 검증된 동일 ActivityPub HTML canonicalization 의미를 공유하며 regex strip, 새 HTML renderer 또는 신규 sanitizer 경로를 만들지 않는다.
- Local Profile 입력, local actor outbound 표현, GraphQL schema와 Profile UI 렌더링 계약을 변경하지 않는다.
- DB schema와 dependency는 변경하지 않는다.

**Verification**

- pure projection test로 HTML entity, 링크 표시 텍스트, 문단/hard break, malformed/unknown markup, image·unsafe URL·속성, script/style/template 제거와 빈 결과 `null`을 검증한다.
- remote actor DB test로 string/language-tagged 최초 저장, refresh, projection 후 500자 검증과 lifecycle/suspension 보존을 검증한다.
- string summary, language-tagged summary, refresh, projection 후 500자 검증, Local Profile/outbound 회귀를 관련 테스트로 검증한다.
- 기존 remote Note projection, Local Profile update, local actor outbound, GraphQL `Profile.bio`와 관련 workspace check에 회귀가 없는지 확인한다.

- [ ] 1.1 기존 ActivityPub HTML canonicalization 의미를 공유하는 평문 projection 경계를 마련하고 entity·구조·비표시·malformed HTML 회귀 fixture를 통과시킨다.
- [ ] 1.2 remote actor의 string/language-tagged `summary`를 projection한 뒤 bio schema를 적용해 최초 materialization과 refresh 저장 경계를 정렬한다.
- [ ] 1.3 projection 후 500자, 빈 projection `null`, refresh lifecycle/suspension 보존과 Local Profile/outbound 비변경을 관련 테스트로 증명한다.
- [ ] 1.4 관련 core/fedify/GraphQL 검증, lint·format check와 `openspec validate normalize-remote-profile-bio --strict`를 통과시키고 spec handoff를 기록한다.
