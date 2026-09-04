# Profile Mute 객체

## 정의

Profile Mute는 Owner Profile이 Target Profile의 콘텐츠가 탐색 목록과 새 Notification에 노출되는 것을
개인적으로 억제한 관계다. Target Profile의 직접 Post List 접근은 제한하지 않는다. 대상 Profile에는 알리지
않으며 기존 관계와 상호작용 객체를 제거하지 않는다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 현재 v1에서는 `expires_at`이 `null`인 관계의 존재가 적용 중인
Mute를 뜻한다. non-null 값의 기간·만료 의미는 `PROD-826`에서 결정한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                                                | 존재 조건 | 조회 조건    | 조회 권한           |
| --------- | ---------------- | -------------------------------------------------------- | --------- | ------------ | ------------------- |
| 만료 시각 | 시각, nullable   | 현재 v1 생성 경로는 영구 Mute를 뜻하는 `null`만 저장한다 | 항상      | Owner만 조회 | `ProfileMute.Owner` |

## 관계

| 관계           | 대상                    | 방향                    | cardinality | 존재 조건 | 조회 조건    | 조회 권한           |
| -------------- | ----------------------- | ----------------------- | ----------- | --------- | ------------ | ------------------- |
| Owner Profile  | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |
| Target Profile | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |

같은 Owner/Target 조합에는 Profile Mute가 하나만 존재하며, 현재 v1에서는 `expires_at`이 `null`인 관계만
적용 중으로 판정한다.

## 행동

| 행동              | 행동 주체 Profile | 대상 객체    | 입력값         | 권한                                  | 조건                                                    | 결과                                                 |
| ----------------- | ----------------- | ------------ | -------------- | ------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Profile Mute 생성 | Owner Profile     | Profile Mute | Target Profile | `Account.Active`, `Profile.Member`    | Owner는 Active/Normal Local Profile이고 Target과 다르다 | `expires_at`이 `null`인 Owner/Target 관계가 생성된다 |
| Profile Mute 제거 | Owner Profile     | Profile Mute | 없음           | `Account.Active`, `ProfileMute.Owner` | Profile Mute가 존재한다                                 | Profile Mute가 제거된다                              |

## 권한

| 권한                | 종류      | 성립 조건                                            |
| ------------------- | --------- | ---------------------------------------------------- |
| `ProfileMute.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Mute의 Owner Profile이다 |

## 조회 정책

- Home/Local/Hashtag Post List에서는 Target Profile의 Post를 Exclude한다.
- Target Profile Post List에서는 Profile Mute를 적용하지 않고 기존 Post Visibility와 Post Eligibility를
  통과한 Post를 정상적으로 표시한다.
- Profile Mute를 적용하는 Post List에서 Repost Source가 있는 후보는 바깥 Post Author와 Source Post Author를
  모두 판정하며, 둘 중 하나라도 Target Profile이면 Exclude한다.
- Target Profile에서 발생한 새 Notification은 생성하지 않는다.
- 기존 Notification의 존재와 Read State는 바꾸지 않는다.
- 현재 v1 Post List 적용 여부는 `expires_at IS NULL` 관계로만 판정한다.

## 확정 용어

- Profile Mute: Profile Mute
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- Profile Mute는 Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark를 제거하지 않는다.
- non-null `expires_at`의 기간 지정, 만료 판정·정리와 만료 시각 생성·변경 의미 및 action은 `PROD-826`에서
  결정하며 현재 범위에서 제공하지 않는다.
