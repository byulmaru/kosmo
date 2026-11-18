# ADR 0032: Current Post Mentions From Body Nodes

## 상태

Accepted

## 날짜

2026-11-15

## 근거

- [PROD-1333](https://linear.app/byulmaru/issue/PROD-1333)의 승인된 current Mentioned Profile 계약.
- 접근과 현재 수신자 판단은 Post가 소유하고, 각 revision의 표시 대상은 해당 document가 소유한다.

## 결정

- Post가 현재 Mentioned Profile 집합을 소유한다. 새 Local 작성(새 Post·Reply·Quote와 향후 작성자 수정)과 새 Remote Note 수신은 새 본문에서 검증을 통과해 저장된 Mention node의 `profileId`만 집합에 포함한다. 반복 node는 본문에 모두 보존하고 같은 `profileId`는 현재 집합에 한 번만 포함한다.
- ActivityPub typed `Mention.href`는 [ADR 0030](./0030-post-content-mention-identity.md)의 기존 actor·Profile 검증을 거쳐 node identity의 후보가 될 수 있다. 검증 성공만으로는 현재 집합에 추가하지 않는다. 기존 URL 일치와 조회·실패 처리를 유지하며 임의 anchor 조회나 검증 완화는 하지 않는다.
- 기존 audience 분류에서 `DIRECT` 대상인 수신 Note는 기존 자격 조건을 통과한 Mention node가 하나 이상 있어야 저장할 수 있다. 그 node는 `ACTIVE` Local Profile과 `ACTIVE` Local Instance를 가리켜야 한다. typed Mention만으로는 충분하지 않다. 나머지 수신 정책은 유지한다.
- 기존 Post의 현재 Mentioned Profile 집합은 저장된 관계 그대로 보존하고 본문에서 다시 계산하지 않는다. Post 소유권을 옮기는 경우에도 저장된 집합을 그대로 유지한다. 내부 Hashtag 재처리처럼 기존 내용을 보존하는 작업은 새 revision을 만들더라도 현재 집합을 정확히 그대로 보존하며, 새 작성물 규칙을 과거 내용에 소급 적용하지 않는다.
- 표시하는 revision의 Mention identity는 그 revision의 document에서 해석하고 기존 Profile visibility 검사를 적용한다. 접근 허용은 revision이 아니라 Post의 현재 정책과 현재 대상 집합을 따른다. 과거 revision 조회·복원 UI는 추가하지 않는다.
- Mention 대상 자격, 변환·identity 검증, node·resolve 한도, fallback, Local Note projection 및 `Create`·`Delete` 전달은 ADR 0030의 나머지 규칙을 따른다. 사용자 수정 UI와 outbound `Update(Note)`는 추가하지 않는다.

## 대체 범위와 이유

ADR 0030 중 body 변환 없이 inbound typed identity만으로 집합을 만들던 규칙과 revision 관계를 renderer의 identity source로 삼던 부분만 대체한다. 나머지 identity 확인·변환·자격·한도와 federation 정책은 유지한다. 접근과 현재 수신자 판단은 Post가 소유하고 document는 revision별 표시 identity를 보존한다. 새 작성물에서는 표시 node와 현재 집합을 일치시키고 기존 집합은 그대로 유지한다.

## 범위 밖

- 기존 Post 집합의 본문 기반 재계산.
- 사용자 수정 UI와 revision history·복원 UI.
- Outbound `Update(Note)` lifecycle.

## 문서 반영

- [Post](../objects/post.md)는 현재 Mentioned Profile 집합과 접근 정책을 정의한다.
- [Post Content](../objects/post-content.md)는 revision별 body identity와 기존 내용을 보존하는 재처리를 정의한다.
- [ADR 0017](./0017-activitypub-local-post-note.md)과 [ADR 0030](./0030-post-content-mention-identity.md)은 이 ADR의 좁은 대체 범위를 제외한 기존 정책의 provenance로 유지한다.
