# Hashtag Mute Rule 객체

## 정의

Hashtag Mute Rule은 owner Profile이 특정 Hashtag를 기준으로 Post List, Search, Notification 노출을 제어하는 규칙이다.

## 상태

명시된 상태 차원은 없다.

## 속성

| 속성               | 타입/nullability | 검증 정책                           | 상태별 존재 조건 | 조회 권한                     |
| ------------------ | ---------------- | ----------------------------------- | ---------------- | ----------------------------- |
| 대상 Hashtag       | 문자열, 필수     | 대소문자 구분 없음, `#` 유무 정규화 | 항상             | `Safety.HashtagMuteRuleOwner` |
| 적용 위치          | enum 목록, 필수  | Home, Notification, Hashtag, Search | 항상             | `Safety.HashtagMuteRuleOwner` |
| hide/collapse 결정 | enum, 필수       | Exclude 또는 Collapse               | 항상             | `Safety.HashtagMuteRuleOwner` |
| 만료 시각          | 시각, nullable   | 영구 또는 기간제                    | 항상             | `Safety.HashtagMuteRuleOwner` |

## 관계

| 관계           | 대상                                              | 조건                | 조회 권한                                                                  |
| -------------- | ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| owner Profile  | [Profile](./profile.md)                           | rule을 가진 Profile | `Safety.HashtagMuteRuleOwner`                                              |
| 대상 Hashtag   | [Hashtag](./hashtag.md)                           | mute 대상           | `Safety.HashtagMuteRuleOwner`                                              |
| 게시 목록 정책 | [Post List Definition](./post-list-definition.md) | Post List 적용      | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| 검색 정책      | [Search Index](./search-index.md)                 | Search 적용         | `Search.SafeScope`                                                         |
| 알림 정책      | [Notification Item](./notification-item.md)       | Notification 적용   | `Notification.Recipient`                                                   |

## 행동

| 행동              | 행동 주체 Profile | 대상 객체         | 입력값                         | 권한                          | 결과                                                                                           |
| ----------------- | ----------------- | ----------------- | ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Hashtag Mute 생성 | Profile           | Hashtag Mute Rule | Hashtag, 적용 위치, 기간, 결정 | `Safety.HashtagMuteRuleOwner` | Hashtag Mute Rule이 생성되고, 지정한 적용 위치에서만 소비된다                                  |
| Hashtag Mute 변경 | owner Profile     | Hashtag Mute Rule | 적용 위치, 기간, 결정          | `Safety.HashtagMuteRuleOwner` | Hashtag Mute Rule이 바뀌고, Notification 미적용 규칙은 새 Notification Item 생성을 막지 않는다 |
| Hashtag Mute 제거 | owner Profile     | Hashtag Mute Rule | 없음                           | `Safety.HashtagMuteRuleOwner` | Hashtag Mute Rule이 제거된다                                                                   |

## 권한

| 권한                          | 종류      | 성립 조건                                                                                                           | 대표 참조              |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `Safety.HashtagMuteRuleOwner` | 객체 종속 | 행동 주체 Profile이 Hashtag Mute Rule의 owner Profile이다. 생성 시에는 생성될 Hashtag Mute Rule의 owner Profile이다 | Hashtag Mute Rule 조회 |

## 불변 조건

- 추가 전역 불변 조건은 두지 않는다. 행동별 제약은 행동 결과에 둔다.

## 확정 용어

- 해시태그 뮤트: Hashtag Mute
- 해시태그 뮤트 규칙: Hashtag Mute Rule

## 제외/보류

- 해시태그 자동완성, trend, 추천 해시태그 정책은 현재 범위에서 제외한다.
