# Hashtag Mute Rule 객체

## 정의

Hashtag Mute Rule은 Owner Profile이 특정 Hashtag를 기준으로 Post List, 검색, Notification 노출을 제어하는
규칙이다.

## 상태

### Mute Scope

Mute Scope는 여러 값을 동시에 가질 수 있다.

| 값           | 의미                             |
| ------------ | -------------------------------- |
| Home         | Home Post List에 적용            |
| Profile      | Profile Post List에 적용         |
| Hashtag      | Hashtag Post List에 적용         |
| Search       | 검색 결과에 적용                 |
| Notification | 새 Notification Item 생성에 적용 |

### Mute Decision

| 값       | 의미                 |
| -------- | -------------------- |
| Exclude  | 후보에서 제거한다    |
| Collapse | 접힌 상태로 노출한다 |

## 속성

| 속성      | 타입/nullability | 검증 정책                           | 존재 조건 | 조회 조건    | 조회 권한               |
| --------- | ---------------- | ----------------------------------- | --------- | ------------ | ----------------------- |
| 만료 시각 | 시각, nullable   | 생성/변경 시 미래 시각이거나 영구다 | 항상      | Owner만 조회 | `HashtagMuteRule.Owner` |

## 관계

| 관계           | 대상                    | 방향                         | cardinality | 존재 조건 | 조회 조건    | 조회 권한               |
| -------------- | ----------------------- | ---------------------------- | ----------- | --------- | ------------ | ----------------------- |
| Owner Profile  | [Profile](./profile.md) | Hashtag Mute Rule -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `HashtagMuteRule.Owner` |
| Target Hashtag | [Hashtag](./hashtag.md) | Hashtag Mute Rule -> Hashtag | 1 -> 1      | 항상      | Owner만 조회 | `HashtagMuteRule.Owner` |

같은 Owner Profile과 Target Hashtag 조합에는 적용 중인 Rule이 하나만 존재한다.

## 행동

| 행동                   | 행동 주체 Profile | 대상 객체         | 입력값                              | 권한                                      | 조건                                                                                                                           | 결과                                                                         |
| ---------------------- | ----------------- | ----------------- | ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Hashtag Mute Rule 생성 | Owner Profile     | Hashtag Mute Rule | Hashtag, Scope, Decision, 만료 시각 | `Account.Active`, `Profile.Member`        | Owner는 Active/Normal Local Profile이고 Scope가 하나 이상이며 만료 시각이 미래이거나 영구다. 같은 조합의 적용 중인 Rule이 없다 | 입력 Scope/Decision과 Owner/Hashtag 관계를 가진 Hashtag Mute Rule이 생성된다 |
| Hashtag Mute Rule 변경 | Owner Profile     | Hashtag Mute Rule | Scope, Decision, 만료 시각          | `Account.Active`, `HashtagMuteRule.Owner` | Scope가 하나 이상이고 만료 시각이 미래이거나 영구다                                                                            | Scope, Decision, 만료 시각이 바뀐다                                          |
| Hashtag Mute Rule 제거 | Owner Profile     | Hashtag Mute Rule | 없음                                | `Account.Active`, `HashtagMuteRule.Owner` | Rule이 존재한다                                                                                                                | Hashtag Mute Rule이 제거된다                                                 |

## 권한

| 권한                    | 종류      | 성립 조건                                                 |
| ----------------------- | --------- | --------------------------------------------------------- |
| `HashtagMuteRule.Owner` | 객체 종속 | 행동/요청 Profile이 Hashtag Mute Rule의 Owner Profile이다 |

## 조회 정책

- Rule은 선택된 Scope에서만 소비한다.
- Post List와 검색에서는 Mute Decision을 적용하고 Notification Scope에서는 일치하는 새 Notification Item을
  생성하지 않는다.
- 기존 Notification Item의 존재와 Read State는 바꾸지 않는다.
- 만료 시각이 지난 Rule은 조회 정책에 적용하지 않는다.

## 확정 용어

- 해시태그 뮤트: Hashtag Mute
- 해시태그 뮤트 규칙: Hashtag Mute Rule
- Mute Scope: Mute Scope
- Mute Decision: Mute Decision

## 제외/보류

- Hashtag 자동완성, trend, 추천 정책은 현재 범위에서 제외한다.
