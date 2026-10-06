# ADR 0030: Post Content Mention Identity and Body Conversion Boundary

## 상태

Accepted

## 날짜

2026-09-14

## 근거

- [PROD-340](https://linear.app/byulmaru/issue/PROD-340)의 2026-09-14 계약 정정.
- [PROD-652](https://linear.app/byulmaru/issue/PROD-652)의 2026-10-06 Local Mention 작성 계약 확장.
- [Post](../objects/post.md)와 [Post Content](../objects/post-content.md)의 Mentioned Profile 소유권과
  canonical document 규칙.
- 기존 ActivityPub actor materialization·refresh가 보유한 Profile URL metadata 경계.

## 결정

- Local Post, Reply, Quote 작성은 작성자가 명시적으로 선택한 Profile identity와 일치하는 본문 handle token에서 Mention relation을 만든다. 서버는 실제 작성 Profile 기준으로 선택 Profile의 visibility와 양방향 Block 정책을 검증한다. 하나라도 본문과 일치하지 않거나 이용할 수 없는 Profile이 있으면 전체 작성 요청을 거부한다. 같은 Profile의 여러 occurrence는 각 canonical Mention node로 남고 relation은 중복 저장하지 않는다. 직접 입력한 `@handle` 문자열만으로는 Profile identity를 만들지 않는다. Local authored body는 document 및 길이 검증에 사용하고 저장하지 않는다. Canonical Mention node는 inbound와 동일하게 `profileId`만 저장한다.
- Local Mention은 Post Visibility, DIRECT audience/addressee, outbound ActivityPub `Mention` tag, delivery, 알림 정책을 변경하지 않는다.
- inbound typed `Mention.href`는 먼저 기존 ActivityPub actor/Profile mapping을 확인한다. 이미 알려진 Local/Remote Profile은
  현재 mapping을 그대로 사용한다. 알려지지 않은 remote actor target은 Note당 최대 32개의 고유 remote actor URI까지 typed href를 통해
  resolve하고 materialize할 수 있다. 한도 내 target의 remote actor 조회는 모두 동시에 시작하며, 각 조회는 기존 actor URI 기반 Temporal
  Workflow로 처리한다. 호출자는 각 조회 결과를 공용 `runWorkflow`의 기본 client deadline인 최대 30초 동안 기다린다. deadline 안에
  결과를 받지 못하거나 조회가 실패하면 그 Mention만 건너뛴다. 이 deadline은 caller의 대기 한도이며 Workflow를 명시적으로 취소하지 않고,
  별도 keepalive도 하지 않는다. caller가 대기를 멈춘 뒤 Workflow가 계속 실행되거나 완료되는지는 보장하지 않는다. 다른 Mention의 확인 결과와
  Note 전체는 유지한다. 한도를 넘은 target도 건너뛴다. 본문 anchor나
  `Mention.name`은 actor를 찾거나 fetch하는 입력으로 사용하지 않는다. 본문 anchor href가 확인된 Profile의 actor URI, 저장된 Profile
  URL alias 또는 기존 trusted local human URL과 정확히 일치할 때만 `profileId` Mention node로 표현할 수 있다. 알 수 없거나 일치하지
  않는 anchor는 `tag.name`, handle 또는 표시 문자열과 관계없이 안전한 일반 link 또는 표시 text로 보존한다.
- typed identity 확인과 본문 HTML 변환은 독립된 경계다. 본문 URL이 확인되지 않아 안전한 일반 link/text로 남더라도
  typed href에서 확인한 Profile 관계는 유지한다.
- Mentioned Profile 관계는 canonical node의 body conversion과 독립된 typed identity 집합에서 파생한다. 일반 link, `to`/`cc`
  audience와 제한된 resolve 후에도 확인되지 않은 typed target은 관계 입력이 아니다. 서로 다른 Profile이 같은 Profile URL alias를
  공유하면 해당 body anchor는 first match 없이 일반 link/text로 낮추지만 각 typed href의 확인된 Profile 관계는 유지한다.
- canonical Mention node에는 `profileId`만 저장한다. 원문 anchor의 표시 문자열은 수신 중 loose resource/length budget 계산에
  필요한 동안만 사용하고 canonical document, 관계, GraphQL 응답 또는 renderer 입력으로 저장하지 않는다. renderer는 같은
  revision의 Profile `relativeHandle`에서 표시 문자열을 파생하며, 관계가 없거나 Profile을 조회할 수 없으면 Profile 이동 없는
  `@알 수 없는 사용자`를 표시한다.
- 이미 알려진 Remote Profile의 URL alias가 비어 있거나 malformed이면 Mention receipt가 그 actor를 다시 fetch하거나 refresh하지 않으며,
  cached `profileUrl`을 채우지 않는다. 별도의 기존 actor materialization·refresh 경로는 alias를 갱신할 수 있다. typed `Mention.href`로
  제한적으로 resolve한 미확인 remote actor target만 새로 materialize할 수 있고, body anchor href나 `Mention.name` fetch, 기존 글의 자동
  수정, 운영자 또는 일괄 backfill은 수행하지 않는다. 새 migration이나 live DB 변경을 이 계약에 추가하지 않는다.

## 결과와 후속 범위

- `post_mentions`는 기존 revision-owned persisted projection 경계를 유지하며, relation과 Current Content pointer는 같은
  저장 경계에서 처리한다. 구체적인 node/table shape는 구현 artifact에서 검증한다.
- `PROD-910`은 canonical node와 revision-owned relation을 소비하는 renderer·Profile 이동을 별도로 구현한다.
- 일반 link projection, remote Update(Note), outbound Mention federation과 Notification/FCM은 각 후속 계약의 책임으로 남긴다.

## 참고

- [Post Content](../objects/post-content.md)
- [PROD-340](https://linear.app/byulmaru/issue/PROD-340)
- [PROD-652](https://linear.app/byulmaru/issue/PROD-652)
