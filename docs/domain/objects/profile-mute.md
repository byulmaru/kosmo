# Profile Mute 객체

## 정의

Profile Mute는 Owner Profile이 Target Profile의 콘텐츠가 탐색 목록과 새 Notification에 노출되는 것을
개인적으로 억제한 관계다. Target Profile의 직접 Post List 접근은 제한하지 않는다. 대상 Profile에는 알리지
않으며 기존 관계와 상호작용 객체를 제거하지 않는다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 현재 v1 생성 경로는 만료 시각이 없는 영구 Mute만 만든다.
새 Notification 생성에서는 만료 시각이 없거나 DB 현재 시각보다 미래인 관계를 적용 중인 Mute로
판정한다. 만료 시각이 DB 현재 시각과 같거나 과거이면 새 Notification을 억제하지 않는다.

## 속성

| 속성      | 타입/nullability | 검증 정책                                                | 존재 조건 | 조회 조건    | 조회 권한           |
| --------- | ---------------- | -------------------------------------------------------- | --------- | ------------ | ------------------- |
| 만료 시각 | 시각, nullable   | 현재 v1 생성 경로는 영구 Mute를 뜻하는 `null`만 저장한다 | 항상      | Owner만 조회 | `ProfileMute.Owner` |

## 관계

| 관계           | 대상                    | 방향                    | cardinality | 존재 조건 | 조회 조건    | 조회 권한           |
| -------------- | ----------------------- | ----------------------- | ----------- | --------- | ------------ | ------------------- |
| Owner Profile  | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |
| Target Profile | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |

같은 Owner/Target 조합에는 Profile Mute가 하나만 존재한다. 만료된 관계가 남아 있어도 그 관계만으로
새 Notification을 억제하지 않으며, 만료 판정이 관계를 삭제하지는 않는다.

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
- Profile Post List에서는 직접 방문한 Profile만 Profile Mute의 예외로 허용한다. 방문한 Profile의 Post는
  기존 Post Visibility와 Post Eligibility를 통과하면 표시하지만, 다른 Mute Target을 direct Source Author로
  가진 Repost·Quote는 Exclude한다.
- Profile Mute를 적용하는 Post List에서 Repost Source가 있는 후보는 바깥 Post Author와 Source Post Author를
  모두 판정하며, 예외로 허용한 Profile을 제외한 둘 중 하나라도 Mute Target이면 Exclude한다.
- Bookmark 목록과 Post 직접 조회·상호작용에는 Profile Mute를 적용하지 않는다. 기존 Visibility와
  Eligibility는 계속 적용한다.
- 새 Notification 생성 시 Owner인 Recipient가 Target인 Related Profile을 Mute했고 만료 시각이 없거나
  DB 현재 시각보다 미래이면 생성하지 않는다. 만료 시각이 DB 현재 시각과 같거나 과거이면 Mute에 의한
  생성 억제는 적용하지 않으며, Profile Block과 다른 생성 조건은 계속 적용한다.
- 만료 뒤 새 원인 행동에는 당시의 Mute 상태를 적용한다. 만료만으로 과거에 억제한 Notification을
  소급 생성하지 않는다.
- 기존 Notification의 존재와 Read State는 바꾸지 않는다.
- 현재 v1 Post List 적용 여부는 `expires_at IS NULL` 관계로만 판정한다.

## 확정 용어

- Profile Mute: Profile Mute
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- Profile Mute는 Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark를 제거하지 않는다.
- 기간 preset, 만료 시각 생성·변경 action, Post List의 기간 Mute 적용과 만료 관계 정리는 `PROD-826`에서
  결정하며 현재 범위에서 제공하지 않는다. 새 Notification 생성의 만료 판정은 위 정책을 따른다.
