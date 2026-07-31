## 1. PROD-628 Canonical local actor Profile 표현

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `PROD-628`

**Deliverable**

Local active Profile의 actor document가 최신 displayName, bio, avatar, header와 Follow Approval Policy를
canonical ActivityPub `Person`으로 제공한다.

**Guardrails**

- actor identity, Web URL, endpoint, collection URI와 key identity를 변경하지 않는다.
- 같은 Profile이 소유한 Source=Local, State=Ready Media의 저장된 공개 URL과 Media Type만 이미지로 제공한다.
- actor 역참조와 후속 outbound caller가 서로 다른 `Person` projection을 만들지 않는다.
- Profile Tag·Profile Link와 outbound `Update(Person)` delivery를 포함하지 않는다.

**Verification**

- 저장 Profile/Media projection과 Fedify `Person` 결과에서 최신 값, 선택값 부재와 기존 identity를 검증한다.

- [x] 1.1 Local actor Profile projection이 follow policy와 유효한 선택적 avatar/header 공개 표현을 반환하게 한다.
- [x] 1.2 canonical `Person`에 displayName, 평문 bio, `icon`, `image`와 `manuallyApprovesFollowers`를 연결한다.
- [x] 1.3 선택값이 없거나 eligibility를 만족하지 않는 Media가 stale 또는 불완전한 actor 표현을 만들지 않게 한다.

## 2. PROD-628 Actor 역참조 회귀 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `PROD-628`

**Deliverable**

외부 서버가 actor document를 요청할 때 Profile 표현의 존재·부재와 변경 결과를 실제 ActivityPub JSON으로
검증하고 기존 discovery/key 계약의 회귀를 막는다.

**Guardrails**

- OPEN과 APPROVAL_REQUIRED를 모두 검증한다.
- 이미지 교체·제거 뒤 이전 URL을 반환하지 않는다.
- 반복 actor 조회가 actor metadata 또는 key row를 중복 생성하지 않는다.

**Verification**

- Fedify actor HTTP 통합 테스트와 필요한 projection 단위 테스트를 통과시킨다.

- [x] 2.1 bio와 avatar/header가 있는 actor JSON의 URL, Media Type과 follow policy 양방향 표현을 검증한다.
- [x] 2.2 bio/avatar/header 부재, 이미지 교체·제거와 eligibility 밖 Media의 비노출을 검증한다.
- [x] 2.3 기존 actor identity, endpoint, collection URI와 key lazy 생성·재사용 회귀를 검증한다.

## 3. PROD-628 계약 및 완료 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `PROD-628`

**Deliverable**

구현, 테스트와 active `activitypub-actor-discovery` 계약이 같은 PROD-628 범위를 표현하고 change 전체가 완료된다.

**Guardrails**

- DB/GraphQL schema, Profile 편집 UI와 PROD-629 outbound delivery를 변경하지 않는다.
- change의 전체 task와 검증이 완료되기 전에는 archive하지 않는다.

**Verification**

- 관련 package test와 정적 검사, OpenSpec strict validation과 archive 후 active spec 동기화를 확인한다.

- [x] 3.1 관련 package test, typecheck와 formatting/lint 검사를 통과시킨다.
- [x] 3.2 OpenSpec strict validation과 diff를 검토해 구현·계약 정합성을 확인한다.
- [x] 3.3 전체 task 완료 뒤 delta spec을 active spec에 동기화하고 change를 archive한다.
