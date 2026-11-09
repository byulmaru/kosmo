# Natural Language Mute Rule 객체

## 정의

Natural Language Mute Rule은 Owner Profile이 자연어로 입력한 조건을 기준으로 Home Post List에 새로 추가할
Post의 노출을 개인적으로 제어하는 규칙이다. 이 규칙은 조건에 의미상 해당하는 Post만 제외하며, 다른 Profile의
Post 직접 조회나 상호작용 권한을 바꾸지 않는다.

## 상태

별도 상태 차원은 없다. Rule은 Owner가 제거할 때까지 유지되며 만료 시각, Scope, 별도 Decision을 갖지 않는다.
현재는 Owner Profile마다 Rule을 하나만 둘 수 있다. 복수 Rule 동시 사용은 현재 범위에 포함하지 않는다.

## 속성

| 속성        | 타입/nullability | 검증 정책                                                          | 존재 조건 | 조회 조건    | 조회 권한                       |
| ----------- | ---------------- | ------------------------------------------------------------------ | --------- | ------------ | ------------------------------- |
| 자연어 조건 | 문자열, 필수     | 앞뒤 공백을 제거한 뒤 비어 있지 않고 Unicode code point 250개 이하 | 항상      | Owner만 조회 | `NaturalLanguageMuteRule.Owner` |

이미 저장된 250개 초과 조건도 조회·제거할 수 있으며, 변경 시에는 이 검증 정책을 따른다.

## 관계

| 관계          | 대상                    | 방향                                  | cardinality | 존재 조건 | 조회 조건    | 조회 권한                       |
| ------------- | ----------------------- | ------------------------------------- | ----------- | --------- | ------------ | ------------------------------- |
| Owner Profile | [Profile](./profile.md) | Natural Language Mute Rule -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `NaturalLanguageMuteRule.Owner` |

같은 Owner Profile에는 Natural Language Mute Rule이 최대 하나만 존재한다.

## 행동

| 행동                            | 행동 주체 Profile | 대상 객체                  | 입력값      | 권한                                                                | 조건                                                                   | 결과                                                                                                          |
| ------------------------------- | ----------------- | -------------------------- | ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Natural Language Mute Rule 생성 | Owner Profile     | Natural Language Mute Rule | 자연어 조건 | `Account.Active`, `Profile.Member`                                  | Owner는 Active/Normal Local Profile이고 정규화한 조건이 비어 있지 않다 | Rule이 없으면 정규화한 조건으로 생성한다. 같은 조건의 생성 재요청은 기존 Rule을 반환하고 중복 생성하지 않는다 |
| Natural Language Mute Rule 변경 | Owner Profile     | Natural Language Mute Rule | 자연어 조건 | `Account.Active`, `Profile.Member`, `NaturalLanguageMuteRule.Owner` | 요청 Profile이 Rule의 Owner Profile이고 정규화한 조건이 비어 있지 않다 | 앞뒤 공백을 제거한 조건으로 바뀐다                                                                            |
| Natural Language Mute Rule 제거 | Owner Profile     | Natural Language Mute Rule | 없음        | `Account.Active`, `Profile.Member`, `NaturalLanguageMuteRule.Owner` | 요청 Profile이 Rule의 Owner Profile이다                                | Rule이 제거된다                                                                                               |

## 권한

| 권한                            | 종류      | 성립 조건                                                          |
| ------------------------------- | --------- | ------------------------------------------------------------------ |
| `NaturalLanguageMuteRule.Owner` | 객체 종속 | 행동/요청 Profile이 Natural Language Mute Rule의 Owner Profile이다 |

여기서 Owner는 Rule을 소유한 Profile identity를 뜻하며 Account-Profile Membership의 `AccountProfileRole.OWNER`를
요구하지 않는다. 해당 Owner Profile에 대해 `Profile.Member`인 Active Account는 MEMBER 또는 OWNER Membership으로
행동할 수 있다. 생성·조회·변경·제거에는 `Account.Active`와 `Profile.Member`가 필요하고, 변경·제거·조회에는
`NaturalLanguageMuteRule.Owner`도 필요하다. 생성 시 Owner Profile은 Active/Normal Local 상태여야 한다.

## 조회 정책

- Natural Language Mute Rule은 Home Post List에 Post를 새로 추가할 때만 적용한다. 일반 적재, Follow 보정에 따른
  추가, Home 목록의 cache 재구성에서 새로 추가하는 경우에도 같은 정책을 적용한다.
- 기존 Post Visibility, Post Eligibility, Profile Block, Profile Mute와 조회할 수 없는 Media 정책을 먼저 적용한다.
  이 규칙은 기존 접근·제외 정책을 통과한 항목만 추가로 제외할 수 있으며 접근 범위를 넓히지 않는다.
- 판정 대상은 Content가 있는 Post 자체다. Quote도 자체 판정 대상이며, viewer가 대상 Post의 작성자이면 의미 판정과
  해당 판정 cache 조회·저장을 건너뛰고 기존 Home eligibility에 따라 포함한다. Content 없는 순수 Repost는 독립
  판정하지 않고 Repost Author와 무관하게 direct Source Post를 판정 대상으로 쓴다. Source가 Quote이면 그 Quote의
  판정을 공유하며, Quote가 가리키는 Source까지 판정 대상을 바꾸지 않는다.
- cache miss의 판정 입력은 대상 Post의 Content, CW, 조회 가능한 이미지와, 대상이 Quote이면 그 direct Source의
  Content, CW, 조회 가능한 이미지로 제한한다. direct Source보다 안쪽의 Post, Reply Thread, 네트워크에서 추가로
  찾은 내용은 확장해 검사하지 않는다. viewer가 조회할 수 없는 내용은 외부 의미 판정에 전달하지 않는다.
- 의미 일치 확률 추정값이 `0.8` 이상이면 해당 Home 추가를 Exclude하고, 그보다 낮으면 기존 정책에 따라 처리한다.
- 의미 판정은 외부 판정 요청 한 번으로 최대 5초까지 수행한다. 요청 오류, 시간 초과, 거절, 잘못된 응답 또는 필요한
  이미지 입력 준비 실패가 있으면 이 규칙은 해당 항목을 Exclude하지 않는다. 기존 접근·Visibility·Eligibility 정책은
  계속 적용하며, 실패한 판정은 성공한 판정으로 저장하지 않는다.
- 유효한 포함·제외 판정과 조건 일치 확률 추정값은 같은 Owner Profile과 판정 대상 Post ID에 대해 최대 7일간 함께
  재사용한다. Content Post와 Quote는 각자의 ID를 사용하고, 순수 Repost는 direct Source Post ID의 판정을 재사용한다.
  이전에 Repost 자체를 대상으로 저장한 판정은 재사용하지 않으며, 기존 만료 시각까지 유지된 뒤 만료한다. 확률 추정값은
  판정 정확도를 뜻하지 않으며, 판정 시각은 보존하지 않는다. 자연어 조건, 판정 모델, 임계값, Post Content 수정은 기존
  판정을 무효화하지 않는다. cache 만료나 유실 뒤에는 당시의 Rule과 Content로 다시 판정할 수 있다.
- Smart Filter 결과 목록의 대상·접근 권한·시점·batch 계약은 [Home Post List 정책](../policies/post-list.md#home-post-list)을
  따른다. 단일 Post의 `smartFilterProbability`는 기존 cache 값을 fallback으로 조회할 수 있으며, 이 조회는 Rule을 재평가하거나
  cache 만료 시간을 연장하지 않는다.
- Rule 생성·변경·제거와 판정 대상 식별 방식 변경은 이미 Home에 추가된 Post를 소급 재판정하거나 제거하지 않으며,
  기존 판정도 무효화하거나 다른 Post ID로 이전하지 않는다.
  현재 Rule이 없으면 이후 새 Home 추가는 기존 정책을 따른다. Rule을 다시 만들면 아직 유효한 이전 판정을 재사용할 수 있다.
- Natural Language Mute Rule은 Local, Profile, Hashtag Post List, 검색, Notification, Bookmark, Post 직접 조회와
  상호작용에는 적용하지 않는다.

## 확정 용어

- 자연어 뮤트 규칙: Natural Language Mute Rule
- 스마트 뮤트: Natural Language Mute Rule의 표시 이름
- Owner Profile: Owner Profile

## 제외/보류

- 저장 완료 뒤 응답 유실로 재시도되는 경우, 제거 뒤 늦은 생성 재시도로 Rule이 다시 생기거나 이전 변경 재시도가
  최신 조건을 덮을 수 있는 드문 경합은 허용하고 보류한다.
- 프로필당 복수 Rule, 다른 목록·검색·알림 Scope, 만료 설정, 개별 Post 예외·전환 동작, 판정 설명, 판정 지표는 현재
  범위에서 제공하지 않는다.
