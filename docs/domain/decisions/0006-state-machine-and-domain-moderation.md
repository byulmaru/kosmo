# ADR 0006: State Rules and Domain Moderation

## 상태

Accepted

## 날짜

2026-06-29

## 결정

Profile 상태 변경 규칙은 [Profile](../objects/profile.md)의 행동 결과로 명시한다.

- Profile State는 활성, 비활성화, 정지, 삭제됨 네 상태를 가진다.
- 삭제됨은 terminal 상태이며 되돌릴 수 없다.
- `Owner` Account는 활성 Profile을 비활성화하고, 비활성화 Profile을 재활성화할 수 있다.
- Profile 삭제는 비활성화 상태에서만 수행한다.
- 정지는 운영자 Account의 action 결과이며, 정지 해제도 운영자 Account가 수행한다.
- `Owner` Account는 정지 상태를 직접 해제할 수 없다.
- 정지 해제 시 Profile은 정지 전 상태로 복구된다.
- active Profile은 활성 상태여야 한다.

Instance state taxonomy는 [Instance](../objects/instance.md)에 둔다.

- Instance Safety State는 운영자 Account가 원격 Instance 전체에 적용하는 safety 상태다.
- Instance Safety State는 Profile 제어의 mute/block과 구분한다.
- Instance Reachability State는 원격 Instance에 요청을 보낼 수 있는지 기록하는 상태다.
- Domain Limit은 원격 Instance의 도달 범위를 제한한다.
- Domain Block은 원격 Instance를 없는 것처럼 취급한다.
- Unreachable은 응답 실패로 원격 요청을 일시 중단한 상태다.
- Suspended는 원격 Instance가 명시적으로 정지된 상태다.
- Domain Limit은 전역 Post Eligibility를 false로 만들지 않고 Hashtag Post List 같은 공개 탐색 성격의
  Post List와 Search Index 후보 제한으로 적용한다.
- Domain Block은 [Post](../objects/post.md)의 Post Eligibility에 반영되는 전역 제외 정책이다.
- [Instance](../objects/instance.md)가 Instance Safety State 원본 정책을 소유하고, Post, Media,
  Follow Relationship, Follow Request, Post List Definition, Search Index, Notification Item은 그 결과를 직접
  소비한다.
- Reaction과 Bookmark는 Post Visibility와 Post Eligibility를 통해 Instance Safety State 결과를 간접
  소비하고, Repost는 Post Form 상태 값으로 Post가 직접 소비한다.
- Instance Safety State는 기존 Notification을 삭제하거나 읽음 상태를 바꾸지 않는다.
- Instance Reachability State는 원격 요청 여부를 제어하며, 그 자체로 공개 콘텐츠 노출 정책을 넓히거나
  좁히지 않는다.
- 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로 분리한다.

## 문서 반영

- [Profile](../objects/profile.md)은 Profile State와 상태 변경 행동을 명시한다.
- [Instance](../objects/instance.md)는 safety 상태와 reachability 상태를 명시한다.
- [2026-06-29 도메인 경계 후속 결정 기록](../records/2026-06-29-domain-boundary-followup.md)의 열린
  질문은 후속 기록으로 닫는다.
