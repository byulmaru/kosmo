## 1. PROD-539 Post 상호작용 event 연결

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/bookmark.md`
- `docs/design/post-action-bar.md`
- `docs/design/reactions.md`
- Linear `PROD-539`

**Deliverable**

Kosmo Web에서 재게시·반응·북마크의 생성·취소 결과가 각 action의 서버 확정 성공 뒤 승인된 event와 allowlist property로 정확히 한 번 기록된다.

**Guardrails**

- 재게시 생성·취소는 `repost_succeeded`의 `created | removed` result만 사용한다.
- Reaction add/remove는 `reaction_type: default | custom`만 사용하고 `❤️`만 default로 분류한다.
- Bookmark add/remove는 property를 보내지 않는다.
- 기존 mutation 성공 의미, Relay normalization, selected Profile별 actor 격리, pending·error와 사용자 오류 처리를 바꾸지 않는다.
- 요청 시작·optimistic state·실패 결과는 성공 event를 만들지 않는다.

**Verification**

- 재게시·반응·북마크의 생성·취소 성공, payload 부재, GraphQL/network 실패, 중복 입력과 actor 전환 case에서 event name·exact payload·호출 횟수와 기존 UI/cache 상태를 검증한다.
- Reaction authoritative payload와 부분 GraphQL 오류가 함께 있는 기존 성공 case도 대응 event가 한 번 기록되는지 검증한다.

- [ ] 1.1 재게시 생성·취소의 기존 서버 확정 성공 결과에 `repost_succeeded`와 allowlist result를 연결한다.
- [ ] 1.2 Reaction 추가·삭제의 기존 서버 확정 성공 결과에 `reaction_added | reaction_removed`와 default/custom projection을 연결한다.
- [ ] 1.3 Bookmark 추가·삭제의 기존 서버 확정 성공 결과에 property 없는 `bookmark_added | bookmark_removed`를 연결한다.
- [ ] 1.4 세 action의 성공·실패·취소·partial payload·정확히 한 번·actor 격리 회귀 test를 추가하거나 갱신한다.

## 2. PROD-539 Account identity와 개인정보 경계

**Authority / Provenance**

- `docs/operations/openpanel.md`
- Linear `PROD-469`
- Linear `PROD-539`

**Deliverable**

새 이벤트가 기존 opaque Account identity에 연결되어 Account 단위 adoption·빈도·cohort·retention 분석 기반을 제공하고, event payload는 승인된 최소 속성만 포함하며 분석 실패가 제품 흐름에 영향을 주지 않는다.

**Guardrails**

- opaque Account ID는 existing identify에만 사용하고 event property에 중복 전송하지 않는다.
- Post ID, 대상·선택 Profile ID, Post 콘텐츠, 구체 Reaction 값, custom emoji 식별 정보, 오류 원문, 이름·handle·이메일 trait를 보내지 않는다.
- 공용 action 경계에서 Web SDK를 직접 의존하지 않고 현재 Native no-op과 Web failure isolation을 유지한다. 이 상태를 Native 분석 지원 완료나 영구 비적용으로 일반화하지 않는다.
- Account 가입 event를 추가하거나 `profile_created`, 최초 identify·pageview를 가입 시점으로 재해석하지 않는다.

**Verification**

- 분석 client와 action payload test에서 Account·Post·Profile ID 및 구체 emoji 식별 값이 없고 허용 property만 존재하는지 검증한다.
- SDK 초기화·track throw/reject에서도 mutation callback, Relay 상태와 기존 오류 처리가 유지되는지 검증한다.
- 같은 opaque Account profile에 반복 행동 event가 귀속되는 production acceptance를 준비하고, 가입 cohort가 현재 계산 불가능하다는 gap을 구분해 기록한다.

- [ ] 2.1 새 taxonomy가 기존 Web OpenPanel identity와 failure-isolated analytics 경계를 통해 전달되고 현재 Native no-op 경계를 유지하게 한다.
- [ ] 2.2 Account identity attribution, exact property allowlist, raw 식별 정보 부재와 SDK 실패 격리 test를 추가하거나 갱신한다.
- [ ] 2.3 `docs/operations/openpanel.md`의 명시적 event 목록, 개인정보 경계, Account attribution과 production acceptance를 갱신한다.

## 3. PROD-539 통합 검증과 OpenSpec 완료 책임

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/bookmark.md`
- `docs/design/post-action-bar.md`
- `docs/design/reactions.md`
- `docs/operations/openpanel.md`
- Linear `PROD-539`

**Deliverable**

PROD-539가 소유한 구현·자동 검증·production acceptance와 change 정합성 확인이 완료되어 독립적으로 review·archive할 수 있다.

**Guardrails**

- dashboard 집계식, WAA 정의, 내부·테스트 Account와 봇 제외, 가입 event와 Native 분석 지원을 현재 구현 범위로 확장하지 않는다.
- production Client ID, 실제 Account ID와 사용자 콘텐츠를 repository나 검증 증거에 저장하지 않는다.
- PR Ready 판단과 OpenSpec archive는 별도 gate로 유지하고, 모든 task·required validation·production acceptance와 최신 canonical·Linear 정합성이 확인된 뒤에만 이 change를 archive한다.

**Verification**

- 관련 app test, typecheck, lint와 formatting 및 OpenSpec strict validation을 통과시킨다.
- production Dashboard에서 opaque Account attribution, add/remove event, exact property와 실패 mutation 비수집을 확인하되 실제 식별자·콘텐츠를 증거에 복사하지 않는다.
- archive 전후 최신 canonical·Linear와 delta spec 정합성 및 validation 결과를 확인한다.

- [ ] 3.1 관련 자동 test, app 정적 검증과 `openspec validate track-post-interaction-analytics --strict`를 통과시킨다.
- [ ] 3.2 production Web에서 Account attribution, 성공·취소 event, allowlist property와 실패 비수집 acceptance를 완료한다.
- [ ] 3.3 모든 task와 최신 authority 정합성을 확인한 뒤 PROD-539 소유로 change를 archive하고 archive 후 validation을 통과시킨다.
