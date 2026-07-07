# Word Mute Rule 객체

## 정의

Word Mute Rule은 owner Profile이 특정 단어를 기준으로 Post List, Search, Notification 노출을 제어하는 규칙이다.

## 상태

명시된 상태 차원은 없다.

## 속성

| 속성               | 타입/nullability | 검증 정책                            | 상태별 존재 조건 | 조회 권한                  |
| ------------------ | ---------------- | ------------------------------------ | ---------------- | -------------------------- |
| 대상 단어          | 문자열, 필수     | 대소문자 구분 없음, 부분 문자열 매치 | 항상             | `Safety.WordMuteRuleOwner` |
| 적용 위치          | enum 목록, 필수  | Home, Notification, Hashtag, Search  | 항상             | `Safety.WordMuteRuleOwner` |
| hide/collapse 결정 | enum, 필수       | Exclude 또는 Collapse                | 항상             | `Safety.WordMuteRuleOwner` |
| 만료 시각          | 시각, nullable   | 영구 또는 기간제                     | 항상             | `Safety.WordMuteRuleOwner` |

## 관계

| 관계           | 대상                                              | 조건                | 조회 권한                                                                  |
| -------------- | ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| owner Profile  | [Profile](./profile.md)                           | rule을 가진 Profile | `Safety.WordMuteRuleOwner`                                                 |
| 게시 목록 정책 | [Post List Definition](./post-list-definition.md) | Post List 적용      | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| 검색 정책      | [Search Index](./search-index.md)                 | Search 적용         | `Search.SafeScope`                                                         |
| 알림 정책      | [Notification Item](./notification-item.md)       | Notification 적용   | `Notification.Recipient`                                                   |

## 행동

| 행동           | 행동 주체 Profile | 대상 객체      | 입력값                      | 권한                       | 결과                                                                                        |
| -------------- | ----------------- | -------------- | --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| Word Mute 생성 | Profile           | Word Mute Rule | 단어, 적용 위치, 기간, 결정 | `Safety.WordMuteRuleOwner` | Word Mute Rule이 생성되고, 지정한 적용 위치에서만 소비된다                                  |
| Word Mute 변경 | owner Profile     | Word Mute Rule | 적용 위치, 기간, 결정       | `Safety.WordMuteRuleOwner` | Word Mute Rule이 바뀌고, Notification 미적용 규칙은 새 Notification Item 생성을 막지 않는다 |
| Word Mute 제거 | owner Profile     | Word Mute Rule | 없음                        | `Safety.WordMuteRuleOwner` | Word Mute Rule이 제거된다                                                                   |

## 권한

| 권한                       | 종류      | 성립 조건                                                                                                     | 대표 참조           |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| `Safety.WordMuteRuleOwner` | 객체 종속 | 행동 주체 Profile이 Word Mute Rule의 owner Profile이다. 생성 시에는 생성될 Word Mute Rule의 owner Profile이다 | Word Mute Rule 조회 |

## 불변 조건

- 추가 전역 불변 조건은 두지 않는다. 행동별 제약은 행동 결과에 둔다.

## 확정 용어

- 단어 뮤트: Word Mute
- 단어 뮤트 규칙: Word Mute Rule

## 제외/보류

- 정규식, 형태소 분석, 언어별 토큰화 정책은 현재 범위에서 제외한다.
