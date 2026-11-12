# Post List Policy

## 정의

Post List Policy는 durable 객체가 아니라 Post, Profile 관계, 개인 제어 규칙, Instance 상태를 소비해 목록별
Post 후보와 Control Decision을 계산하는 조회 정책이다.

## Post List Type

| 값      | 의미                                                                       |
| ------- | -------------------------------------------------------------------------- |
| Home    | viewer Profile의 기본 Post List                                            |
| Local   | configured Local Instance와 운영자가 추가 설정한 Instance의 공개 Post List |
| Profile | Target Profile이 작성한 Post List                                          |
| Hashtag | Target Hashtag가 포함된 Post List                                          |

## Control Decision

| 값       | 의미                               |
| -------- | ---------------------------------- |
| Include  | 후보 Post를 목록에 노출한다        |
| Collapse | 후보 Post를 접힌 상태로 노출한다   |
| Exclude  | 후보 Post를 목록에 노출하지 않는다 |

여러 제어가 동시에 적용되면 `Exclude > Collapse > Include` 순서로 가장 제한적인 결정을 사용한다.

## 후보 정책

### Home Post List

- Home Post List는 viewer Profile마다 계산되는 파생 목록이다. Post를 목록에 넣을 때 당시의 후보, Visibility,
  Eligibility, Follow, Block, Mute 규칙을 판정한다. 이 규칙을 통과한 새 Post는 열린 Home 목록에도 수동
  새로고침 없이 반영될 수 있다. 목록에 반영되지 않은 항목은 이후 최신 Home 조회에서 현재 정책에 따라 보정된다.
  Follow·Block·Mute와 Profile/Post 상태 변경은 Home 목록에 몇 초 안에 반영될 수 있다. 조회할 때는 viewer 권한과
  Post 삭제 여부, 바깥 Post와 direct Source Post의 Author Profile ACTIVE 상태를 다시 확인한다.
- Home GraphQL 페이지는 Natural Language Mute Rule을 적용하기 전의 bounded 후보 Post를 기준으로 나눈다. 요청한
  후보 수와 최대 한 항목의 lookahead만 읽으며, 제외 후 반환 edge 수는 더 적거나 비어 있을 수 있다. `pageInfo`와
  cursor는 소비한 후보 페이지를 나타내고 lookahead 후보는 다음 요청에 남으므로, edge가 비어 있어도 다음 페이지로
  이어질 수 있다. 보이는 Post 수를 채우기 위해 추가 후보를 계속 읽지 않는다.
- Smart Filter 결과 조회는 선택한 Profile의 저장된 Include·Exclude 판정이 있는 Post를 Home 목록과 독립적으로 보여준다.
  이 기능 도입 후 기록된 판정부터 목록에 포함하며, 그 이전 판정을 소급해 목록화하지 않는다.
  Follow나 일반 Profile Mute로 Post를 다시 제외하지 않지만 현재 직접 Post 조회의 Visibility·Eligibility·Block 경계는 적용한다.
  비활성·Content 없는·viewer 작성 Post와 직접 조회할 수 없는 Post는 숨긴다. 조회는 판정을 새로 계산하거나 Home 목록 cache를
  변경하지 않으며, 페이지의 Post 개수와 표시 순서는 보장하지 않는다.
- [Natural Language Mute Rule](../objects/natural-language-mute-rule.md)은 Home Post List에 Post를 새로 추가할 때
  새 판정을 만들며, 기존 접근·Visibility·Eligibility·Block·Mute 정책을 통과한 항목을 추가로 제외한다. Content가
  있는 Post는 Quote를 포함해 그 Post 자체가 판정 대상이며, 작성자가 viewer이면 판정과 판정 cache 재사용을 건너뛰고
  기존 eligibility에 따라 포함한다. Content 없는 순수 Repost에는 독립 판정이 없고 Repost Author와 무관하게 direct
  Source Post의 판정을 재사용한다. Source가 Quote이면 그 Quote 자체의 판정을 쓰며, Quote가 가리키는 Source까지 판정
  대상을 바꾸지 않는다. 일반 적재, Follow 보정과 Home 목록 cache 재구성에서 새로 추가할 때도 적용하며, 이미 Home에
  있는 항목을 규칙 생성·변경·제거 또는 판정 대상 식별 방식 변경으로 소급 변경하지 않는다.
- 현재 선택 viewer Profile의 Rule이 있는 Local Post List는 해당 Local 후보 Post 자체의 저장된 유효 Exclude 판정만
  추가로 적용한다. 새 판정은 만들지 않으며 viewer 작성 Post와 Include·미저장·유효하지 않은 판정은 기존 Local 정책에
  따라 표시한다. 선택 Profile이나 현재 Rule이 없으면 이전 판정을 무시한다. Rule 삭제 뒤에는 남아 있는 판정도 Local
  노출에 사용하지 않는다. 이 규칙은 기존 Visibility·Eligibility·Block·Mute 정책을 완화하지 않으며, Profile·Hashtag
  목록, 검색, Notification, Bookmark, Post 직접 조회와 상호작용에는 적용하지 않는다.
- Home 파생 목록은 언제든 사라질 수 있는 임시 cache이며, 영구 Home projection이나 별도 초기화 상태를 저장하지 않는다.
  인증된 Home 조회는 기존 cache의 7일 만료 시간을 연장하고, Post 삽입을 위한 background 처리는 기존 만료 시간을
  연장하지 않는다. cache가 없거나 요청한 범위에 유효한 항목이 없으면 그 페이지를 DB에서 현재 정책에 따라 조회하며,
  cache 오류 때문에 Home 조회가 실패하지 않는다. DB 결과가 비어 있으면 cache key를 만들지 않는다.
- Home cache는 요청에서 이미 DB로 조회한 항목으로 구성하며, cache miss 뒤 별도의 대량 조회를 하지 않는다. 이후 페이지를
  조회하면서 더 과거 항목을 찾으면 가장 오래된 cache 항목에 이어 추가한다. 적격 Post fanout은 cache가 없는 Profile의
  key도 생성하며 새 key에는 7일 만료를 설정한다. 새 Post fanout은 기존처럼 cache에 추가된 시각을 사용하며, 같은 시각의
  tie와 DB/cache 전환 경계의 중복·누락 가능성은 유지한다.
- Follow·Unfollow 보정은 변경된 Profile을 작성자, Reply Parent 작성자, Reply의 현재 Content Mention 대상, 순수
  Repost의 direct Source 작성자로 하는 Post만 관계 변경의 영향을 받는 후보로 삼는다. 기존 cache 안의 해당 후보는
  현재 Home 정책으로 다시 판정해 통과하지 못하는 항목만 제거한다. 현재 Follow 중인 변경 대상과 관련된 새 eligible
  후보는 현재 cache에 저장된 Post ID의 최솟값과 최댓값을 양 끝에 포함하는 ID 범위 안에서만 추가한다. cache가 없거나
  비어 있으면 보정이 cache를 채우지 않으며, 기존 항목 수를 맞추기 위한 refill도 하지 않는다. storage 최대 1,000개
  보관 한도는 계속 적용한다.
- Follow·Unfollow의 Home 보정이 겹치면 이전 관계 기준의 항목이 늦게 추가되는 경합을 수용한다. 이 항목은 cache가
  다시 구성되거나 후속 보정으로 제거될 때까지 남을 수 있고, Home 조회에 따른 만료 연장도 계속 적용된다.
- 일반 fanout으로 추가한 Home 항목은 viewer Profile의 목록에 처음 추가된 시각 순으로 정렬한다. Follow·Unfollow 보정으로
  새로 추가하는 Post는 저장된 작성 시각을 사용하며, 이미 cache에 있는 항목의 점수는 유지한다. 파생 목록 조회는 정렬값 cursor를,
  DB fallback은 Post ID cursor를 사용한다. 같은 시각이나 파생 목록과 DB 조회 사이의 전환 경계에서는 중복 또는
  누락이 생길 수 있다.
- viewer Profile이 작성한 eligible Content Post 중 Reply Parent가 없는 Post를 포함한다.
- viewer Profile이 팔로우한 Active/Normal Profile의 eligible Content Post 중 Reply Parent가 없는 Post를
  포함한다.
- viewer Profile의 Post에 달린 Reply, viewer Profile이 작성한 Reply, viewer Profile이 팔로우한 Profile의
  Post에 viewer Profile이 팔로우한 Profile이 작성한 Reply를 포함한다.
- viewer Profile 또는 viewer Profile이 팔로우한 Active/Normal Profile이 작성한 Repost를 포함한다.
- viewer Profile이 작성한 Home 후보와 Reply Parent가 없는 Content Post는 기존 정책을 유지한다. 다른 Profile이
  작성한 Reply 후보의 Current Content에 Mentioned Profile 관계가 하나 이상 있으면, 그중 하나 이상이 viewer
  Profile이거나 viewer가 현재 팔로우하는 Profile일 때만 포함한다. Mentioned Profile 관계가 없는 Reply와 Content
  없는 Repost는 기존 후보 정책을 유지한다.
- Author 또는 Mentioned Profile이 아닌 viewer Profile은 Author Profile과 현재 Follow Relationship이 없을 때
  Followee가 작성한 Followers Only Post의 후보가 될 수 없다. 기존 Post Visibility가 Author 또는 Mentioned
  Profile에 부여한 접근은 유지한다.

### Profile Post List

- 저장·API projection은 조회 가능한 pinned Post의 server-authoritative ordered 0..N collection이다. Local first-party UI는
  조회 가능한 고정 Post 전체를 이 순서대로 별도 pinned segment에 표시하고 개별 관리한다. Remote inbound UI도 검증된
  Featured collection 전체를 원격 순서의 pinned segment로 표시한다.
- 고정 관계와 저장 순서가 바뀌지 않으면 서버는 같은 authoritative order를 유지한다. Local 순서 변경 성공 후에는 현재 고정 목록과
  이후 조회에 저장된 순서를 반영한다. 고정 관계의 구성과 기존 chronology에는 영향을 주지 않는다. visibility filtering은 남은 visible pin의 상대 순서를
  바꾸지 않는다.
- Local pin/unpin 성공 뒤에도 이미 표시 중인 pinned segment는 이전 목록 구성과 순서를 유지할 수 있다. 이후 Profile 목록을 다시
  조회할 때 서버에 저장된 목록과 순서를 반영한다. 고정 목록은 페이지네이션 없이 조회 가능한 전체를 반환하며, 기존 chronology의
  pagination 및 pagination failure retry는 유지한다.
- 기존 chronology는 Target Profile이 작성한 eligible Post 중 Reply Parent가 없는 Content Post와 Repost를 포함하며, pin 관계로
  후보·순서·cursor·page limit을 바꾸지 않는다. 따라서 chronology 후보인 Post는 pinned segment와 원래 chronology 위치에
  모두 표시될 수 있다. Reply Parent가 있는 Post는 Quote이기도 하더라도 기존 chronology에는 포함하지 않는다.

### Local Post List

- Account나 선택 Profile 없이 첫 페이지와 다음 페이지를 조회할 수 있다. 조회 허용은 Home 접근이나 참여 권한을 확대하지 않는다.
- 기존 최신순 정렬과 페이지 경계를 유지하며, viewer Profile이 있으면 해당 Profile의 기존 개인 제어를 적용한다.
- 현재 선택한 viewer Profile에 Natural Language Mute Rule이 있으면 해당 Post 자체의 저장된 유효 Exclude 판정도 적용한다. Local 조회는 새 판정을 만들지 않으며, viewer가 작성한 Post와 유효한 Exclude 판정이 없는 Post는 기존 정책에 따라 표시한다. 선택 Profile이나 현재 Rule이 없으면 이전 판정을 적용하지 않는다. Rule 삭제 뒤에도 이전 판정은 남아 있을 수 있지만 Local 노출에는 사용하지 않는다. Quote는 direct Source가 아니라 Quote 자체의 판정을 사용한다. 제외된 후보가 있어도 기존 bounded page와 cursor는 유지되며, 반환 edge 수가 적거나 비어 있을 수 있다.
- configured Local Instance 또는 운영자가 추가 설정한 Instance에 속한 Active/Normal Profile이 작성한 Public Post 중 Content가 있고 Reply Parent가 없는 eligible Post를 포함한다.
- 이미 기존 수신 경로를 통해 Kosmo에 수신·저장된 Post만 조회한다. Instance 설정은 새 Post를 수집하지 않으며, 선택한 Instance의 모든 Post가 노출됨을 보장하지 않는다.
- Content와 Repost Source를 함께 가진 Quote는 포함한다.
- Reply Parent가 있는 Post와 Content 없는 Repost는 포함하지 않는다.

### Hashtag Post List

- Content가 있고 Reply Parent가 없으며 Target Hashtag가 포함되고 Post Eligibility를 통과한 Post를 후보로 삼는다.
- 현재 선택한 viewer Profile이 Author인 후보는 Visibility와 무관하게 포함한다. 그 외 후보는 Public 또는 Unlisted로 제한하며, 선택 Profile이 없는 게스트와 같은 Account의 다른 Profile에는 예외를 적용하지 않는다.
- Reply Parent가 있는 Post와 Content 없는 Repost는 포함하지 않는다.

## 제어 정책

| Control                    | Home                                                                                              | Local                      | Profile                                                   | Hashtag                    |
| -------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- | -------------------------- |
| Profile Block              | 상대 콘텐츠 양방향 Exclude                                                                        | 상대 콘텐츠 양방향 Exclude | 방향별 Post 조회 정책 적용                                | 상대 콘텐츠 양방향 Exclude |
| Profile Mute               | Exclude                                                                                           | Exclude                    | 방문한 Profile만 예외                                     | Exclude                    |
| Word Mute Rule             | Scope와 Mute Decision 적용                                                                        | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용                                | Scope와 Mute Decision 적용 |
| Hashtag Mute Rule          | Scope와 Mute Decision 적용                                                                        | Scope와 Mute Decision 적용 | Scope와 Mute Decision 적용                                | Scope와 Mute Decision 적용 |
| Natural Language Mute Rule | 본문 Post는 자체 판정, 순수 Repost는 direct Source 판정 재사용; viewer 작성 판정 대상은 판정 생략 | 저장 Exclude만 재사용      | —                                                         | —                          |
| Profile Domain Block       | Exclude                                                                                           | Exclude                    | Exclude                                                   | Exclude                    |
| Domain Limit               | Include                                                                                           | Include                    | Include                                                   | Exclude                    |
| Sensitive Media            | Collapse                                                                                          | Collapse                   | Collapse                                                  | Collapse                   |
| 조회할 수 없는 Media       | Exclude                                                                                           | Exclude                    | Exclude                                                   | Exclude                    |
| Reply Parent 있음          | Home 후보 정책 통과 시 Include                                                                    | Exclude                    | pinned segment이면 Include, 기존 chronology에서는 Exclude | Exclude                    |
| Content 없는 Repost        | Home 후보 정책 통과 시 Include                                                                    | Exclude                    | Target 작성 시 Include                                    | Exclude                    |

- Home Post Visibility와 Post Eligibility는 항목을 파생 목록에 넣을 때 적용한다. Local, Profile, Hashtag Post List는
  기존 조회 시점의 Visibility와 Eligibility 정책을 적용한다.
- Home의 Visibility와 Eligibility는 항목을 목록에 넣거나 DB fallback으로 다시 구성할 때의 상태를 반영한다.
  이전 Home 항목이 몇 초 동안 남더라도 direct Post·Node 조회와 다른 Post List의 현재 권한 판정은 바뀌지 않는다.
- Local Post List는 Local Scope가 선택된 Hashtag Mute Rule의 Collapse도 Exclude로 소비한다.
- Followers Only 후보는 Author/Mentioned Profile이 아닌 viewer에게 viewer Profile과 Author Profile 사이의
  현재 established Follow Relationship을 추가로 요구하며, pending·rejected Follow Request 또는 unfollow로
  removed된 관계와 guest에는 접근 범위를 넓히지 않는다.
- Repost에는 Repost Author와 Source Post Author에 대한 Profile Block을 모두 적용한다.
- Home 항목은 Profile Block 양쪽 방향을 파생 목록에 넣을 때 적용하며, 관계 변경 반영에는 몇 초가 걸릴 수 있다.
  Local·Hashtag Post List는 기존처럼 양쪽 viewer 방향의 Block 필터를 cursor와 page limit 전에 적용한다.
- Profile Post List는 직접 방문한 Profile이 Profile Block의 Target이고 viewer가 Owner이며 역방향 Block이 없는
  경우 해당 Profile의 eligible Post와 첨부 Media를 기존 Post Visibility·Post Eligibility에 따라 Include한다.
  viewer가 Profile Block의 Target인 경우 상대 Owner의 Post와 첨부 Media를 Exclude하며, 양방향 Block이면 양쪽
  방향에 이 제한을 적용한다.
- Home·Local·Hashtag Post List에서 Repost Source가 있는 후보에는 바깥 Post Author와 direct Source Post
  Author의 Profile Mute를 모두 적용하고, 둘 중 하나라도 Mute Target이면 Exclude한다. Content가 있는
  Quote도 direct Source Author를 판정한다.
- Profile Post List에서는 방문한 Profile ID만 Mute 예외로 허용한다. 해당 Profile의 Post는 표시하지만,
  다른 Mute Target이 direct Source Author인 Repost·Quote는 Exclude한다.
- Home은 Profile Mute에 따른 제외를 파생 목록에 넣을 때 적용하며, 관계 변경 반영에는 몇 초가 걸릴 수 있다.
  Local·Hashtag Post List는 Mute 제외를 cursor와 page limit 전에 적용한다. Bookmark 목록과 Post 직접 조회·상호작용에는
  Mute를 적용하지 않으며 기존 Visibility·Eligibility를 유지한다.
- Post List 제어는 Post Visibility가 허용하지 않은 viewer에게 접근 범위를 넓히지 않는다.
- pinned segment에도 기존 Post Visibility, Post Eligibility, Profile lifecycle, Post lifecycle, block·domain 정책을
  적용한다. 조회할 수 없거나 unavailable인 pinned Post는 목록과 pinned count에 포함하지 않는다.
- 위 pinned ordering은 Profile 목록에만 적용한다. Home·Local·Hashtag의 후보 순서와 일반 chronology는 변경하지 않는다.

## 제외/보류

- Cursor는 조회 입력 값이며 durable 객체 속성이 아니다.
- viewer별 읽기 위치는 독립 생명주기와 제품 요구가 확정될 때 별도 durable 객체로 추가한다.
- Custom, Federated, List 기반, 키워드 수집형 Post List는 현재 범위에서 제외한다.
