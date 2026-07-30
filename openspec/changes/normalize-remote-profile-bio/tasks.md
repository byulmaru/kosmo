## 1. PROD-536 ActivityPub Remote Profile bio 평문화와 기존 데이터 정리

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `PROD-536`

**Deliverable**

원격 actor의 string 및 language-tagged HTML `summary`가 최초 materialization과 refresh에서 표시 가능한 평문 `Profile.bio`로 저장되고, 기존 raw HTML bio도 명시적 실행 경로로 같은 결과에 수렴한다.

**Guardrails**

- HTML projection 뒤에 `Profile.bio`의 trim·nullable·500자 검증을 적용한다.
- remote Note와 Profile은 검증된 동일 ActivityPub HTML canonicalization 의미를 공유하며 regex strip, 새 HTML renderer 또는 신규 sanitizer 경로를 만들지 않는다.
- Local Profile 입력, local actor outbound 표현, GraphQL schema와 Profile UI 렌더링 계약을 변경하지 않는다.
- 기존 데이터 정리는 non-null ActivityPub Remote Profile만 대상으로 하며 network fetch나 profile 조회·7일 TTL에 의존하지 않는다.
- 정리 실행은 stable identity 기반 bounded batch, batch별 transaction, dry-run, 진행·최종 합계, 변경값 비교와 재실행 0-change 수렴을 제공한다.
- DB schema와 dependency를 추가하지 않고, 이미 원문이 없는 `null` bio의 원격 복구는 포함하지 않는다.

**Verification**

- pure projection test로 HTML entity, 링크 표시 텍스트, 문단/hard break, malformed/unknown markup, image·unsafe URL·속성, script/style/template 제거와 빈 결과 `null`을 검증한다.
- remote actor DB test로 string/language-tagged 최초 저장, refresh, projection 후 500자 검증과 lifecycle/suspension 보존을 검증한다.
- cleanup DB test로 dry-run 무변경, mixed remote changed/unchanged/null row, Local 제외, 여러 batch continuation, apply 결과와 재실행 0-change를 검증한다.
- 기존 remote Note projection, Local Profile update, local actor outbound, GraphQL `Profile.bio`와 관련 workspace check에 회귀가 없는지 확인한다.

- [ ] 1.1 기존 ActivityPub HTML canonicalization 의미를 공유하는 평문 projection 경계를 마련하고 entity·구조·비표시·malformed HTML 회귀 fixture를 통과시킨다.
- [ ] 1.2 remote actor의 string/language-tagged `summary`를 projection한 뒤 bio schema를 적용해 최초 materialization과 refresh 저장 경계를 정렬한다.
- [ ] 1.3 projection 후 500자, 빈 projection `null`, refresh lifecycle/suspension 보존과 Local Profile/outbound 비변경을 관련 테스트로 증명한다.
- [ ] 1.4 기존 non-null ActivityPub Remote Profile bio를 dry-run·bounded batch·재실행 가능하게 정리하고 진행·변경·실패 합계를 반환하는 데이터 경계를 구현한다.
- [ ] 1.5 동일 application image에서 정리 dry-run/apply를 명시적으로 실행할 수 있게 연결하고 Local 제외·network-free·batch continuation·0-change 수렴을 DB 검증으로 증명한다.
- [ ] 1.6 관련 core/fedify/GraphQL 검증, lint·format check와 `openspec validate normalize-remote-profile-bio --strict`를 통과시키고 dry-run/apply·rollback handoff를 기록한다.
