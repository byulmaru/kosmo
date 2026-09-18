# ADR 0027: ActivityPub Remote Quote Approval

## 상태

Accepted — 2026-09-10 사용자가 최신 명세 검토안 전체를 Domain Gate 및 Issue Gate 결과로 승인했다.

## 날짜

2026-09-08

## 맥락

기존 Post 계약은 Content와 Repost Source의 조합으로 Quote를 정의하고, Source를 조회할 수 없어도 인용
작성자의 Content를 보존한다. PROD-792는 이 구조에 원격 Quote의 승인 검증과 철회 처리를 연결한다.

## 결정

- 원격 인용의 승인 상태는 Post가 소유한다. Source 관계, Source 조회 권한, 인용 자체의 조회 권한을 서로
  독립적으로 판정한다. Quote 전용 durable 객체나 별도 Source 관계를 만들지 않는다.
- FEP-044f의 `quote`가 우선한다. 잘못된 FEP 인용을 레거시로 다시 해석하지 않는다. FEP 인용은 자기 인용이거나
  진본인 `QuoteAuthorization`이 해당 인용·Source·Source Author를 정확히 가리킬 때만 승인한다.
- FEP `quote`가 없는 레거시 인용은 유효한 원문 확인 후 승인서 없이 표시할 수 있다. 이는 호환을 위한
  승인 상태이며 원문 작성자의 명시적 동의를 증명하지 않는다. Source 조회 권한은 별도로 적용한다.
- 인증된 embedded `Update(Note)`에 포함된 승인 정보의 추가·교체·제거와 유효한 승인 철회를 반영한다.
  IRI-only Note 추가 fetch·hydration과 authorization-only Update 표현은 이 범위에 포함하지 않는다. Source를 숨길 때도 인용 작성자의 Content와
  저장된 Source 관계를 보존하며, 중복 수신과 늦은 처리 결과로 철회 상태가 되돌아가지 않게 한다.
- 미저장 Public·Unlisted Source는 기존 원격 Note 저장 계약을 재사용한다. Followers Only Source는 현재
  저장되어 있을 때만 연결한다.
- 기존 목록·상세 Quote 카드를 사용하고 직접 Source만 표시한다. 새 화면, 재귀 인용 표시와 본문 재작성은
  이 수신 계약에 포함하지 않는다.

## 근거와 승인 이력

- [PROD-792](https://linear.app/byulmaru/issue/PROD-792): 2026-09-09 갱신 본문의 수신·검증·저장·조회·철회 범위. 2026-09-10에 본문·댓글·관계를 재확인했다.
- [Post](../objects/post.md), [ADR 0014](./0014-post-structure-relations.md): 관계 조합과 Content 보존 계약.
- [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/): 자기 인용, 승인서 검증과 철회 방식.
- 2026-09-08 PROD-792 Spec 대화: 사용자가 FEP `quote`가 없는 레거시 인용은 승인서 없이 표시하되 원문
  검증과 조회 권한을 적용하는 호환 정책을 선택했다. 이 선택만을 수정안 전체의 Gate 승인으로 확대하지 않는다.

## 결과와 책임

- PROD-792는 원격 Quote 수신부터 승인·철회와 기존 카드 표시까지의 구현, 검증, 전체 통합 검증과 이 범위의
  OpenSpec 정합성 확인·archive를 소유한다. 승인된 이 도메인 계약과 이슈 범위를 OpenSpec의 입력으로 사용한다.
- 선행 순서는 [PROD-509](https://linear.app/byulmaru/issue/PROD-509)의 원격 Note materialization, PROD-792다.
  기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost`와 실제로 필요한 최소 helper를 재사용한다.
  전체 Note projector나 두 단계 projection API는 추가하지 않는다.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793)의 미저장 Followers Only Source fetch,
  [PROD-365](https://linear.app/byulmaru/issue/PROD-365)의 일반 Note 수정 lifecycle,
  [PROD-431](https://linear.app/byulmaru/issue/PROD-431)의 Local Quote 작성은 별도 범위다.
- 재게시 Profile 목록, 역방향 인용 목록, Quote 발신·승인 발급과 Quote 알림의 후속 이슈는 PROD-792 완료를
  막지 않는다. 이 후속 작업의 검증이나 archive 책임을 PROD-792에 포함하지 않는다.

## 문서 반영

- [Post](../objects/post.md)에 원격 인용 승인 상태, 수신·철회 행동과 Source 표시 정책을 추가한다.
- Local Note 발신에서 Quote 전용 속성을 제외하는 기존 정책은 그대로 유효하다.
- DB schema, Workflow 식별자·재시도와 구현 수단은 PROD-792와 이후 OpenSpec에서 구체화한다.

## 2026-09-09 Reply Source 정렬

사용자 확정에 따라 PROD-509는 검증된 PUBLIC/UNLISTED Note를 `inReplyTo` 유무와 관계없이 최초 저장한다.
Parent는 DB identity lookup만 사용하고 미해석·기존 계약상 부적합한 경우에만 null fallback한다. DB 장애와
예상하지 못한 오류는 전파한다. Source 자체의 identity·author·audience를 사용하며 Parent 또는 Parent 작성자로
대체하지 않는다. Parent fetch·재귀 materialization·기존 fallback 관계 update/backfill은 PROD-506의 후속 범위다.
Quote 승인·Source 노출 및 PROD-793의 Followers Only signed-fetch 책임은 유지한다.

## 2026-09-10 최신 계약 동기화

- PROD-661은 PROD-509에 흡수되어 별도 선행 구현이 아니다. PROD-465 → PROD-509 → PROD-792 →
  PROD-793의 의존 순서를 따른다. 기존 content/media helper와 core `createPost`, 실제 필요한 최소 helper를
  재사용하며 전체 Note projector나 두 단계 projection API를 요구하지 않는다.
- PROD-509의 Media·작성자 저장 경계는 확정됐다. 신규 Note는 기존 Media 선택·검증과 10,000자 수신 한계를
  적용하고, Note 검증과 exact author identity 확인을 신규 작성자 저장보다 먼저 수행한다. 유효한 Actor/Profile과
  Instance의 독립 commit은 후속 Post 실패·중복 때문에 보상 삭제하지 않는다. Post 관련 관계는 기존 transaction을 따른다.
- PROD-509는 Spec Gate 승인 후 구현 PR #826이 리뷰 중이다. main에 병합된 선행 결과로 간주하지 않으며,
  PROD-792 구현 착수 시 최종 공개 계약·검증 결과와 Stack 부모를 다시 확인한다.
- PROD-793은 검증된 Source URI↔expected author와 그 근거를 전달하는 production 경로 및 private Source
  admission을 소유한다. 이 연동 책임을 PROD-792의 Followers Only 신규 저장으로 확대하지 않는다.
- PROD-431은 Local Quote 작성 API·core·Composer를, PROD-902는 발신 정책 결정을, PROD-924는 실제 발신과
  승인·철회 federation 구현을 소유한다. PROD-903의 알림 정책을 소비하는 생성·조회·보존·정리는 PROD-926이
  소유한다. PROD-792의 재처리·재승인을 새 알림 원인으로 정의하지 않는다.
- Source가 Quote인 순수 Repost의 한 단계 preview는 main의 별도
  [Source 표시 ADR](./0027-repost-of-quote-source-presentation.md)을 따른다. 이 문서의 원격 승인과 viewer별
  Source 조회 조건도 각 Source에 독립적으로 적용한다. 같은 ADR 번호만으로 두 문서를 혼동하지 않는다.
- 이 동기화는 이미 확정된 경계를 반영한다. 원격 승인 수정안 전체의 Domain/Issue Gate는 2026-09-10 사용자 승인으로 통과했다.

## Dependency 결정과 승인 경계 (2026-09-10)

사용자는 Fedify 2.4 prerelease의 호환 버전 세트를 명시적으로 pin하고 compatibility validation을 통과한
경우에만 채택하는 방침을 확정했다. 버전·lockfile 정합성, 기존 ActivityPub 경로와 vocabulary
hydration/serialization 회귀, PROD-792의 Quote/QuoteAuthorization 계약을 검증한다. 실패한 후보는 채택하지
않으며 PROD-792 구현을 강행하지 않는다. 세부 dependency 계약은
[PROD-792의 Fedify dependency 채택 조건](https://linear.app/byulmaru/issue/PROD-792)에 기록한다.

이 결정은 특정 후보의 채택 완료나 compatibility validation 통과를 뜻하지 않는다. 이 ADR의 원격 Quote
계약 전체의 Domain/Issue Gate는 이후 별도의 2026-09-10 사용자 승인으로 통과했다. 두 승인 모두
특정 dependency 후보의 검증 통과·채택 완료나 새 OpenSpec의 Spec Gate 승인을 뜻하지 않는다.

## 2026-09-17 Update 표현 범위 확정

사용자는 PROD-792에서 인증된 embedded `Update(Note)`만 지원하도록 확정했다. embedded Note의 승인 참조
추가·교체·제거를 처리하되, FEP 타인 Quote에만 재검증과 PENDING 전이를 적용하고 자기 인용과 legacy의
승인서 면제를 유지한다. IRI-only Update의 원격 Note fetch·hydration과 authorization-only Update 표현은
일반 fetch 경계를 넓히지 않기 위해 후속 범위로 둔다.

## Domain Gate 및 Issue Gate 승인 (2026-09-10)

사용자는 PROD-792 최신 명세 검토안 전체를 두 Gate의 결과로 명시적으로 승인하고 OpenSpec 작성을
요청했다. 승인 대상은 이 ADR과 Post 계약, 최신 이슈의 포함·제외 범위, 의존성과 PROD-792의 구현·통합
검증·정합성 확인·archive 책임이다. 출처는 PROD-792 Spec 대화
`01a07e8d-8c62-7c90-ab60-482fb0edf379`의 2026-09-10 사용자 승인이다.
