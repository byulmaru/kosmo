# Post Content 객체

## 정의

Post Content는 Post의 작성 내용을 한 시점에 보존하는 immutable revision이다. Content Warning, 본문,
Sensitive Media, 저장된 Profile과 일치하는 typed Local Mention·선택된 Local Mention과 검증된 inbound typed Mention, 순서가 있는 Media 참조와 Hashtag 관계를 소유한다. Post는
현재 Post Content를 가리키며, 작성 내용을 수정하면 기존 revision을 바꾸지 않고 새 Post Content를 만든다.

## 속성

| 속성             | 타입/nullability | 검증 정책                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 존재 조건 | 조회 조건           | 조회 권한 |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------- | --------- |
| Content Document | Versioned JSON   | `{ version, summary, body }`; `version`은 breaking schema version이며 revision 번호가 아니다. V1 `summary`는 nullable Plain Text Content Warning이고 `body`는 ProseMirror document다. V1은 기존 paragraph/text/hard-break/link와 additive한 Media·Hashtag node를 지원하며, stored Profile과 일치하는 typed·selected Local Mention과 검증된 inbound typed Mention을 additive node로 보존한다. Local Post의 summary와 authored body Plain Text 합계는 500자 이하이며 Media가 없으면 body가 비어 있을 수 없다 | 항상      | Post 조회 정책 통과 | 없음      |
| 생성 시각        | 시각, 필수       | revision 생성 결과로 기록하며 변경 불가                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 항상      | Post 조회 정책 통과 | 없음      |

V1 Media node는 `mediaId`를 attr로 가지며 body 안의 위치가 표시 순서를 결정한다. 하나의
document는 Media node를 최대 4개 가질 수 있다. V1 document root의 `sensitiveMedia` attr는 모든 Media node의
가림 표시에 함께 적용하며 생략하면 `false`다. Media node, `sensitiveMedia` attr와 같은 이전 document의 의미를
바꾸지 않는 확장은 V1에 additive하게 추가할 수 있다. 기존 필드나 node의 의미 변경, 제거, 이름 변경, Media 참조
형식 변경 또는 호환되지 않는 canonicalization 변경에만 새 schema version을 사용한다.
Media 첨부 기능이 아직 배포되지 않은 출시 전 단계에서 제거한 V1 초안의 `altText` node attr는 외부 호환
계약으로 보지 않으며, Media 소유로 바로잡기 위해 V2를 만들지 않는다.

Plain Text는 body에서 결정적으로 파생되는 읽기·검색·접근성 projection이며 별도 canonical 저장값이 아니다.

로컬 Post 본문에서 Hashtag는 본문 text를 보존한 채 해당 occurrence와 공통 Hashtag identity를 연결한다. Post·Reply·Quote 작성은
바깥 공백 제거 → 선택적 앞 `#` 하나 제거 → Unicode NFKC → locale 비종속 소문자화한 이름이 Unicode Letter (`L`)·Number (`N`)
또는 `_`로만 이루어지고 Unicode code point 기준 1–64자일 때 Hashtag로 인식한다. `#`는 이 이름 길이에 포함하지 않으며 숫자만 있는
이름도 허용한다. 괄호 안의 `(#tag)`는 인식하지만 단어 중간의 `abc#tag`와 URL fragment는 인식하지 않는다. 64자를
초과하거나 문법에 맞지 않는 occurrence는 잘라내거나 작성 전체를 거부하지 않고 원래 본문 text 그대로 남긴다.
같은 identity가 본문에 반복되면 각 occurrence의 표기와 위치를 보존하고, revision에는 해당 identity와의 관계를 한 번만 둔다.

기존 활성 Local Post 콘텐츠 재처리는 현재 Post Content revision의 저장 document에 현재 콘텐츠 처리 규칙을 적용한다.
현재 구현은 본문 Hashtag를 발견하고 Hashtag 관계를 정합화한다. 원문 입력은 따로 저장하지 않으므로 재처리는 작성
시점의 전체 parser를 다시 실행하지 않으며 Mention을 재발견·resolve하거나 Remote source를 가져오지 않는다.

재처리 대상은 운영자가 지정한 Post ID로 한정하며 Post Content ID를 입력으로 받지 않는다. 각 Activity 시도는 transaction
안에서 해당 활성 Local Post의 current Post Content를 읽어 처리한다. 시도 사이에 current content가 바뀌면 다음 시도는
새 current content를 처리하고, 이미 같은 content와 관계가 반영된 상태면 새 revision을 만들지 않는다.

원본 revision은 바꾸거나 삭제하지 않는다. 새 revision은 처리한 document나 관계가 달라질 때만 만들며, 원래 body
text와 처리 대상이 아닌 document node, 기존 Mention node·관계, Content Warning, Sensitive Media와 Media 참조를
보존한다. Hashtag 관계는 결과 document의 기존·신규 Hashtag node에서 계산하고 document에 없는 기존 관계는 새
revision에 복사하지 않는다. revision 생성 시각은 재처리 시각으로 기록한다. 새 revision, 보존할 관계와 Post의
currentContentId 교체는 한 transaction으로 원자적으로 반영한다. current pointer가 처리 중 바뀌면 transaction을
rollback해 부분 변경이나 stale revision 덮어쓰기를 방지한다. 처리 결과와 현재 값이 같으면 새 revision을 만들지 않는다.
Post ID, Post.createdAt, author, visibility와 그 밖의 관계는 바뀌지 않는다.

Remote Note 수신은 embedded typed ActivityPub `Hashtag`의 `name`과 projected body의 `#` token이 공통
Hashtag 정규화 identity로 일치하는 occurrence만 Hashtag node와 관계로 저장한다. 본문 표기만으로는 연결하지 않으며,
typed tag의 `href`는 identity 입력으로 사용하거나 fetch하지 않는다. 원격 name에는 Local 작성의 64 code point와 문자
문법 제한을 적용하지 않고, 연결한 node는 본문 occurrence의 정확한 token을 보존한다. 같은 identity가 반복되면 각
occurrence를 보존하고 관계는 한 번만 저장한다. 같은 Remote object URI의 duplicate Create는 처음 저장한 Content와
관계를 유지하고 새 revision을 만들지 않는다. 이 동작은 새 Remote Note revision 생성에만 적용하며 `Update(Note)`와 Remote
revision backfill은 포함하지 않는다.

500자 작성 제한은 Local Post의 작성 내용에만 적용하며, Content Warning summary와 body Plain Text의 합계를
Unicode code point 기준으로 계산한다. Remote Post는 정규화한 summary와 body Plain Text의
UTF-16 길이(`.length`) 합계가 10,000자 이하일 때 수신할 수 있다. 정확히 10,000자는 허용하며 초과하면
원문을 자르지 않고 해당 Note 전체를 무시한다. 기존에 저장된 Post와 revision은 변경하지 않는다.
길이는 기존 canonical Plain Text 변환이 만드는 줄바꿈을 포함하며 HTML markup, Media와 표시용 구분자는
포함하지 않는다. Quote의 원문인 Remote Post에도 같은 원격 기준을 적용한다. Local Quote 자체의 작성 내용은
로컬 제한을 따르고 참조하는 원격 원문의 길이는 합산하지 않는다.
원격 수신의 입력 byte, HTML 구조, 저장 JSON과 hydration 응답 크기를 보호하는 resource budget은
이 문자 수 정책과 구분한다. 문자 수 검사만으로 파싱이나 네트워크 자원 소비가 제한되지는 않는다.

새 Local Post·Reply·Quote와 수신하는 Remote Note는 Content Document body에 새 Mention node를 최대 16개까지 저장할
수 있다. 같은 Profile의 반복 출현도 각각 세며 deduplicated relation 수는 한도 계산에 사용하지 않는다. 각 node의
`handle` snapshot은 검증된 Profile의 `relativeHandle`에서만 가져오고 username 부분은 최대 64자다. 선행 `@`와
qualified handle의 `@domain` 부분은 이 64자 username 상한에 포함하지 않는다.
새 Local Content가 17번째 matched Mention node를 만들거나 snapshot username이 64자를 넘으면 작성 요청 전체를
validation error로 거부한다. Inbound Note가 17번째 matched Mention node를 만들거나 snapshot username이 64자를
넘으면 부분 저장이나 자르기 없이 Note 전체를 거부한다. 일치하지 않은 authored token이나 inbound anchor는 기존처럼
일반 text 또는 link로 남고 한도에 세지 않는다. Inbound typed Mention identity relation은 body node와 독립적으로
유지하며, 이 한도는 새로 저장하는 body node에만 적용한다.

ActivityPub 표현은 Content Document의 저장 구조를 그대로 직렬화하지 않는다. paragraph, text, hard break와
link는 Media node를 제외한 안전한 HTML `Note.content`로 투영하고, Media node는 document 순서대로
`Note.attachment`의 Image로 투영한다. `mediaId`는 외부에 노출하지 않고 조회 시점에 접근 가능한 Media URL과
MIME type으로 바꾸며 Media의 nullable Alt Text는 Image의 사람이 읽을 수 있는 이름으로 제공한다. document root의
`sensitiveMedia`는 지원하는 ActivityPub sensitive 속성으로 투영한다. 내부 document의 정확한 Media 삽입
위치는 attachment-only ActivityPub 수신자에게 보존되지 않는다.

Local ActivityPub Note의 Hashtag occurrence는 authored token을 보존한 링크로 공개 Hashtag 게시글 목록을 가리킨다.
각 고유 Hashtag identity는 같은 URL을 가리키는 typed ActivityPub `Hashtag` metadata로도 제공하며, metadata name은
`#`와 저장된 Display Hashtag Name을 결합한다. 본문에 같은 identity가 반복되면 각 링크를 유지하고 metadata는 한 번만 제공한다.

ActivityPub 원격 Note 수신은 지원 가능한 embedded typed Image attachment 중 원래 순서의 앞 4개를 Remote
Media와 같은 순서의 Media node로 투영하고 초과분은 무시한다. Image name은 해당 Media의 nullable Alt Text로
보존한다.
본문이 없어도 하나 이상의 유효한 Image가 있으면 빈 paragraph와 Media node를 가진 contentful revision으로
저장할 수 있다.

## 관계

| 관계              | 대상                    | 방향                    | cardinality | 존재 조건                                                                                                                                                                        | 조회 조건           | 조회 권한 |
| ----------------- | ----------------------- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| Post              | [Post](./post.md)       | Post Content -> Post    | 1 -> 1      | 항상                                                                                                                                                                             | Post 조회 정책 통과 | 없음      |
| Referenced Media  | [Media](./media.md)     | Post Content -> Media   | 1 -> 0..4   | document에 Media node가 있을 때                                                                                                                                                  | Post 조회 정책 통과 | 없음      |
| Mentioned Profile | [Profile](./profile.md) | Post Content -> Profile | 1 -> 0..N   | Local 작성에서 본문 handle token이 저장된 eligible Profile과 일치하거나 선택 Profile이 검증될 때, 또는 inbound typed `Mention.href`가 알려진 Profile stable identity로 확인될 때 | Post 조회 정책 통과 | 없음      |
| Hashtag           | [Hashtag](./hashtag.md) | Post Content -> Hashtag | 1 -> 0..N   | Local 본문 규칙으로 인식되거나 Remote Note의 typed Hashtag name과 본문 occurrence가 일치할 때                                                                                    | Post 조회 정책 통과 | 없음      |

Referenced Media는 Content Document의 Media node가 소유하는 revision 관계다. 별도 관계 테이블이나 Media ID
배열을 두 번째 source of truth로 저장하지 않는다. Post Content를 만들 때 서버는 각 Media 참조의 존재,
Source=Local, State=Ready와 Upload Account 조건을 검증한다. Media row의 물리 삭제는 과거 revision 참조를
깨뜨리지 않는 별도 lifecycle 계약이 생기기 전까지 제공하지 않는다.

Mentioned Profile은 Local 작성에서 본문에 입력된 eligible Profile의 handle token이나 작성자가 명시적으로 선택해 본문 범위와 일치하는 Profile identity, 또는 inbound typed `Mention.href`에서
확인한 stable Profile identity를 immutable revision에 저장하는 관계이며 `post_mentions` DB table에 persisted projection으로 저장한다. Local 작성은 bare handle과 configured Local domain을 configured Local Instance에서만 찾고, qualified remote handle은 이미 저장된 ActivityPub Profile에서만 찾는다. 작성 중 remote resolve/fetch는 하지 않는다. Unknown, malformed, ineligible token은 일반 text로 남는다. 실제 작성 Profile 기준으로 typed·selected target의 visibility와 양방향 Block 정책을 검증하며, 명시적으로 선택한 범위가 본문과 일치하지 않거나 selected target을 이용할 수 없으면 Post 전체를 거부한다. 같은 Profile이 여러 번 나타나면 각 Mention node는 남지만 Profile relation은
한 번만 저장한다. Local authored body text는 문서 검증과 Content Warning summary에 더할 Unicode code point 길이 계산에 사용하고 저장하지 않는다. Authored token과 선택 Mention
range는 기존대로 본문 기준 검증을 통과해야 하며, token 원문은 snapshot 출처가 아니다. Inbound typed Mention의 관계 입력은 body
conversion과 독립된 typed identity 집합이다. 두 작성 경계 모두 canonical Mention node에 저장된 Profile identity인 `profileId`와
optional `handle` attr를 가진다. `handle`은 검증된 Profile의 `relativeHandle`에서만 가져오는 node 생성 시점의 snapshot이며,
identity나 relation 입력으로 사용하지 않는다. Inbound anchor label과 `Mention.name`은 이 값을 채우지 않는다. 원문 anchor의 표시
문자열은 수신 중 loose resource/length budget을 계산하는 동안만 사용할 수 있고 canonical document, 관계, GraphQL 응답 또는
renderer 입력으로 저장하지 않는다. Text projection은 현재 변환에 사용할 수 있는 Profile `relativeHandle`을 우선하고, 없으면
node의 `handle` attr, 둘 다 없으면 기존 `@알 수 없는 사용자`를 사용한다. Dedicated renderer는 같은 revision의 관계에서 조회한 Profile의
`relativeHandle`만 표시하며, 관계가 없거나 Profile이 조회 정책을 통과하지 못해 반환되지 않으면 node의 `handle` attr를 사용하지 않고
Profile 이동 없는 `@알 수 없는 사용자`를 표시한다.
HTML projection이 node의 `handle` attr를 사용할 때는 HTML escape 처리한 plain text로 내보내며, link URL이나 ActivityPub Mention tag를 만들지 않는다.

Hashtag 관계는 각 Post Content revision에 속한다. 새 Local 작성에서는 본문의 인식된 occurrence에 해당하는 canonical identity만
연결하며, Remote Note 수신에서는 typed Hashtag metadata와 일치하는 본문 occurrence의 identity만 연결한다. 본문에 반복된
occurrence는 표시 시 각각 유지한다. Hashtag relation과 node는 Content와 함께 생성되고 Current Content pointer가 갱신되는 같은
원자적 저장 결과에 포함된다. 일부 관계나 본문만 남는 작성은 허용하지 않는다.

inbound typed `Mention.href`는 기존 `ActivityPubActor`·Profile mapping으로 stable Profile identity를 먼저 확인하며, 이 identity
확인은 본문 HTML 변환과 독립적이다. 이미 알려진 Local/Remote Profile은 기존 mapping을 그대로 사용한다. 알려지지 않은 remote actor
target은 Note당 최대 32개의 고유 remote actor URI까지 typed href로 resolve해 materialize할 수 있다. 한도 내 target의 remote actor 조회는
모두 동시에 시작하며, 각 조회는 Note별 하나의 공통 30초 제한을 공유한다. 제한시간이 끝나면 진행 중인 actor 조회를 중단한다.
이미 시작한 remote Profile 저장은 제한시간 뒤에도 완료될 수 있다. 이미 확인된 Mentioned Profile 관계와 Note 전체는 유지한다. 한도를 넘거나
개별 resolve가 실패한 target도 건너뛴다. body anchor href와 `Mention.name`은 actor identity lookup이나 fetch 입력으로 사용하지 않는다. Local
Profile은 `Instances.kind=LOCAL`인 active Instance의 trusted `canonicalOrigin`과 기존 `createLocalProfilePerson`의
`/@{encodedHandle}` 규칙으로 만든 human Profile URL을 사용할 수 있다. Remote Profile은 같은 Actor document의 `url`에서 기존 actor
materialization·refresh가 저장한 hostname 보유 HTTP(S) `profileUrl` alias가 있을 때만 그 alias를 추가 허용 URI로 사용한다. 본문 anchor
href가 확인된 Profile의 actor URI 또는 이 허용 URL과 정확히 일치할 때만 `profileId` Mention node로 표현할 수 있다. 알 수 없거나
불일치한 anchor는 `tag.name`, handle 또는 표시 문자열과 관계없이 안전한 일반 link 또는 표시 text로 보존한다. 서로 다른 Profile이 같은
허용 URL을 공유하면 해당 anchor는 일반 link/text로 남긴다.

이미 알려진 Remote Profile의 alias가 없거나 malformed이면 body matching은 actor URI만 사용하며, Mention receipt가 해당 actor를 다시
fetch하거나 refresh해 cached `profileUrl`을 채우지 않는다. 별도의 기존 actor materialization·refresh 경로는 alias를 갱신하거나 제거할 수
있다. 제한적으로 resolve한 미확인 remote target의 개별 실패나 한도 초과는 그 target만 건너뛴다. typed href에서 확인된 Mentioned Profile
관계는 본문 anchor 불일치와 독립적으로 유지한다. actor URI·저장된 alias와 원문 표시 문자열은 Content Document에 저장하지 않는다.
`post_mentions` row는 Post Content revision과 Profile을 foreign keys로 가리키며 body node와 별도로
typed identity 집합에서 투영한다. column, index와 primary key의 구체 shape는 이 문서에서 고정하지 않는다. 새 revision은 새
Mentioned Profile 관계 집합을 가지며, immutable한 과거 revision과 그 관계는 보존한다. Current Post의 Mentioned Profile은 현재
Post Content 관계에서 투영한다. Note receipt는 이미 저장된 Post Content를 수정하거나 operator/bulk backfill을 수행하지 않는다.
document와 관계 또는 Current Content 포인터 중 하나라도 저장되지 않으면 같은 transaction을
rollback해 partial relation을 남기지 않는다.

## 행동

| 행동              | 행동 주체 Profile | 대상 객체 | 입력값                                                                             | 권한                            | 조건                                                                                                                                                                                                                          | 결과                                                                                                                                                                                      |
| ----------------- | ----------------- | --------- | ---------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post Content 작성 | Profile           | Post      | Content Warning, 본문, typed handle·선택 Mention 대상, Sensitive Media, Media 목록 | `Account.Active`, `Post.Author` | Post가 Active이고 Content를 가지며 입력 document가 현재 schema와 길이·Media·typed/selected Mention 검증을 통과한다. 로컬 본문 Hashtag는 위 로컬 작성 규칙을 따른다. 참조한 Local Media의 Upload Account가 요청 Account와 같다 | 기존 revision은 유지되고 새 immutable Post Content 및 해당 revision의 Mentioned Profile·Hashtag 관계가 생성되며 Post의 현재 Content pointer가 같은 원자적 결과에서 새 revision을 가리킨다 |
| Remote Note 수신  | Remote Profile    | Post      | ActivityPub Note, embedded typed Hashtag metadata                                  | 기존 Remote Note 수신 정책      | typed Hashtag name과 공통 정규화 identity가 일치하는 body occurrence가 있을 때만 Hashtag를 연결한다. inbound `Update(Note)`는 제공하지 않는다                                                                                 | 새 immutable Post Content와 일치하는 Hashtag node·관계를 같은 원자적 저장 결과에 포함한다                                                                                                 |

본문, Content Warning, Sensitive Media, Media의 추가·제거·순서 또는 Media 자체 교체 중 하나라도
바뀌면 새 Post Content를 만든다. 이미지 교체는 먼저 새 Local Media를 Ready로 만든 다음 그 Media를 참조하는 새
revision을 만드는 행동이다. 이전 revision은 이전 Media 참조를 그대로 보존한다.

Nightshade 선택은 Content Document의 속성이 아니며 새 Local Media에 적용된다. 처리 정책은 [Media 객체](./media.md)에
두며, Post Content는 처리 결과가 반영된 Media ID만 참조한다.

ActivityPub `tag`의 typed `Mention`은 앞서 정의한 `Mention.href` identity 확인으로 알려진 Local/Remote Profile을 Mentioned Profile
관계 입력으로 삼는다. 확인된 identity는 본문 anchor URL이나 body parser 결과와 독립적이다. body Mention node는 anchor href가 확인된 actor URI,
기존 actor materialization·refresh로 저장한 Profile URL alias 또는
Local Profile의 trusted human Profile URL과 정확히 일치할 때만 만든다. 이 URL들이 일치하지 않으면 anchor는 안전한 일반 link 또는 표시
text로 보존한다. tag `name`, handle, 본문 표시 문자열은 actor identity lookup/fetch나 body Mention identity 확인에 사용하지 않는다.
일반 link/text와 `to`/`cc` audience는 Mention 관계 입력이 아니다. body anchor가 일치하지 않아도 typed identity에서 확인한 Profile 관계는
저장한다. Remote Profile alias는 기존 actor materialization·refresh가 직접 광고된 hostname 보유 HTTP(S) URL을 저장한 경우에만 사용하며,
known actor의 alias가 없으면 body matching은 actor URI만 사용한다. Mention receipt는 known actor를 다시 fetch/refresh하거나 cached
`profileUrl`을 채우지 않는다. 서로 다른 Profile이 같은 허용 URL을 공유하면 해당 body anchor는 first match 없이 안전한 일반 link/text로
낮추지만 각 typed href의 확인된 Profile 관계는 유지한다. inbound URI, actor alias와 원문 표시 문자열은 저장 전에만 사용하고 canonical
document에는 보존하지 않는다. 제한된 resolve 뒤에도 unresolved 또는 malformed typed Mention은 관계를 만들지 않으며, 본문 URL 불일치만으로
이미 확인된 typed identity를 unresolved로 낮추지 않는다. Mention receipt는 이미 저장된 기존 글을 수정하거나 operator/bulk backfill을
수행하지 않는다. body Mention node의 optional `handle` attr는 일치가 확인된 Profile의 `relativeHandle`에서만 파생하며,
anchor label이나 `tag.name`은 사용하지 않는다. renderer의 표시 문자열은 같은 revision의 Profile `relativeHandle`에서 파생하며,
Profile을 조회할 수 없으면 비링크 `@알 수 없는 사용자`를 표시한다.

Alt Text 변경은 Media metadata 갱신이며 새 Post Content revision을 만들지 않는다. 같은 Media를 여러 Post
Content가 참조한 상태에서 Alt Text를 다시 입력하는 것은 정상적인 작성 흐름은 아니지만 금지하지 않는다. 발생하면
Media의 최신 Alt Text가 그 Media를 참조하는 모든 Post에서 보인다.

이 수정 행동은 revision 모델이 보존하는 별도 제품 capability이며 현재 Post Composer 이미지 업로드 계약이
제공하지 않는다. 사용자용 mutation, UI, 동시 수정 정책과 ActivityPub `Update(Note)` delivery는 독립된 Post
수정 계약에서 전달한다. 구 reader의 본문 text 보존은 기존 `bodyText` fallback을 재사용해 검증하며, link 클릭
동작과 문단 구조의 일시적 저하를 허용하고 Media와 Content Warning은 유지한다. 서버의 본문 파생값부터 구 reader
표시까지 글자·Media·Content Warning 보존을 검증한 뒤, 현재 Post Content V1에 additive한 Mention node 저장을
활성화한다. 이 change에서는 document schema version을 올리거나 V1/V2 dual-read 또는 document version 변환을 도입하지 않으며,
기존 `profileId`-only Mention node는 유효하게 유지하고 별도 backfill을 하지 않는다. Mention node는 `profileId`와 optional
`handle` attr만 저장한다. `handle`은 확인된 Profile `relativeHandle`의 parse-time snapshot이며 inbound target·anchor URI는
저장 전 검증에, 원문 표시 문자열은 loose resource/length budget 계산에만 사용한다.

## 조회 정책

- Post의 일반 조회와 배포는 현재 Post Content만 사용한다.
- V1 읽기에서는 알 수 없는 block·inline node와 그 자손을 생략하고, 아는 형제 node의 순서와 내용을 유지한다. 알 수 없는 node 내용은 표시하지 않는다. 이 projection에서도 Content Warning, 알려진 순서의 Media 참조와 Sensitive Media 표시는 유지한다.
- Post의 Hashtag 집합은 Current Post Content의 revision-owned 관계에서만 투영한다.
- 현재 Post Content의 Referenced Media는 body의 Media node 순서로 제공한다.
- Current Post의 Mentioned Profile은 현재 Post Content의 revision-owned 관계에서 투영한다. 구 reader가 지원하지
  않는 Mention을 받아도 본문 text를 보존해 읽을 수 있는 호환 경계를 먼저 검증하며, Mention 저장 활성화는 그
  검증 뒤에 수행한다. 구 reader에서는 일시적으로 link 클릭 동작과 문단 구조가 저하된 plain text 표시를 허용하고,
  Media와 Content Warning은 유지한다. 이 경계는 기존 `bodyText` fallback을 재사용하며, 서버의 본문 파생값부터
  구 reader 표시까지 글자·Media·Content Warning 보존을 검증한 뒤, 현재 Post Content V1에 additive한 Mention node
  저장을 활성화한다. 이 change에서는 document schema version을 올리거나 V1/V2 dual-read 또는 document version 변환을 도입하지 않는다.
  Mention의 전용 표시·Profile 이동은 [Post Content Mention renderer](../../design/post-content-mentions.md) 계약에 둔다.
  renderer는 현재 revision의 Mention node와 같은 revision의 Profile 관계만 소비하며, 조회 가능한 Profile은 기존 KOSMO
  Profile route로 이동시킨다. 저장 후 Profile이 unavailable 또는 deleted가 되면 `@알 수 없는 사용자`를 표시하고 link 없이 유지하며,
  Mention 관계가 Post Visibility·Post Eligibility를 넓히지 않는다. GraphQL `mentionedProfiles`는 기존 Profile visibility
  predicate(Profile이 `ACTIVE`이고 소속 Instance가 `SUSPENDED`가 아님)를 사용하며, viewer별 Profile Domain Block 정책을
  이 관계에서 새로 조합하지 않는다. 기존 Post body의 `onBodyPress` callback과 부모 Post navigation은 유지하되, 활성
  Mention link의 press는 event propagation을 막아 부모 callback이 함께 실행되지 않게 한다.
  구 reader 2.x 호환성 증거는 별도 deferred gate로 기록하고 renderer 완료를 막는 조건으로 사용하지 않는다.
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
- Hashtag 본문 작성·보존은 새 Local Post·Reply·Quote 및 새 Remote Note 수신에 적용한다. 기존 Local Post 콘텐츠는
  위의 저장 document 처리 규칙으로 재처리할 수 있다. 이 재처리는 사용자용 Post 수정, Remote revision backfill 또는
  inbound `Update(Note)`를 포함하지 않는다.
- 기존 Media의 crop, filter 등 이미지 byte나 파생 표현을 편집하는 기능은 포함하지 않는다. 새 Post에 첨부할
  이미지의 선택적 Nightshade 처리는 새 Local Media 업로드에만 적용하며, 새 이미지를 업로드해 Media 참조를 교체하는
  기능은 포함한다.
- revision 번호, 과거 revision 목록·복원, 동시 편집 충돌 UX와 Media 물리 삭제 정책은 후속 계약에서 정한다.
