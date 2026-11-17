# ADR 0029: Quote Consent and Federation

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
- 현재 PROD-924는 작성 시 정책 선택만 제공하며 게시 후 정책 변경 UI·API는 제외한다. 향후 정책 변경을
  도입할 때에도 이후 요청에만 적용하고 기존 QuoteAuthorization을 자동 철회하지 않는다.
- Kosmo 원문은 정책에 따라 자동 승인·거절한다. Kosmo 자체의 건별 수동 승인 UI는 제공하지 않는다.
- Local Note의 `interactionPolicy.canQuote.automaticApproval`은 `모두`를 ActivityStreams Public,
  `팔로워`를 Author의 followers collection과 Author Actor, `본인만`을 Author Actor로 광고한다. 첫 출시에는
  건별 수동 승인 기능이 없으므로 `manualApproval`은 제공하지 않는다. 현재는 최초 Note에 이 projection을 적용하고, 향후 정책 변경을 도입하면 같은 identity의
  Update에도 적용하되, 광고 자체는 개별 승인 증거로 사용하지 않는다.
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
  삭제와 관련 Quote들의 Pending·Approved 철회를 원자적으로 반영하고 그 Source에 발급된 모든 유효한
  승인을 철회한다. 승인과 삭제의 경쟁으로 삭제된 Source에 새 유효한 승인을 남기지 않는다. Local Quote audience에 Quote `Update(Note)`를 전달하고,
  Remote Quote owner에는 Source가 발급한 `Delete(QuoteAuthorization)`을 직접 전달한다. 원격 철회 수신 시의
  전파는 아래 원격 철회 전달 정책을 따른다. 실패나 응답 부재는 승인이 아니며, 이전 승인을 위한 뒤늦은 응답이나
  오래된 중복 전달은 더 최근의 거절·철회를 되돌려서는 안 된다.
- 차단은 새로운 인용 요청·승인을 양방향으로 막는다. 기존 승인 Source의 표시는 별도 양방향 규칙을 만들지
  않고 기존 방향별 Post 조회 정책을 적용한다. Viewer가 Source Author를 차단한 방향만 존재하면 Viewer의 직접
  조회 조건에 따라 Source를 볼 수 있고, Source Author가 Viewer를 차단했거나 상호 차단이면 Source를 숨긴다.
  차단 자체가 기존 승인을 자동 철회하거나 제3자의 Source 조회를 일괄 막지는 않는다. 제3자에게도 Source를
  숨기는 별도 승인 철회 UI·API는 현재 PROD-924 범위에서 제공하지 않는다.
- Remote Source Author의 `Delete(QuoteAuthorization)`은 발신자와 승인·Source·Quote의 결속을 확인한 뒤
  현재 유효한 철회임이 명확한 경우 수신한 Local Quote를 철회하고 Source를 숨긴다. 같은 승인 URI를
  재사용해 과거 Delete와 현재 Delete가 모호한 경우에는 아래 현재 승인 재검증 계약을 따른다. Quote 소유 서버는 원본 `Delete`를 전달하거나 대체 `Delete`를
  만들지 않고, 기존 Quote audience에 Source와 승인 및 자동 생성한 Quote 표현을 제외한 `Update(Note)`를 보낸다.
  작성된 본문·링크, Quote identity와 공개 범위는 유지되며, 전달 실패는 철회를 되돌리지 않는다. Local Source
  Author가 원격 Quote owner에게 발신하는 `Delete`의 `object`와 `target`은 객체를 embed하지 않고 URI 참조로
  제공한다.
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
- PROD-431은 작성 시 Source eligibility·접근·차단을 검증하고 승인 경계가 없는 ActivityPub Source를 정상
  Source로 노출하지 않는다. 현재 단계에서는 해당 작성을 안전하게 거부한다. PROD-924는 이 seam에 승인
  상태와 pending lifecycle을 연결한다. PROD-924의 미완료는 PROD-431이나 PR #817의 완료 조건이 아니다.
  타인의 Remote Source는 `interactionPolicy`의 유무나 해석 결과와 관계없이 pending 게시 후 QuoteRequest를
  보내며, 이 lifecycle의 구현은 PROD-924가 담당한다.
- [PROD-792](https://linear.app/byulmaru/issue/PROD-792)의 원격 Quote 수신과
  [PROD-793](https://linear.app/byulmaru/issue/PROD-793)의 Followers Only Source signed fetch 책임은 유지한다.
  로컬 작성 제한을 원격 수신 계약의 축소로 적용하지 않는다. 인증된 Followers Only Source는 exact URI·
  author·canonical followers audience와 현재 Local Follower 접근을 확인한 뒤에만 저장·연결한다.
  검증 중 Follow 해제·승인 상태 변경·Source URI 선점 불일치로 연결이 거부되면 새 private Source·Content·
  Media를 남기지 않고 Quote 작성자의 기존 본문·링크를 보존한다.
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

## 원격 승인 철회 전달 정책 정정 (2026-10-01)

[PR #940 수정 리뷰](https://github.com/byulmaru/kosmo/pull/940#discussion_r4153117882)에서 승인된 정책은
기존의 원본 `Delete(QuoteAuthorization)` forwarding 요구를 대체한다. 현재 동작은 [Post 객체의 Quote federation
정책](../objects/post.md#quote-federation-정책)에 기록한다.

이 Kosmo 정책은 Quote owner가 원본 `Delete`를 forwarding하라는 FEP-044f의 요구와 다르다. `Update(Note)`를
전달하는 동작을 해당 FEP 요구의 준수라고 설명하지 않는다.

## 재승인 정정 (2026-10-03)

철회는 당시 승인을 무효로 만들지만 같은 Quote를 영구적으로 재승인 금지하지 않는다. Local Source Author의
현재 승인 결정 또는 Remote Source Author의 현재 승인으로 검증된 QuoteAuthorization이 있으면 다시 승인할 수
있다. 승인 URI는 같거나 달라도 되며 URI 자체는 현재 승인 결정의 증거가 아니다. 이 재승인 허용은 FEP-044f의
명시 규정이라고 주장하지 않으며, 상세한 동작은 [Post 객체의 Quote federation 정책](../objects/post.md#quote-federation-정책)에
기록한다.

## 현재 승인 재검증과 철회 경계 정정 (2026-10-09)

- Activity ID와 `target` 없는 Delete 수신을 유지한다. 발신자·Authorization·Source·Quote 결속은 계속
  검증하며, `target`이 있으면 Source와 일치해야 한다. Activity ID는 재전송 중복 판정에 사용할 수 있지만
  승인 세대의 identity는 아니다.
- 명확하게 유효한 Delete에는 기존 철회 계약을 적용한다. 동일 Authorization URI 재승인으로 과거 Delete와
  현재 Delete가 모호할 때만 issuer의 현재 QuoteAuthorization을 직접 재검증한다. 로컬 처리 이력만으로
  외부 Delete의 승인 세대를 완전히 식별할 수 있다고 주장하지 않는다.
- 기존 승인 유효성 확인은 Authorization 직접 재검증을 신뢰 근거로 사용한다. Quote Note 조회는 새 승인·
  재승인과 승인 참조 변경 발견 경계에서 사용하며, 기존 승인 재검증의 필수 단계로 확대하지 않는다.
- 404·403·5xx·timeout·JSON-LD 또는 파싱 실패는 단독 철회 근거가 아니다. 200 응답의 type·binding
  불일치도 명시적 철회로 취급하지 않는다. 기존 Approved와 Source 표시를 유지한 채 재검증하며, Source의
  기존 viewer별 접근 조건은 계속 적용한다. 이 경계는 신규 승인·재승인의 fail-closed를 완화하지 않는다.
- 410 상태 코드만으로 철회하지 않는다. 현재 삭제의 증거로 인정하려면 issuer·Authorization URI·redirect·cache
  신뢰 경계를 확인하고 Tombstone이 있으면 type·id 일치도 검증한다. body 없는 410의 충분성과 반복 확인된
  현재 승인 무효의 최종 표현은 별도 상호운용·제품 결정으로 남긴다. 이번 범위에서 새 consent 상태를 만들지 않는다.
- 재검증의 비동기 재시도는 실행 방식이며 별도의 승인·철회 증거가 아니다. 승인 유지와 철회의 조건, Source
  결속 및 작성 본문·링크 보존은 [Post 객체](../objects/post.md#원격-인용-승인-철회-반영)가 소유한다.
- 작성 중 인용 허용 정책은 현재 작성 Profile 기준이다. 실제 작성 Profile 변경 시 `모두`로 초기화하며 같은
  Profile 재선택·picker 취소는 유지한다. 이전 Profile로 돌아가도 과거 선택값을 복원하지 않는다. 본문·CW·
  Media·Visibility 보존 계약은 유지하며, Profile별 저장 기본값 기능은 기존 PROD-925 후속 범위다.

## URL-only 승인 Source 조회 정정 (2026-10-12)

미저장 Source의 URL-only FEP-044f 승인 참조는 현재 issuer 승인 증거 → 저장된 Source 작성자 →
established Local Follower의 인증 조회 순서로 처리한다. 원문 공개 범위를 확인하기 위한 비인증
사전 조회를 하지 않는다. 적합한 Active Local Follower나 서명 key가 없으면 Public·Unlisted 원문이어도
확보하지 않고 Quote를 PENDING으로 유지한다. 이 동작은 조회 전 인증 경계의 일관성을 위해 Follower
없는 URL-only Public 원문의 자동 확보를 제한하는 선택이다. 작성 본문·링크는 유지하며, embedded
Public과 승인 참조 없는 URL-only·legacy 원문의 기존 hydration은 변경하지 않는다.
