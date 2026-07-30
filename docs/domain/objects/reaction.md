# Reaction 객체

## 정의

Reaction은 Profile이 Post에 남기는 유니코드 이모지 반응이다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 현재 Reaction을 뜻한다.

## 속성

| 속성          | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건           | 조회 권한 |
| ------------- | ---------------- | ------------------------------ | --------- | ------------------- | --------- |
| Reaction Type | 문자열, 필수     | 허용 Reaction Type 중 하나     | 항상      | Post 조회 정책 통과 | 없음      |
| 생성 시각     | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Post 조회 정책 통과 | 없음      |

## 관계

| 관계    | 대상                    | 방향                | cardinality | 존재 조건 | 조회 조건           | 조회 권한 |
| ------- | ----------------------- | ------------------- | ----------- | --------- | ------------------- | --------- |
| Profile | [Profile](./profile.md) | Reaction -> Profile | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |
| Post    | [Post](./post.md)       | Reaction -> Post    | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |

같은 Profile/Post/Reaction Type 조합에는 Reaction이 하나만 존재한다.

## 허용 Reaction Type

초기 Reaction Type은 다음 Unicode 표현만 허용한다.

- `🥹` (`U+1F979`)
- `❤️` (`U+2764 U+FE0F`)
- `🎉` (`U+1F389`)
- `👀` (`U+1F440`)
- `☘️` (`U+2618 U+FE0F`)
- `🌈` (`U+1F308`)

이 목록의 나열 순서는 Reaction Type 개수가 같을 때의 표시 순서를 정의하지 않는다. 동률 표시에는 별도
순서 규칙을 두지 않는다.

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값              | 권한                                                 | 조건                                                                                          | 결과                                                                                              |
| ------------- | ----------------- | --------- | ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Reaction 추가 | Profile           | Reaction  | Post, Reaction Type | Account 요청일 때 `Account.Active`, `Profile.Member` | 행동 주체가 Active/Normal Profile이고 Instance Service가 Active이며 Post 조회 정책을 통과한다 | 같은 조합의 Reaction이 없으면 생성하고, 이미 있으면 기존 Reaction을 유지한 채 멱등 성공한다       |
| Reaction 삭제 | Profile           | Reaction  | Post, Reaction Type | Account 요청일 때 `Account.Active`, `Profile.Member` | 행동 주체가 Active/Normal Profile이고 Instance Service가 Active이다                           | 같은 Profile/Post/Type의 Reaction이 존재하면 제거하고, 없으면 상태를 바꾸지 않은 채 멱등 성공한다 |

Reaction 삭제는 입력한 Post와 Reaction Type에서 행동 주체 Profile의 현재 관계만 식별한다. 다른 Profile이
소유한 Reaction은 변경하지 않는다. 오래 지연된 삭제 요청이 그 사이 같은 조합으로 다시 생성된 현재 Reaction을
제거할 수 있으며, selected Profile이 즉시 같은 Reaction을 다시 생성할 수 있는 낮은 위험의 소셜 상호작용으로
이 가능성을 수용한다.

## ActivityPub 수신 투영

- Remote `Like`와 `EmojiReact`는 저장된 Remote Profile을 행동 주체로 하는 같은 Reaction 추가 행동으로
  materialize한다. 대상은 파생 Local Note URI 또는 저장된 Remote Post URI로 식별되는 기존 Post다.
- Activity의 `actor`는 저장된 Remote Profile actor URI와 일치해야 하고, `object`는 대상 Post의 ActivityPub
  identity와 일치해야 한다. `Like`와 `EmojiReact`의 `to`·`cc` 등 audience는 Post Visibility를 정의하지 않으며,
  대상 Post Author를 포함하지 않거나 생략되어도 수신 Reaction의 유효성 또는 권한 증거로 사용하지 않는다.
  personal inbox와 shared inbox는 같은 actor·object·Post 조회 검증을 사용한다.
- `content`가 허용 Reaction Type과 정확히 일치하면 해당 Type을 사용한다. `content`가 없거나 지원하지 않는
  Unicode, custom emoji shortcode 또는 tag를 사용하면 `❤️`로 투영하며 custom emoji 객체를 만들지 않는다.
- `Like(content)`와 `EmojiReact(content)`는 같은 규칙을 사용한다. Legacy `EmojiReaction`과 Misskey
  `_misskey_reaction`은 수신 계약에 포함하지 않는다.
- Remote activity URI와 materialize된 Reaction은 ActivityPub 전용 1:1 관계로 같은 transaction에 저장한다.
  같은 URI와 같은 actor, object, Type의 재전달은 기존 관계를 유지한 채 멱등 성공한다. 같은 URI를 다른
  actor, object 또는 Type으로 재사용한 전달은 기존 관계를 바꾸지 않는다.
- `Undo`는 저장된 activity URI를 직접 가리키거나 같은 URI의 `Like` 또는 `EmojiReact`를 내장할 수 있다.
  `Undo` actor가 원래 Reaction actor와 일치할 때만 저장된 mapping으로 정확한 Reaction과 mapping을 같은
  transaction에서 제거한다. `Undo` 대상은 네트워크에서 역참조하지 않는다.
- 새 Reaction이 실제 생성되거나 `Undo`로 실제 제거된 경우 기존 Reaction Notification 생성·정리 lifecycle을
  적용한다. Notification 실패는 Reaction과 ActivityPub mapping 결과를 바꾸지 않는다.

## ActivityPub 발신 투영

- Local Profile의 application action으로 실제 생성된 `❤️` Reaction은 `content: "❤️"`를 가진 `Like`로
  전달한다. 실제 생성된 나머지 허용 Type(`🥹`, `🎉`, `👀`, `☘️`, `🌈`)은 정확한 Type을 `content`에 가진
  `EmojiReact`로 전달한다. `Like`는 별도 canonical 좋아요 객체가 아니라 기본 Reaction인 `❤️`의 호환
  표현이다.
- Local Reaction activity URI는 immutable Reaction ID에서 `/ap/reaction/{reactionId}`로 파생한다. 같은
  Reaction의 반복 직렬화는 activity type과 관계없이 같은 URI를 사용한다.
- Activity의 `actor`는 행동 주체 Local Profile의 canonical actor URI이고, `object`는 대상 Post의
  ActivityPub identity다. Local Post는 파생 Note URI를, 저장된 Remote Post는 기존 ActivityPub Post URI를
  사용한다. actor와 activity URI, 서명 key identity는 행동 주체 Profile이 속한 LOCAL Instance의
  canonical origin에서 파생하며, 배포에 configured된 단일 instance와의 일치 여부로 발신을 제한하지
  않는다.
- 발신 대상은 저장된 Remote Post Author actor다. 대상 Post Author actor를 `to`에 포함하고, 저장된 shared
  inbox가 있으면 이를 우선하며 없으면 personal inbox로 직접 전달한다. 행동 주체의 followers collection에는
  fan-out하지 않는다. Local Post 대상 Reaction과
  Local actor identity를 소유하지 않는 Profile의 application action에는 outbound activity를 만들지 않는다.
- Remote Post Author의 Profile과 Instance가 available하고 Instance State가 `Active`일 때만 delivery를
  시도한다. `Unresponsive` 대상에는 현재 상태를 유지한 채 delivery를 시도하지 않으며 `Suspended` 대상은
  기존 Post 조회 정책에 따라 Reaction 추가 대상이 아니다.
- FOLLOWERS Remote Post의 새 `Like` 또는 `EmojiReact`는 delivery 시점에도 행동 주체가 Post Author를 Follow할
  때만 전달한다. 이전에 전달된 Reaction을 실제 삭제하는 `Undo`는 그 사이 Follow 관계가 사라져도 원격 상태를
  철회하기 위해 전달한다.
- 같은 Profile/Post/Type의 멱등 추가는 기존 Reaction을 유지하고 새 activity delivery를 만들지 않는다.
  Reaction이 실제 제거된 경우에만 원본 `Like` 또는 `EmojiReact`를 내장한 `Undo`를 전달한다. `Undo` URI는
  원본 activity URI에 `#undo`를 결합하고, 원본 activity URI를 생성과 취소 delivery의 같은 ordering key로
  사용한다.

## 권한

| 권한             | 종류      | 성립 조건                                  |
| ---------------- | --------- | ------------------------------------------ |
| `Reaction.Owner` | 객체 종속 | 행동 주체 Profile이 Reaction의 Profile이다 |

## 조회 정책

- Reaction은 대상 Post 조회 정책을 그대로 따른다.
- Post의 Reaction 조회 결과는 Reaction Type별 개수와 Reaction을 남긴 Profile 목록을 제공한다.
- Post를 조회하는 현재 selected Profile에는 자신이 남긴 현재 Reaction 목록을 제공한다. guest 또는 selected
  Profile이 없는 viewer에게 이 목록은 비어 있다.
- Reaction Type별 개수는 대상 Post에 현재 존재하는 모든 Reaction을 포함하며, Post를 조회할 수 있는
  viewer 사이에서 달라지지 않는다.
- Profile 목록에는 viewer가 조회할 수 있는 Profile의 Reaction만 포함한다.
- Reaction Type은 개수가 많은 순서로 표시한다.
- Profile Block 생성 결과로 제거되는 Reaction 범위는 [Profile Block](./profile-block.md)이 정의한다.

## 확정 용어

- 반응: Reaction

## 제외/보류

- 좋아요, 부스트 같은 별도 canonical term은 사용하지 않는다.
- 임의 Unicode와 custom emoji Reaction 저장, legacy `EmojiReaction`, Misskey `_misskey_reaction` 확장은
  지원하지 않는다.
