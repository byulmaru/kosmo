# ADR 0030: Post Content Mention Identity and Body Conversion Boundary

## 상태

Accepted

## 날짜

2026-09-14

## 근거

- [PROD-340](https://linear.app/byulmaru/issue/PROD-340)의 2026-09-14 계약 정정.
- [Post](../objects/post.md)와 [Post Content](../objects/post-content.md)의 Mentioned Profile 소유권과
  canonical document 규칙.
- 기존 ActivityPub actor materialization·refresh가 보유한 Profile URL metadata 경계.

## 결정

- inbound typed `Mention.href`는 이미 저장된 ActivityPub actor/Profile mapping으로 알려진 Profile stable identity인지
  먼저 확인한다. `tag.name`, handle과 표시 label의 문자열 일치로 identity를 만들거나 거부하지 않는다.
- typed identity 확인과 본문 HTML 변환은 독립된 경계다. 본문 anchor가 typed href 또는 기존 정상 refresh로 저장된
  Profile URL alias에 대응하면 canonical Mention node로 표현할 수 있다. URL이 다르거나 anchor가 없으면 본문은 안전한
  일반 link 또는 표시 text로 보존한다. body conversion이 fallback이 되어도 typed href에서 확인한 Profile 관계는 유지한다.
- Mentioned Profile 관계는 canonical node의 body conversion과 독립된 typed identity 집합에서 파생한다. 일반 link, `to`/`cc`
  audience와 알려지지 않은 typed target은 관계 입력이 아니다. 서로 다른 Profile이 같은 Profile URL alias를 공유하면 해당
  body anchor는 first match 없이 일반 link/text로 낮추지만 각 typed href의 알려진 Profile 관계는 유지한다.
- Remote Profile URL alias가 비어 있거나 malformed이면 Mention 수신 중 fetch, 새 materialization, backfill을 수행하지 않는다. 기존
  정상 actor materialization·refresh가 alias를 채우거나 제거하며, Mention receipt가 refresh를 새로 트리거하지 않는다. 새 migration이나
  live DB 변경을 이 계약에 추가하지 않는다.
- canonical Mention node에는 `profileId`와 안전하게 정규화한 `label`만 저장하고 actor URI, Profile URL alias와 tag metadata는
  저장하지 않는다. 이미 저장된 Post Content를 alias 학습 뒤 자동 보정하지 않는다.

## 결과와 후속 범위

- `post_mentions`는 기존 revision-owned persisted projection 경계를 유지하며, relation과 Current Content pointer는 같은
  저장 경계에서 처리한다. 구체적인 node/table shape는 구현 artifact에서 검증한다.
- `PROD-910`은 canonical node와 revision-owned relation을 소비하는 renderer·Profile 이동을 별도로 구현한다.
- 일반 link projection, remote Update(Note), outbound Mention federation과 Notification/FCM은 각 후속 계약의 책임으로 남긴다.

## 참고

- [Post Content](../objects/post-content.md)
- [PROD-340](https://linear.app/byulmaru/issue/PROD-340)
