# Post Content 객체

## 정의

Post Content는 Post의 작성 내용을 한 시점에 보존하는 immutable revision이다. Content Warning, 본문,
Sensitive Media와 순서가 있는 Media 참조를 하나의 canonical Content Document로 소유한다. Post는 현재
Post Content를 가리키며, 작성 내용을 수정하면 기존 revision을 바꾸지 않고 새 Post Content를 만든다.

## 속성

| 속성             | 타입/nullability | 검증 정책                                                                                                                                                                                                                                                                                                                                                  | 존재 조건 | 조회 조건           | 조회 권한 |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------- | --------- |
| Content Document | Versioned JSON   | `{ version, summary, body }`; `version`은 breaking schema version이며 revision 번호가 아니다. V1 `summary`는 nullable Plain Text Content Warning이고 `body`는 ProseMirror document다. V1은 기존 paragraph/text/hard-break/link와 additive한 Media node를 지원한다. summary와 body Plain Text 합계는 500자 이하이며 Media가 없으면 body가 비어 있을 수 없다 | 항상      | Post 조회 정책 통과 | 없음      |
| 생성 시각        | 시각, 필수       | revision 생성 결과로 기록하며 변경 불가                                                                                                                                                                                                                                                                                                                    | 항상      | Post 조회 정책 통과 | 없음      |

V1 Media node는 `mediaId`를 attr로 가지며 body 안의 위치가 표시 순서를 결정한다. 하나의
document는 Media node를 최대 4개 가질 수 있다. V1 document root의 `sensitiveMedia` attr는 모든 Media node의
가림 표시에 함께 적용하며 생략하면 `false`다. Media node, `sensitiveMedia` attr와 같은 이전 document의 의미를
바꾸지 않는 확장은 V1에 additive하게 추가할 수 있다. 기존 필드나 node의 의미 변경, 제거, 이름 변경, Media 참조
형식 변경 또는 호환되지 않는 canonicalization 변경에만 새 schema version을 사용한다.
Media 첨부 기능이 아직 배포되지 않은 출시 전 단계에서 제거한 V1 초안의 `altText` node attr는 외부 호환
계약으로 보지 않으며, Media 소유로 바로잡기 위해 V2를 만들지 않는다.

Plain Text는 body에서 결정적으로 파생되는 읽기·검색·접근성 projection이며 별도 canonical 저장값이 아니다.

ActivityPub 표현은 Content Document의 저장 구조를 그대로 직렬화하지 않는다. paragraph, text, hard break와
link는 Media node를 제외한 안전한 HTML `Note.content`로 투영하고, Media node는 document 순서대로
`Note.attachment`의 Image로 투영한다. `mediaId`는 외부에 노출하지 않고 조회 시점에 접근 가능한 Media URL과
MIME type으로 바꾸며 Media의 nullable Alt Text는 Image의 사람이 읽을 수 있는 이름으로 제공한다. document root의
`sensitiveMedia`는 지원하는 ActivityPub sensitive 속성으로 투영한다. 내부 document의 정확한 Media 삽입
위치는 attachment-only ActivityPub 수신자에게 보존되지 않는다.

ActivityPub 원격 Note 수신은 지원 가능한 embedded typed Image attachment 중 원래 순서의 앞 4개를 Remote
Media와 같은 순서의 Media node로 투영하고 초과분은 무시한다. Image name은 해당 Media의 nullable Alt Text로
보존한다.
본문이 없어도 하나 이상의 유효한 Image가 있으면 빈 paragraph와 Media node를 가진 contentful revision으로
저장할 수 있다.

## 관계

| 관계             | 대상                | 방향                  | cardinality | 존재 조건                       | 조회 조건           | 조회 권한 |
| ---------------- | ------------------- | --------------------- | ----------- | ------------------------------- | ------------------- | --------- |
| Post             | [Post](./post.md)   | Post Content -> Post  | 1 -> 1      | 항상                            | Post 조회 정책 통과 | 없음      |
| Referenced Media | [Media](./media.md) | Post Content -> Media | 1 -> 0..4   | document에 Media node가 있을 때 | Post 조회 정책 통과 | 없음      |

Referenced Media는 Content Document의 Media node가 소유하는 revision 관계다. 별도 관계 테이블이나 Media ID
배열을 두 번째 source of truth로 저장하지 않는다. Post Content를 만들 때 서버는 각 Media 참조의 존재,
Source=Local, State=Ready와 Upload Account 조건을 검증한다. Media row의 물리 삭제는 과거 revision 참조를
깨뜨리지 않는 별도 lifecycle 계약이 생기기 전까지 제공하지 않는다.

## 행동

| 행동              | 행동 주체 Profile | 대상 객체 | 입력값                                             | 권한                            | 조건                                                                                                                                                   | 결과                                                                                                                                   |
| ----------------- | ----------------- | --------- | -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Post Content 작성 | Profile           | Post      | Content Warning, 본문, Sensitive Media, Media 목록 | `Account.Active`, `Post.Author` | Post가 Active이고 Content를 가지며 입력 document가 현재 schema와 길이·Media 검증을 통과한다. 참조한 Local Media의 Upload Account가 요청 Account와 같다 | 기존 revision은 유지되고 새 immutable Post Content가 생성되며 Post의 현재 Content 포인터가 같은 transaction에서 새 revision으로 바뀐다 |

본문, Content Warning, Sensitive Media, Media의 추가·제거·순서 또는 Media 자체 교체 중 하나라도
바뀌면 새 Post Content를 만든다. 이미지 교체는 먼저 새 Local Media를 Ready로 만든 다음 그 Media를 참조하는 새
revision을 만드는 행동이다. 이전 revision은 이전 Media 참조를 그대로 보존한다.

Alt Text 변경은 Media metadata 갱신이며 새 Post Content revision을 만들지 않는다. 같은 Media를 여러 Post
Content가 참조한 상태에서 Alt Text를 다시 입력하는 것은 정상적인 작성 흐름은 아니지만 금지하지 않는다. 발생하면
Media의 최신 Alt Text가 그 Media를 참조하는 모든 Post에서 보인다.

이 수정 행동은 revision 모델이 보존하는 별도 제품 capability이며 현재 Post Composer 이미지 업로드 계약이
제공하지 않는다. 사용자용 mutation, UI, 동시 수정 정책과 ActivityPub `Update(Note)` delivery는 독립된 Post
수정 계약에서 전달한다.

## 조회 정책

- Post의 일반 조회와 배포는 현재 Post Content만 사용한다.
- 현재 Post Content의 Referenced Media는 body의 Media node 순서로 제공한다.
- `PostContent.media`는 소유 Post의 조회 정책을 통과한 경로에서 실제 Media Node를 반환하며 Media 표시 필드 조회
  scope를 grant한다. Media의 URL, Media Type과 Alt Text는 이 grant가 있을 때 노출한다.
- PostContent를 거치지 않는 standalone Media Node가 Referencing Post를 역추적해 권한을 얻는 정책은 후속
  계약으로 보류하며, 현재 Upload Account 직접 조회 정책은 유지한다.
- 참조 Media row, Ready 상태 또는 필요한 표시 metadata가 불완전하면 일부 Media를 제공하지 않고 Referenced Media
  projection 전체를 unavailable로 처리한다. 이 결과만으로 Post나 Post Content 자체를 unavailable로 바꾸지 않는다.
- 과거 revision 조회와 복원 UI는 현재 범위에서 제공하지 않는다.
- Local ActivityPub Note 역참조는 현재 Post Content를 사용한다. Post Content 수정 후 `Update(Note)`를 실제
  수신자에게 전달하는 lifecycle은 별도 계약이 확정될 때까지 제공하지 않는다.

## 확정 용어

- 게시 내용: Post Content
- 게시 내용 리비전: Post Content Revision
- 현재 게시 내용: Current Post Content
- Content Document Schema Version: Content Document Schema Version
- 참조 미디어: Referenced Media

## 제외/보류

- Post Visibility 수정은 Post Content 수정에 포함하지 않는다.
- 현재 Post Composer 이미지 업로드는 새 Post의 첫 Post Content만 만들며 기존 Post 수정은 포함하지 않는다.
- crop, filter처럼 Media의 이미지 byte나 파생 표현 자체를 편집하는 기능은 포함하지 않는다. 새 이미지를
  업로드해 Media 참조를 교체하는 기능은 포함한다.
- revision 번호, 과거 revision 목록·복원, 동시 편집 충돌 UX와 Media 물리 삭제 정책은 후속 계약에서 정한다.
