# ADR 0027: Quote Consent and Federation

## 상태

Accepted

## 날짜

2026-09-08

## 근거

[PROD-902](https://linear.app/byulmaru/issue/PROD-902)의 갱신된 제품 결정과 같은 날 Spec 대화에서 선택한
게시글별 설정, 기존 Post 초기값, 차단과 명시적 승인 철회의 구분을 반영한다. 개별 정책은 확정했으며,
문서 정렬 결과의 Domain Gate 전체 승인은 별도로 받는다.

## 결정

- Content가 있는 Local Post마다 `모두`, `팔로워`, `본인만` 인용 허용 정책을 제공한다. 새 Post와 기존
  Post의 초기값은 `모두`다. `팔로워`는 established Follower와 본인, `본인만`은 본인만 허용한다.
  허용된 요청도 Source 조회와 차단 조건을 통과해야 한다.
- 정책 변경은 이후 요청에만 적용한다. 기존 QuoteAuthorization을 자동 철회하지 않는다.
- Kosmo 원문은 정책에 따라 자동 승인·거절한다. Kosmo 자체의 건별 수동 승인 UI는 제공하지 않는다.
- Local Note의 `interactionPolicy.canQuote.automaticApproval`은 `모두`를 ActivityStreams Public,
  `팔로워`를 Author의 followers collection과 Author Actor, `본인만`을 Author Actor로 광고한다. 첫 출시에는
  건별 수동 승인 기능이 없으므로 `manualApproval`은 제공하지 않는다. 최초 Note와 정책 변경 뒤 같은 identity의
  Update에 이 projection을 적용하되, 광고 자체는 개별 승인 증거로 사용하지 않는다.
- 자기 인용은 QuoteRequest 없이 허용한다. 타인의 원격 원문을 인용할 때는 `interactionPolicy`의
  `automaticApproval`·`manualApproval` 여부, 정책 부재 또는 해석 실패와 관계없이 QuoteRequest를 보낸다.
  `interactionPolicy`는 작성 전 UI·정책 힌트일 뿐 승인 근거가 아니며, 실제 승인은 원문 작성자가 발급한
  유효한 QuoteAuthorization으로 확인한다.
- 다른 사람의 Source는 Local·Remote 모두 Public·Unlisted만 인용할 수 있다. 타인의 Followers Only는
  조회 가능한 팔로워라도 인용할 수 없다. 자기 Followers Only 인용은 허용하되 원문 접근 범위를 넓히지
  않는다. Mentioned Profiles와 조회 불가 Source는 인용할 수 없다.
- 타인의 원격 원문은 승인 대기 중에도 Quote 자체 Content를 게시하고 일반 federation 전달을 진행한다. 승인 전에는
  Source를 정상 인용으로 노출하지 않으며 원문 서버에 별도 승인 요청을 보낸다. 유효한 승인을 받으면
  Source와 승인을 연결하고 필요한 Update를 보낸다.
- 거절·승인 철회·Source 삭제 후에도 Quote 자체 Content는 유지하고 Source는 비노출한다. Local Source 삭제는
  그 Source의 유효한 승인마다 `Delete(QuoteAuthorization)`을 Quote Author 또는 Quote 소유 서버에 전달하고,
  소유 서버가 기존 Quote audience에 전달하게 해 일반 Source audience 밖의 원격 Quote도 수렴시킨다. 일반
  `Delete(Note)` 전달만으로 이 경로를 대신하지 않는다. 실패나 응답 부재는 승인이 아니며, 뒤늦은 응답이 더
  최신의 거절·철회를 되돌려서는 안 된다.
- 차단은 새로운 인용 요청·승인을 양방향으로 막는다. 기존 승인 Source의 표시는 별도 양방향 규칙을 만들지
  않고 기존 방향별 Post 조회 정책을 적용한다. Viewer가 Source Author를 차단한 방향만 존재하면 Viewer의 직접
  조회 조건에 따라 Source를 볼 수 있고, Source Author가 Viewer를 차단했거나 상호 차단이면 Source를 숨긴다.
  차단 자체가 기존 승인을 자동 철회하거나 제3자의 Source 조회를 일괄 막지는 않는다. 제3자에게도 Source를
  숨기려면 원문 작성자가 별도 승인 철회를 사용한다.
- 원문 작성자의 명시적 철회는 QuoteAuthorization을 무효로 만들고 Delete(QuoteAuthorization)를 전달한다.
  수신자는 철회 주체와 대상 승인의 대응을 검증한 뒤 Source를 숨긴다. 수신자가 Quote의 소유 서버라면
  기존 Quote audience에도 같은 철회를 전달한다. 발신·전달하는 철회 Delete의 object와 target은 객체를
  embed하지 않고 URI 참조로만 제공한다.
- FEP-044f의 quote와 QuoteAuthorization을 정식 경로로 사용한다. `interactionPolicy`상 요청자가
  `automaticApproval`과 `manualApproval` 어느 쪽에도 명백히 포함되지 않으면 승인되지 않을 것으로
  예상된다는 정보를 UI·eligibility 힌트로 사용할 수 있지만, 정책 광고만으로 개별 승인을 대체하지 않는다.
  QuoteAuthorization은 Source를 볼 수 있는 요청자에게만 역참조를 허용하되 `interactingObject`를 embed하지
  않는다. 요청자의 Source 조회 권한이 없거나 이를 확인할 수 없으면 승인 객체 자체를 제공하지 않는다. 레거시
  상호운용을 지원하되 유효하지 않은 FEP Quote를 레거시 형식으로 강등하지 않는다.
- 승인된 인용은 `quoteUrl`, `quoteUri`, `_misskey_quote`와 원문 링크의 본문 fallback을 발신 표현으로
  제공한다. 승인 전·거절·철회 상태에서는 자동 생성한 표현을 숨기고 직접 작성한 본문·링크는 유지한다.
- 저장된 Reply Parent와 Quote Source는 독립 관계이며 한쪽의 권한이 다른 쪽에 권한을 부여하지 않는다.
  로컬 Quote 작성은 Source만 받으며 Reply+Quote 동시 작성 UI·API와 링크의 인용 카드 전환은 제외한다.

## 이유와 대안

게시글별 정책은 원문마다 인용 범위를 선택하게 한다. Profile 기본값은 독립적으로 제공할 수 있으므로
이번 사이클에서 분리한다. 기존 Post도 `모두`로 시작하되 조회 권한은 그대로 적용한다.

원격 승인 대기 중 전체 게시를 보류하는 대신 자체 Content를 먼저 게시한다. 인용 승인은 Source 노출에만
적용하므로 거절이나 철회가 작성자의 본문 삭제로 이어지지 않는다.

차단과 승인 철회를 분리하면 당사자 간 접근 제한과 제3자에게 보이는 인용 관계의 제거를 각각 선택할 수 있다.
정책 변경이나 차단에 따른 일괄 자동 철회는 채택하지 않았다.

## 결과와 후속 범위

- [Post](../objects/post.md), [Profile Block](../objects/profile-block.md),
  [Post Action Bar](../../design/post-action-bar.md)에 작성·설정·조회 결과를 반영한다.
- [PROD-431](https://linear.app/byulmaru/issue/PROD-431)은 로컬 Quote 작성과 Composer를,
  [PROD-924](https://linear.app/byulmaru/issue/PROD-924)는 게시글별 정책과 발신·승인·철회 연합을 구현한다.
  PROD-902가 OpenSpec을 소유한다. 저장 표현, delivery와 재시도 세부는 해당 스펙의 구현 가이드를 따른다.
- [PROD-792](https://linear.app/byulmaru/issue/PROD-792)의 원격 Quote 수신과
  [PROD-793](https://linear.app/byulmaru/issue/PROD-793)의 Followers Only Source signed fetch 책임은 유지한다.
  로컬 작성 제한을 원격 수신 계약의 축소로 적용하지 않는다.
- Profile의 새 Post 인용 허용 기본값은 [PROD-925](https://linear.app/byulmaru/issue/PROD-925) Backlog에서
  다룬다. 기존 Post와 기존 승인을 소급 변경하지 않으며 이번 사이클의 완료 조건에 포함하지 않는다.

## 참고

- [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/)
- [Mastodon Quote Posts](https://docs.joinmastodon.org/user/quote-posts/)
- [조사와 결정 기록](../records/2026-09-08-quote-federation-domain-gate.md)

## 로컬 작성 범위 정정 (2026-09-09)

PROD-431 Spec 대화에서 사용자가 링크 인용 기능·문서와 Reply+Quote 작성 기능 전체를 API까지 제거하도록
지시했다. Quote 작성에서 선택적 Parent 입력과 해당 검증 요구를 제거한다. 기존 관계 조합·원격 수신·조회 표현은
변경하지 않는다. PROD-431은 기본 Quote 작성, PROD-924는 정책·승인·발신과 공유 change의 통합·archive를 맡는다.

## 원격 인용 승인 판단 정정 (2026-09-09)

PROD-902 Spec 대화에서 사용자가 원격 `interactionPolicy`의 automatic/manual 여부와 관계없이 타인 원문
인용은 QuoteRequest와 유효한 QuoteAuthorization을 거치도록 결정했다. 정책이 없거나 해석할 수 없어도
작성자의 자체 Content를 pending 상태로 게시하고 QuoteRequest를 보낸다. 자기 인용만 요청 없이 허용하며,
`interactionPolicy`는 작성 전 UI·정책 힌트로만 사용한다.
