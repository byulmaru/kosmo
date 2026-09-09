이 체크리스트는 Spec Gate 최종 승인 후 별도 구현 세션에서 수행한다. 현재 완료된 구현 task는 없다.

## 1. PROD-465 길이 계약 적용

**Authority / Provenance**

- `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`
- [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의 현재 계약·완료 기준과 명세·검증 책임.

**Deliverable**

canonical summary와 body Plain Text 합계에 원격 10,000자 기준을 적용한다.

**Guardrails**

Local 500자·기존 정규화·Quote 원문 분리를 유지하고 잘라 저장하지 않는다.

**Verification**

9,999·10,000·10,001, summary/body 합산, Unicode·HTML·줄바꿈·Media 제외를 검증한다.

- [x] 1.1 기존 canonical projection 결과에 원격 길이 검증을 적용한다.
- [x] 1.2 core 경계값과 Local 정책 회귀 검증을 추가한다.

## 2. PROD-465 원자성 및 관측

**Authority / Provenance**

- `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`
- [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의 현재 계약·완료 기준과 명세·검증 책임.

**Deliverable**

그룹 1의 길이 초과를 저장 전 전체 no-op으로 처리하고 고정 reason으로 관측한다.

**Guardrails**

새 Post·mapping·content·Media와 후속 effect를 남기지 않는다. 기존 duplicate는 보존하고 내부 오류를 숨기지 않는다.

**Verification**

embedded/IRI hydration 이후, Media 동반 초과, duplicate, metric·로그 원문 비노출과 내부 오류 전파를 검증한다.

- [x] 2.1 inbound 거부와 원문 없는 metric·구조화 로그를 연결한다.
- [x] 2.2 row·effect 부재와 관측·오류 분류의 회귀 검증을 추가한다.

## 3. PROD-465 통합 검증과 완료

**Authority / Provenance**

- `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`
- [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의 현재 계약·완료 기준과 명세·검증 책임.

**Deliverable**

그룹 1~2의 정상 호환성·원자성을 통합 검증하고 PROD-509에 길이·실패 계약을 인계한다. PROD-465가 이 change 전체의 동기화와 archive를 소유한다.

**Guardrails**

PROD-931의 byte·HTML·JSON·hydration 보호를 현재 완료 조건에 넣지 않는다. 일부 PR 완료만으로 archive하지 않는다.

**Verification**

정상 visibility·Reply·Media-only·attachment 순서·first-write-wins 및 관련 core/Fedify 테스트를 검증한다. 최신 canonical·Linear 대조와 strict validation, archive 이후 validation을 확인한다.

- [x] 3.1 관련 통합 회귀 검증과 PROD-509 handoff를 완료한다.
- [ ] 3.2 전체 완료 증거를 확인한 뒤 spec 동기화·archive와 validation을 수행한다.
