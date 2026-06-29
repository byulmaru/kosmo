# Publishing 컨텍스트: 게시와 작성

## 목표

Profile이 짧은 텍스트를 작성하고, 필요하면 미디어와 메타데이터를 붙여, 의도한 공개 범위에
맞게 배포할 수 있어야 한다. 단문형 SNS의 중심 기능이므로 작성 경험은 빠르고 예측 가능해야
한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Media](./media.md), [Social Graph](./social-graph.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Post List](./post-list.md), [Engagement](./engagement.md), [Notification](./notification.md),
  [Discovery](./discovery.md)
- peer: 없음.

## DDD 명세

- 컨텍스트 경계: 게시 작성, 게시 본문, 공개 범위, 답글 구조, Content Warning, 게시 상태를
  정의한다. 게시 목록 삽입, 반응/재게시, 검색 색인은 소유하지 않는다.
- 보편 언어: Post, Author Profile, Post Visibility, Reply, Thread, Content Warning, Sensitive Media,
  Tombstone.
- 핵심 모델: Post를 aggregate root 후보로 둔다. Post Content, Reply Relation, Attached Media는
  Post 안에서 생명주기를 맞추는 하위 모델 후보로 본다.
- 값 객체 후보: Post Body, Post Visibility, Content Warning Text, Mention Target, Language, Publish
  Timestamp.
- 불변 조건: 작성자는 유효한 Profile이어야 한다. 빈 게시 판단은 본문과 첨부 미디어를 함께 본다.
  답글의 기본 공개 범위는 원본 게시의 공개 범위를 넘지 않아야 한다. 게시 후 Post Visibility는 변경할
  수 없다.
- 도메인 이벤트 후보: PostPublished, ReplyPublished, PostEdited, PostDeleted, ContentWarningChanged,
  PostEligibilityChanged.
- 정책 후보: 본문 길이, 멘션한 프로필만 수신자 정책, 삭제와 수정 이력, Content Warning 요구 조건.

### Post Visibility

Post Visibility는 Post가 가진 접근/노출 범위 속성이다. 어떤 Profile이 Post를 볼 수 있는지와 어떤
노출 지면의 후보가 될 수 있는지는 Publishing이 Post Visibility와 viewer Profile의 관계를 기준으로
판단한다.

- Post Visibility는 Post List Control이 아니라 Post의 값 객체다.
- Post Visibility는 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만 네 값으로 나뉜다.
- 팔로워 공개 판정처럼 관계가 필요한 경우 Social Graph의 관계 상태를 참조한다.
- Post에서 멘션된 Profile은 Post Visibility 판정의 접근 대상에 포함된다.
- Post List, Discovery, Notification은 Post Visibility를 새로 정의하지 않고 Publishing이 판단한
  visible 상태를 소비한다.
- 게시 후 Post Visibility 변경은 허용하지 않는다.

| 공개 범위       | 접근 가능 대상                                                  | 검색/해시태그 목록 노출 |
| --------------- | --------------------------------------------------------------- | ----------------------- |
| 공개            | 모든 viewer                                                     | 노출 후보가 된다        |
| 조용한 공개     | 모든 viewer                                                     | 노출하지 않는다         |
| 팔로워 공개     | 작성자, 작성자를 수락된 상태로 팔로우한 Profile, 멘션된 Profile | 노출하지 않는다         |
| 멘션한 프로필만 | 작성자와 Post에서 멘션한 Profile                                | 노출하지 않는다         |

### Post Eligibility

Post Eligibility는 Post가 Post List, Discovery, Notification 같은 읽기/전파 컨텍스트의 후보가 될 수
있는지 나타내는 Post 수준 속성이다.

- Post Eligibility는 viewer별 접근 권한 판정이 아니다.
- Post Visibility가 viewer별 접근 가능 대상을 먼저 결정한다.
- Post Eligibility는 Post Visibility가 허용한 viewer Profile-visible Post 안에서 읽기/전파 후보성을
  제한한다.
- Post Eligibility가 true여도 Post Visibility가 허용하지 않은 viewer Profile에게 노출될 수 없다.
- Post Eligibility는 Post Visibility를 넓히거나 우회할 수 없다.
- Post의 작성, 삭제, tombstone, 게시 상태를 반영한다.
- Author Profile의 활성/정지/삭제 상태를 반영한다.
- Post에 연결된 Media가 Post 노출을 막는 상태인지 반영한다.
- Trust & Safety의 moderation 결과가 Post, Author Profile, Media, 원격 출처의 노출을 막는지
  반영한다.
- Publishing은 Post Visibility를 먼저 적용하고 Post Eligibility를 그 다음 적용해 viewer Profile에게
  visible eligible한 Post인지 판단한다.
- Post List는 Post Eligibility와 Post Visibility를 재해석하지 않고 Publishing이 제공한 visible
  eligible 상태를 소비한다.

## 핵심 기능

### 새 글 작성

- Profile은 텍스트 본문을 작성해 게시할 수 있다.
- 본문은 줄바꿈을 허용한다.
- 본문 길이는 500자로 제한한다.
- 빈 본문은 기본적으로 허용하지 않지만, 첨부 미디어가 있으면 본문이 없어도 게시할 수 있다.

### 공개 범위

공개 범위는 화면 표시용 표현이고, 도메인 canonical term은 Post Visibility다. 공개와 조용한
공개의 접근 가능 대상은 같지만, 조용한 공개는 검색 결과와 해시태그 목록에 노출되지 않는다.

- 공개: 누구나 볼 수 있고 검색 결과와 해시태그 목록 노출 후보가 된다.
- 조용한 공개: 누구나 볼 수 있지만 검색 결과와 해시태그 목록에는 노출되지 않는다.
- 팔로워 공개: 작성자를 수락된 상태로 팔로우한 Profile과 멘션된 Profile에게만 보인다.
- 멘션한 프로필만: Post에서 멘션한 Profile에게만 보인다.

초기 Post Visibility 값은 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만 네 가지로 확정한다.

### 게시 도메인 속성

- 게시는 작성자, 본문, 공개 범위, 작성 시각, 상태를 가진다.
- 본문은 사람이 읽을 수 있는 텍스트 표현을 가진다. 내부 표현이 있더라도 서식 있는 작성 기능은
  제공하지 않는다.
- 빈 게시 판단은 텍스트 본문과 첨부 미디어를 함께 고려한다.
- 본문 길이 제한은 500자다.
- 공개 범위는 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만을 구분해야 한다.
- Content Warning은 `내용 경고`로 표현하며 게시 본문의 표시 정책과 별도 속성으로 다룬다.

### 답글

- Profile은 기존 게시에 답글을 달 수 있다.
- 답글은 원본 게시와 thread 관계를 가진다.
- 답글의 기본 Post Visibility는 원본 Post의 Post Visibility를 넘지 않아야 한다.
- 답글의 멘션 대상은 원본 작성자와 thread 참여자 중 Post Visibility로 접근 가능한 Profile로 제한한다.
- 차단/뮤트/삭제된 게시에는 답글 작성이 제한될 수 있다.

### 내용 경고

- Profile은 게시에 Content Warning 또는 접힘 제목을 붙일 수 있다.
- 접힌 게시의 본문과 미디어는 viewer Profile이 펼치기 전까지 숨긴다.
- 경고 문구는 검색/게시 목록 미리보기에서 본문 대신 노출될 수 있다.
- 민감한 미디어 표시와 Content Warning은 서로 독립적으로 설정할 수 있어야 한다.
- 서버 정책상 특정 키워드나 미디어 유형에는 경고를 권장하거나 요구할 수 있다.

### 미디어 첨부

- Profile은 이미지를 첨부할 수 있다.
- 첨부 개수, 용량, 파일 형식, 해상도 제한은 제품/운영 정책으로 둔다.
- 이미지에는 alt text를 입력할 수 있어야 한다.
- 민감한 미디어 플래그는 Post 단위 속성으로 둔다.

## 도메인 속성/정책 메모

- 게시 ID와 작성자 Profile ID는 불변이어야 한다.
- 본문 수정 기능을 제공할 경우 수정 이력 공개 범위를 정해야 한다.
- 삭제는 soft delete로 처리한다.
- 게시 후 Post Visibility는 변경할 수 없다.

## 제외/보류 범위

- 설문은 현재 Publishing 도메인 범위에서 제외한다.
- 예약 게시와 임시 저장은 현재 Publishing 도메인 범위에서 제외한다.
- 동영상과 GIF 첨부는 현재 Publishing 도메인 범위에서 제외한다.
- 작성 화면 상태와 업로드 실패 표시 방식은 도메인 스펙에서 제외한다.
- URL 미리보기는 디자인/미디어 처리 범위로 분리하고 현재 Publishing 도메인 범위에서 제외한다.

## 미결정 네이밍

- 재게시: Repost
- 내용 경고: Content Warning, CW, 접힘 제목

## 확정된 용어

- 게시물: Post
- 공개 범위: Post Visibility
- 민감한 미디어: Sensitive Media
