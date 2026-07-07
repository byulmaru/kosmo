# Post List Definition 객체

## 정의

Post List Definition은 하나의 게시 목록이 Post 후보를 선택하고 노출하는 규칙이다. Home, Profile, Hashtag
게시 목록만 현재 범위로 둔다.

## 상태

명시된 상태 차원은 없다.

## 속성

| 속성      | 타입/nullability | 검증 정책                          | 상태별 존재 조건 | 조회 권한                                                                  |
| --------- | ---------------- | ---------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| 목록 종류 | enum, 필수       | Home, Profile, Hashtag만 현재 범위 | 항상             | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| 정렬 기준 | 정책 값, 필수    | 미정                               | 항상             | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| 읽기 위치 | 값, nullable     | 동일 정렬 기준의 목록 위치 표현    | Home 등 viewer별 | `PostList.HomeViewer`                                                      |
| Cursor    | 값, nullable     | 후보 변경 후에도 위치 표현 가능    | 조회 시          | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |

## 관계

| 관계                  | 대상                                                | 조건                         | 조회 권한                                                                  |
| --------------------- | --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| 후보 Post             | [Post](./post.md)                                   | visible eligible Post        | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| viewer Profile        | [Profile](./profile.md)                             | viewer/list control 기준     | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| Profile Relation Rule | [Profile Relation Rule](./profile-relation-rule.md) | Profile mute/block 적용      | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| Word Mute Rule        | [Word Mute Rule](./word-mute-rule.md)               | Word Mute 적용               | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| Hashtag Mute Rule     | [Hashtag Mute Rule](./hashtag-mute-rule.md)         | Hashtag Mute 적용            | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| Profile Domain Block  | [Profile Domain Block](./profile-domain-block.md)   | 개인 원격 Instance 차단 적용 | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |
| Instance              | [Instance](./instance.md)                           | Instance Safety State 적용   | `PostList.HomeViewer`, `PostList.ProfileViewer`, `PostList.PublicExplorer` |

### 후보 규칙

- Home Post List는 viewer Profile이 작성한 visible eligible Original Post, viewer Profile이 수락된 상태로
  팔로우한 Profile의 visible eligible Original Post, Home Post List 답글 정책에 맞는 Reply Post, viewer
  Profile 또는 viewer Profile이 팔로우한 활성 Profile이 작성한 Repost Post를 후보로 삼는다.
- Home Post List의 Reply Post 후보는 viewer Profile의 Post에 달린 답글, viewer Profile이 작성한 답글,
  viewer Profile이 팔로우한 Profile의 Post에 viewer Profile이 팔로우한 Profile이 단 답글로 제한한다.
- Profile Post List는 대상 Profile이 작성한 visible eligible Original Post와 Repost Post를
  후보로 삼는다.
- Hashtag Post List는 visible eligible Original Post 중 Post Visibility가 Public이고 대상 Hashtag가 포함된
  Post만 후보로 삼는다. Reply와 Repost는 포함하지 않는다.

### 제어 정책

#### Control Decision

| 값       | 의미                                       |
| -------- | ------------------------------------------ |
| Include  | 후보 Post를 목록에 노출한다                |
| Collapse | 후보 Post를 경고 또는 접힘 상태로 노출한다 |
| Exclude  | 후보 Post를 목록에 노출하지 않는다         |

| Control              | Home Post List                                  | Profile Post List                      | Hashtag Post List                     |
| -------------------- | ----------------------------------------------- | -------------------------------------- | ------------------------------------- |
| Profile block        | Exclude                                         | Exclude                                | Exclude                               |
| Profile mute         | Exclude                                         | Collapse                               | Exclude                               |
| Word Mute            | 적용 위치와 hide/collapse 결정에 따름           | 적용 위치와 hide/collapse 결정에 따름  | 적용 위치와 hide/collapse 결정에 따름 |
| Hashtag Mute         | 적용 위치와 hide/collapse 결정에 따름           | 적용 위치와 hide/collapse 결정에 따름  | 적용 위치와 hide/collapse 결정에 따름 |
| Profile Domain Block | Exclude                                         | Exclude                                | Exclude                               |
| Domain Limit         | 적용하지 않음                                   | 적용하지 않음                          | Exclude                               |
| Sensitive Media      | Collapse                                        | Collapse                               | Collapse                              |
| Inaccessible Media   | Exclude                                         | Exclude                                | Exclude                               |
| Reply                | Home Post List 답글 정책에 맞는 Reply만 Include | Exclude                                | Exclude                               |
| Post Form = Repost   | 활성 Profile이 작성한 Repost만 Include          | 대상 Profile이 작성한 Repost만 Include | Exclude                               |

## 행동

| 행동              | 행동 주체      | 대상 객체            | 입력값               | 권한                      | 결과                                 |
| ----------------- | -------------- | -------------------- | -------------------- | ------------------------- | ------------------------------------ |
| Home 목록 조회    | viewer Profile | Post List Definition | Cursor               | `PostList.HomeViewer`     | Home 후보와 Control Decision 반환    |
| Profile 목록 조회 | viewer         | Post List Definition | 대상 Profile, Cursor | `PostList.ProfileViewer`  | Profile 후보와 Control Decision 반환 |
| Hashtag 목록 조회 | viewer         | Post List Definition | Hashtag, Cursor      | `PostList.PublicExplorer` | 공개 Hashtag 후보 반환               |
| 읽기 위치 갱신    | viewer Profile | Post List Definition | 위치                 | `PostList.HomeViewer`     | Read Position이 갱신된다             |

## 권한

| 권한                      | 종류      | 성립 조건                 | 대표 참조              |
| ------------------------- | --------- | ------------------------- | ---------------------- |
| `PostList.HomeViewer`     | 객체 종속 | viewer Profile이 있다     | Home Post List 조회    |
| `PostList.ProfileViewer`  | 객체 종속 | 대상 Profile을 볼 수 있다 | Profile Post List 조회 |
| `PostList.PublicExplorer` | 독립      | 공개 탐색 정책을 통과한다 | Hashtag Post List 조회 |

## 불변 조건

- 게시 목록은 viewer가 볼 수 없는 Post를 노출하면 안 된다.
- 모든 Post List Definition은 적용할 viewer/list control set을 명시해야 한다.
- Post List Definition은 Post Visibility와 Post Eligibility를 재해석하지 않고 visible eligible Post만
  후보로 삼는다.
- Post List에는 전역 기본 정책을 두지 않는다.
- Hashtag Post List는 Post Visibility가 Public인 Original Post만 포함하고 Reply와 Repost를 포함하지 않는다.

## 확정 용어

- 게시 목록: Post List
- 홈 게시 목록: Home Post List
- 프로필 게시 목록: Profile Post List
- 해시태그 게시 목록: Hashtag Post List
- 목록 제어: Post List Control
- 제어 결정: Control Decision

## 제외/보류

- Custom Post List, 키워드 수집형 Post List, Local/Federated/List 기반 Post List는 현재 범위에서 제외한다.
