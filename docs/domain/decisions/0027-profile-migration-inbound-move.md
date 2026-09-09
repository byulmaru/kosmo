# ADR 0027: Profile Migration과 inbound ActivityPub Move

## 상태

Accepted

## 날짜

2026-09-07

## 맥락

현재 Profile은 Local·Remote origin과 Follow lifecycle을 정의하지만 Local Profile이 이전 원본 Remote Profile을
가리키는 준비 관계와 ActivityPub `Move` 수신 결과는 정의하지 않는다. 이 경계를 정하지 않으면 source와 target의
identity, `alsoKnownAs` 표현, Local·Remote Follow 정책과 기존 follower 관계의 변경 순서를 구현이 임의로
결정하게 된다.

## 결정

- Profile Migration은 Local Profile target에서 이전 원본인 Remote Profile source로 향하는 준비 관계다. source Profile은
  먼저 materialize하며, 하나의 source는 하나의 Local target에만 연결한다. Local target은 source를 하나만 가질 수
  있다. 이 준비 관계는 inbound Move 처리 완료나 전체 migration 이력을 뜻하지 않는다.
- Local Actor의 `alsoKnownAs` aliases는 Profile Migration 관계의 Remote source canonical Actor URI에서만 파생한다.
  aliases를 별도 사용자 입력이나 독립적인 Profile 속성으로 관리하지 않는다.
- inbound `Move`는 인증된 ActivityPub actor와 object가 같은 canonical Actor URI일 때만 처리한다. target은 기존
  canonical Actor identity로 해석하고, target actor의 `alsoKnownAs`에는 exact source URI가 있어야 한다. 기존
  Actor 종류를 사용하며 Person으로 한정하지 않는다.
- inbound Move는 remote-to-local과 remote-to-remote target을 지원한다. Profile Migration의 Local target은 Follow
  Approval Policy가 Open이어야 하며, remote-to-remote target은 target Profile에 존재하는 Follow Approval Policy를
  따른다.
- Profile Migration source 지정은 Settings의 Profile detail에서 feature flag가 켜져 있을 때만 노출한다. flag가 꺼져
  있거나 값을 확인할 수 없거나 로딩 중이면 source 준비 control을 노출하지 않는다. source 등록은 현재 선택된 Local
  Profile을 target으로 사용하며 별도 target Profile ID 입력을 받지 않는다. flag는 UI 노출 조건일 뿐 권한 증거가 아니며,
  기존 `Account.Active`와 `Profile.Owner` 권한을 유지한다. 같은 source·target pair는 no-op으로 처리하고,
  다른 pair와 충돌하는 요청은 거부한다. 이미 준비된 관계·alias와 inbound Move 처리는 flag 상태로 중단하거나 제거하지
  않는다. Kosmo가 source가 되어 발행하는 outgoing Move는 이 결정의 범위가 아니다.
- source Profile을 Followee로 가진 기존 established Follow Relationship 중 Follower가 Local Profile인 관계는 target
  Follow Relationship 또는 Follow Request를 먼저 저장한 뒤 source 관계를 제거한다. target의 policy에 따라 두 결과
  중 하나를 선택하며, 저장 실패 시 source 관계를 먼저 제거하지 않는다.
- 반복 수신은 이미 존재하는 source·target identity와 기존 Follow/Follow Request lifecycle의 멱등성·재시도로
  수렴한다. 중단된 이전은 기존 Temporal 재시도로 재개하며, 서버 간 receipt 도착 순서는 보장하지 않고 Follow와
  Unfollow의 동시 race를 허용한다.
- 이 결정은 migration 전용 generation protocol이나 저장 table·ledger·effect 구조를 정하지 않는다. 기존
  Profile과 Follow domain contract를 구현 경계에서 재사용한다.

## 이유

source를 Remote Profile로 materialize하면 inbound Move가 아직 알려지지 않은 원격 identity에도 동일한 Profile과
관계 규칙을 적용할 수 있다. 관계에서 aliases를 파생하면 ActivityPub 표현과 내부 identity가 서로 다른 입력으로
갈라지지 않는다.

target Follow 또는 Request를 먼저 저장하면 이전 도중 새 target 관계를 만들지 못해 기존 follower를 잃는 결과를
피할 수 있다. 기존 Follow lifecycle의 재시도와 멱등성을 사용하면서 cross-server 순서와 드문 Follow/Unfollow
race는 제품 보장으로 승격하지 않아 구현 복잡도를 제한한다.

## 결과

- [Profile](../objects/profile.md)은 Profile Migration 관계, inbound Move validation과 현재 선택된 Profile의
  Profile Owner source 지정 경계를 소유한다.
- [Follow Relationship](../objects/follow-relationship.md)은 target Follow/Request 선저장과 source 관계 제거
  순서를 소유한다.
- inbound ActivityPub Move만 후속 계약 대상이며, outgoing Kosmo Move·일반 계정 이동/서버 이전 UI·게시물·미디어·
  팔로잉을 포함한 전체 데이터 이전과 팔로우 가져오기/내보내기는 별도 결정 없이는 추가하지 않는다.
- Move delivery receipt의 전역 순서와 migration 전용 persistence/effect 구조는 이 결정의 보장·범위에 포함하지 않는다.

## 근거

- [PROD-743](https://linear.app/byulmaru/issue/PROD-743)
- [Profile](../objects/profile.md)
- [Follow Relationship](../objects/follow-relationship.md)
- [Follow Request](../objects/follow-request.md)

## 문서 반영

- [Profile](../objects/profile.md)은 Profile Migration source/target 관계와 inbound ActivityPub Move 결과를
  정의한다.
- [Follow Relationship](../objects/follow-relationship.md)은 target 관계 또는 요청 선저장 후 source 관계를
  제거하는 Follow 이전을 정의한다.
