# ADR 0031: Profile Block의 ActivityPub 연합

## 상태

Accepted

## 날짜

2026-09-08

## 맥락

Profile Block의 로컬 기능과 ActivityPub 연합은 서로 다른 전달·검증 생명주기를 가진다. 연합에서 별도 제품
차단 상태를 만들면 같은 Profile 사이의 차단과 해제가 진입점에 따라 달라질 수 있다.

ActivityPub은 차단 대상에게 `Block`을 전달하지 않도록 권고한다. Mastodon은 원격 서버에도 차단 의도를 알리는
확장을 사용한다. PROD-818은 Mastodon 호환 발신·수신을 선택한다. Profile Block과 이 연합 기능은 함께 사용
가능해졌으므로, protocol 원본 없이 먼저 존재하던 Local Owner → Remote Target Profile Block은 가능한 제품 상태가 아니다.

## 결정

- Local Owner가 Remote Target을 차단·해제하면 Mastodon 호환 `Block`/`Undo(Block)`로 Target의 원격 서버에
  전달한다. 차단 사실이 그 서버에 알려지며, 상대 서버의 표시·알림과 실제 정책 적용은 Kosmo가 보장하지 않는다.
- verified inbound는 Remote Owner → Local Target의 기존 Profile Block을 생성·제거한다. 동일한 cleanup,
  방향별 콘텐츠 조회·양방향 상호작용 제한과 Owner 해제 권한을 적용하며 별도 제품 상태를 두지 않는다.
- Remote Owner의 해제는 자기 방향 관계에만 적용한다. 반대 방향 Local Owner의 Block은 유지하며, 제거된 Follow
  Request·Follow Relationship은 복구하지 않는다.
- 수신한 차단으로 같은 `Block`을 다시 발신하지 않으며, 수신한 해제로 같은 `Undo(Block)`를 다시 발신하지 않는다.
  차단 생성에서 기존 Follow cleanup이 소유한 필수 효과는 유지한다. 원격 전달 실패는 확정된 로컬 차단·해제를 되돌리지 않는다.
- 발신 대상인 모든 Local Owner → Remote Target 해제는 exact `profileBlockId`로 안정적인 원본 identity를 구성해
  `Undo(Block)`만 전달한다. protocol metadata가 없어도 선행 `Block`을 생성·재발신하거나 해제를 생략하지 않는다.
  상대 서버가 원본 `Block`을 모르는 경우 해당 Undo가 remote no-op이 되는 것은 허용한다.
- inbound Undo는 embedded object가 실제 `Block`일 때만 Profile Block 경로에서 처리한다. URI-only 원본이나
  embedded `Like`·`Follow` 등은 저장된 URI만으로 `Block`이라고 추론하지 않고 기존 해당 Undo 처리기로 넘긴다.
- PROD-813은 로컬 Profile Block의 통합 검증과 완료를 소유한다. PROD-818은 그 완료 후 연합 구현에 착수하며,
  연합 계약의 검증·동기화·archive를 소유한다. 로컬 기능의 출시가 연합 구현을 기다리지는 않는다.

## 이유

Mastodon과 차단 의도를 교환하면서 Kosmo에서는 하나의 차단 관계와 Owner 권한을 유지하기 위한 결정이다.
exact generation identity로 Undo를 재구성하면 metadata 유실 뒤에도 다른 세대를 해제하지 않는다. 또한 embedded
Activity type을 요구하면 URI 충돌만으로 다른 Activity를 Block으로 오인하는 type confusion을 막는다.

## 대안과 결과

- 발신을 제외하고 수신만 처리하는 대안은 채택하지 않았다. PROD-818의 기존 발신·수신 범위를 유지한다.
- 별도 원격 차단 상태는 채택하지 않았다. 생성·해제와 조회 정책은 Profile Block이 소유한다.
- metadata가 없는 해제에서 선행 `Block`을 보내는 대안은 채택하지 않았다. 원격 서버가 원본을 모르는 상태와
  Undo no-op은 허용되며 Kosmo 내부 해제 결과는 유지된다.
- 저장된 protocol URI를 근거로 URI-only 또는 non-Block Undo를 Block으로 추론하는 대안은 채택하지 않았다.
- protocol identity, 중복·순서 역전, 재시도와 배포 방식은 이 도메인 계약을 만족하는 연합 명세에서 구체화한다.

## 근거

- [PROD-818](https://linear.app/byulmaru/issue/PROD-818)의 2026-09-06 관계 재사용·명세 선행 승인,
  2026-09-08 발신 방향 결정과 2026-09-17 리뷰 결정.
- [Profile Block](../objects/profile-block.md)의 관계·행동·권한·조회 정책.
- [W3C ActivityPub §6.9](https://www.w3.org/TR/activitypub/#block-activity-outbox)의 대상 비전달 권고와
  [Mastodon Remote blocking](https://docs.joinmastodon.org/spec/activitypub/#remote-blocking-block) 확장.

## 문서 반영

- [Profile Block](../objects/profile-block.md)에 연합 방향, 관계 재사용, Undo identity와 ingress type 경계를 반영한다.
- PROD-818의 OpenSpec은 이 결정에서 protocol 요구사항과 구현·검증 작업을 도출한다.
