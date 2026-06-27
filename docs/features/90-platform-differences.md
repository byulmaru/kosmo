# 플랫폼 차이와 미결정 항목

## 목적

이 문서는 X, Bluesky, Mastodon, Misskey의 기능 차이를 Kosmo 제품 결정에 연결하기 위한
메모다. 같은 기능이 다른 이름을 가지거나, 비슷해 보이지만 실제 작동이 다른 경우 이름을
확정하지 않고 결정 포인트로 남긴다.

## 공통 기능 요약

| 기능 영역      | X                | Bluesky         | Mastodon                     | Misskey                      | Kosmo 초안           |
| -------------- | ---------------- | --------------- | ---------------------------- | ---------------------------- | -------------------- |
| 짧은 게시      | Post             | Post            | Post/Toot 관습               | Note                         | 이름 미결정          |
| 답글           | Reply            | Reply           | Reply                        | Reply                        | 공통 기능            |
| 공유           | Repost           | Repost          | Boost                        | Renote                       | Mastodon식 공유 우선 |
| 인용           | Quote            | Quote           | 신중한 quote post            | Quote renote                 | 제품 결정 필요       |
| 긍정 반응      | Like             | Like            | Favourite                    | Reaction                     | 단일 반응 우선       |
| 북마크         | Bookmark         | Saved 계열 검토 | Bookmark                     | Favorite/Clip 계열           | 공통 저장 기능       |
| 공개 범위      | 공개/제한 계열   | 공개 중심       | 공개/조용한 공개/팔로워/멘션 | 공개/홈/팔로워/다이렉트 계열 | Mastodon 우선        |
| 로컬 피드      | 없음             | 없음            | Local timeline               | Local/Social 계열            | 연합 기능 때 도입    |
| 연합 피드      | 없음             | 프로토콜 다름   | Federated timeline           | Global 계열                  | Mastodon 우선        |
| 커스텀 피드    | 추천/리스트 중심 | Custom Feed     | 리스트/태그 중심             | Antenna/Channel              | 제품 결정 필요       |
| 리스트         | List             | List 계열       | List                         | List 계열                    | 공통 후보            |
| 신고/차단/뮤트 | 있음             | 있음            | 강함                         | 있음                         | 공통 안전 기능       |
| DM             | 있음             | 있음            | 멘션 공개범위 기반           | Direct 계열                  | 제품 결정 필요       |
| 파일함         | 없음             | 없음            | 첨부 중심                    | Drive                        | 제품 결정 필요       |

## Mastodon 우선으로 정할 항목

### 공개 범위

Mastodon의 per-post visibility를 기본 모델로 둔다. 공개/조용한 공개/팔로워 공개/멘션 대상
공개가 충돌을 가장 잘 설명한다. X와 Bluesky는 공개 중심 모델이 강하고, Misskey는 서버별
표현이 다르므로 Kosmo의 연합형 설계에는 Mastodon 쪽이 더 안전하다.

결정 필요:

- 조용한 공개를 포함할지.
- 팔로워 공개 게시를 프로필에서 어떻게 표시할지.
- 멘션 대상 공개 게시를 DM처럼 부를지, 게시 공개 범위로만 설명할지.

### 공유

Mastodon의 boost처럼 원본 게시를 재노출하는 모델을 우선한다. X/Bluesky의 repost와
Misskey의 renote도 유사하지만, 원본 공개 범위를 넘지 않는다는 제약을 명확히 둔다.

결정 필요:

- 공유 카운트와 공유자 목록을 공개할지.
- 비공개 또는 팔로워 공개 게시 공유를 금지할지.
- 원격 게시 공유 실패 상태를 사용자에게 어떻게 보여줄지.

### Content Warning

Mastodon의 CW를 우선 기능으로 둔다. X/Bluesky보다 연합형 단문 SNS에서 더 명확한 사용자
통제 수단이다.

결정 필요:

- CW를 게시 작성의 기본 옵션으로 노출할지.
- 민감 미디어와 CW를 별도 설정으로 둘지.
- 특정 서버 정책에서 CW를 요구할 수 있는지.

### 필터와 모더레이션

Mastodon의 mute/block/filter/report/server moderation을 기본 모델로 둔다. Bluesky의
labeler는 강력하지만 운영 모델이 크다.

결정 필요:

- filter를 완전 숨김으로 할지 접힘으로 할지.
- 도메인 차단 결과를 사용자에게 얼마나 노출할지.
- 운영자 action audit log와 사용자 통지 범위.

## Mastodon 밖에서 참고할 항목

### Bluesky custom feed

Bluesky의 custom feed는 중앙 추천보다 사용자 선택형 발견에 가깝다. Kosmo가 추천 알고리즘을
강하게 밀지 않으려면 공식 curated feed나 커뮤니티 feed부터 시작할 수 있다.

결정 필요:

- 사용자가 feed를 만들 수 있게 할지.
- 외부 feed generator를 허용할지.
- feed 결과의 설명 가능성을 어떻게 제공할지.

### Bluesky starter pack

신규 사용자가 빈 타임라인을 빠르게 채우는 데 유용하다. Kosmo에서는 공식 starter pack을
운영자가 관리하는 방식부터 시작할 수 있다.

결정 필요:

- starter pack 생성 권한.
- 한 번에 팔로우할 때 preview와 선택 해제를 제공할지.
- starter pack에 feed를 포함할지.

### Misskey reaction

Misskey reaction은 단일 like보다 표현력이 좋다. 다만 custom emoji, moderation, 알림 summary,
카운트 UI가 복잡해진다.

결정 필요:

- 단일 favourite만 둘지.
- reaction을 도입한다면 기본 emoji 목록을 제한할지.
- custom emoji를 서버 기능으로 둘지.

### Misskey antenna

Antenna는 검색과 피드 사이에 있는 지속적 수집 기능이다. 고급 사용자에게 유용하지만 처음부터
넣으면 검색/알림/저장 비용이 커진다.

결정 필요:

- keyword watch를 검색 저장 기능으로 단순화할지.
- antenna 조건을 어느 범위까지 허용할지.
- 새 antenna 결과에 알림을 보낼지.

### Misskey Drive

Drive는 파일 재사용 경험을 만든다. Kosmo에서 게시 첨부, 프로필 미디어, 개인 파일함의 포함
범위와 순서를 결정해야 한다.

결정 필요:

- 업로드 파일을 사용자가 직접 관리하게 할지.
- 파일 공개 범위를 게시 공개 범위와 분리할지.
- remote media cache를 사용자 파일함에 보여줄지.

## 이름 미결정 목록

| 의미           | 후보                                       |
| -------------- | ------------------------------------------ |
| 짧은 게시 단위 | Post, Note, Status                         |
| 작성자 정체성  | Profile, Actor                             |
| 표시 handle    | displayHandle, qualifiedHandle, acctHandle |
| 긍정 반응      | Like, Favourite, Reaction                  |
| 공유           | Repost, Boost, Renote                      |
| 인용           | Quote, Quote Post, Quote Renote            |
| 저장           | Bookmark, Save                             |
| 컬렉션         | Clip, Collection                           |
| 로컬 피드      | Local Timeline, Server Feed                |
| 연합 피드      | Federated Timeline, Network Feed           |
| 키워드 수집    | Antenna, Watch Feed, Saved Search          |
| 콘텐츠 경고    | Content Warning, CW, 접힘 제목             |
| 민감 미디어    | Sensitive Media, Hidden Media              |

## 검토 묶음 초안

### 묶음 A: 단문 SNS 골격

- 게시 작성, 답글, 공개 범위.
- 프로필과 display handle.
- 홈 타임라인, 프로필 게시 목록.
- 팔로우/언팔로우, 팔로워/팔로잉 목록.
- 단일 반응, 공유, 북마크.
- 기본 알림.
- 뮤트, 차단, 신고.

### 묶음 B: 연합형 SNS 정리

- 로컬/연합 타임라인.
- ActivityPub actor discovery와 원격 프로필.
- content warning과 민감 미디어.
- 필터와 서버 moderation.
- 원격 follow/request 상태.

### 묶음 C: 발견과 커뮤니티 확장

- 해시태그 탐색.
- 리스트.
- 공식 curated feed.
- starter pack.
- trend 또는 탐색 탭.

### 묶음 D: 확장 기능

- custom feed.
- reaction.
- antenna.
- clip/collection.
- file drive.
- 별도 DM.
- 커뮤니티/channel.

## 후속 질문

- Kosmo가 Mastodon 호환을 실제 출시 전제에 포함하는가, 아니면 로컬 SNS 골격을 먼저
  완성하는가.
- 인용을 처음부터 막을지, 작성자 통제 기반으로 제한적으로 둘지.
- 단일 favourite를 쓸지, Misskey식 reaction을 Kosmo의 차별화 기능으로 삼을지.
- DM을 게시 공개 범위의 일부로 둘지, 별도 메시징 시스템으로 둘지.
- custom feed를 제품 핵심으로 삼을지, 검색/해시태그/리스트 이후로 미룰지.
