## 1. PROD-646 Home과 Profile 게시글 무한 스크롤

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/accessibility.md`
- `PROD-641`
- `PROD-646`
- `PROD-662`

**Deliverable**

Home과 Profile 게시글 목록이 서로 독립된 Relay connection에서 게시글을 20개씩 자동으로 누적하고, loading·마지막 page·실패 후 수동 재시도를 기존 목록과 scroll position을 유지한 채 제공한다.

**Guardrails**

- Home과 Profile의 Relay owner·connection identity를 합치지 않는다.
- Home의 기존 prepend connection identity와 최신순을 유지한다.
- 완료된 공통 자동 pagination lifecycle을 사용하고 surface별 lifecycle을 복제하지 않는다.
- 기존 Home과 Profile scroll owner를 유지하고 중첩 ScrollView를 추가하지 않는다.
- 실패 뒤 자동 재시도를 반복하지 않는다.
- 공개·추천·Local Timeline, GraphQL schema·resolver, Subscription과 Home 재선택 refresh를 포함하지 않는다.

**Verification**

- Home과 Profile의 cursor, 20개 단위 page 누적, 마지막 page 종료와 identity 격리를 검증한다.
- loading·실패 toast·수동 retry, Native scroll metric 연결·owner 전환 격리와 Home prepend 순서·중복 방지를 검증한다.
- 자동화 검증과 실제 Web·Android·iOS runtime 증거를 구분하고 OpenSpec strict validation을 통과시킨다.

- [x] 1.1 Home과 Profile이 독립된 Relay connection에서 다음 20개를 누적하고 마지막 page에서 중단한다.
- [x] 1.2 Home과 Profile이 실제 scroll owner에서 공통 자동 pagination lifecycle을 사용하고 actor·handle·route 전환 상태를 격리한다.
- [x] 1.3 다음 page loading과 실패 toast·수동 retry가 기존 게시글과 scroll position을 유지한다.
- [x] 1.4 Home prepend와 pagination이 최신순을 유지하고 같은 게시글을 중복 표시하지 않는다.
- [ ] 1.5 실제 Web·Android·iOS runtime에서 near-end, loading, 실패 후 retry와 scroll 유지를 확인한다.
- [ ] 1.6 전체 계약과 검증이 완료되면 delta spec을 동기화하고 change를 archive한다.
