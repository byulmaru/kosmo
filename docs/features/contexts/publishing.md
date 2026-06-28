# Publishing 컨텍스트: 게시와 작성

## 목표

Profile이 짧은 텍스트를 작성하고, 필요하면 미디어와 메타데이터를 붙여, 의도한 공개 범위에
맞게 배포할 수 있어야 한다. 단문형 SNS의 중심 기능이므로 작성 경험은 빠르고 예측 가능해야
한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Media](./media.md), [Social Graph](./social-graph.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Feed](./feed.md), [Engagement](./engagement.md), [Notification](./notification.md),
  [Discovery](./discovery.md)
- peer: 없음.

## DDD 명세

- 컨텍스트 경계: 게시 작성, 게시 본문, 공개 범위, 답글 구조, Content Warning, 게시 상태를
  정의한다. 피드 삽입, 반응/재게시, 검색 색인은 소유하지 않는다.
- 보편 언어: Post, Author Profile, Post Visibility, Reply, Thread, Content Warning, Sensitive Media,
  Draft, Tombstone.
- 핵심 모델: Post를 aggregate root 후보로 둔다. Post Content, Reply Relation, Attached Media는
  Post 안에서 생명주기를 맞추는 하위 모델 후보로 본다.
- 값 객체 후보: Post Body, Post Visibility, Content Warning Text, Mention Target, Language, Publish
  Timestamp.
- 불변 조건: 작성자는 유효한 Profile이어야 한다. 빈 게시 판단은 본문, 첨부, 설문을 함께 본다.
  답글의 기본 공개 범위는 원본 게시의 공개 범위를 넘지 않아야 한다.
- 도메인 이벤트 후보: PostPublished, ReplyPublished, PostEdited, PostDeleted, PostVisibilityChanged,
  ContentWarningChanged, PostEligibilityChanged.
- 정책 후보: 본문 길이, 멘션한 프로필만 수신자 정책, 삭제와 수정 이력, Content Warning 요구 조건.

### Post Visibility

Post Visibility는 Post가 가진 접근/노출 범위 속성이다. 어떤 Profile이 Post를 볼 수 있는지와 어떤
노출 지면의 후보가 될 수 있는지는 Publishing이 Post Visibility와 viewer Profile의 관계를 기준으로
판단한다.

- Post Visibility는 Feed Control이 아니라 Post의 값 객체다.
- Post Visibility는 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만 네 값으로 나뉜다.
- 팔로워 공개 판정처럼 관계가 필요한 경우 Social Graph의 관계 상태를 참조한다.
- Feed, Discovery, Notification은 Post Visibility를 새로 정의하지 않고 Publishing이 판단한 visible
  상태를 소비한다.
- Post Visibility 변경은 Publishing이 소유하는 Post 상태 변화다.

| 공개 범위       | 접근 가능 대상                                   | 검색/해시태그 목록 노출 |
| --------------- | ------------------------------------------------ | ----------------------- |
| 공개            | 모든 viewer                                      | 노출 후보가 된다        |
| 조용한 공개     | 모든 viewer                                      | 노출하지 않는다         |
| 팔로워 공개     | 작성자와 작성자를 수락된 상태로 팔로우한 Profile | 노출하지 않는다         |
| 멘션한 프로필만 | 작성자와 Post에서 멘션한 Profile                 | 노출하지 않는다         |

### Post Eligibility

Post Eligibility는 Post가 Feed, Discovery, Notification 같은 읽기/전파 컨텍스트의 후보가 될 수
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
- Feed는 Post Eligibility와 Post Visibility를 재해석하지 않고 Publishing이 제공한 visible eligible
  상태를 소비한다.

## 핵심 기능

### 새 글 작성

- Profile은 텍스트 본문을 작성해 게시할 수 있다.
- 본문은 줄바꿈을 허용한다.
- 본문 길이 제한은 제품 정책으로 정한다.
- 빈 본문은 기본적으로 허용하지 않는다.
- 미디어만 있는 게시를 허용할지 여부는 별도 정책으로 정한다.
- 작성 중인 내용은 라우트 이동이나 새로고침 전에 손실 위험을 줄여야 한다.
- 게시 성공 후 작성 폼은 초기화되고 새 게시가 관련 피드에 반영되어야 한다.

### 공개 범위

공개 범위는 화면 표시용 표현이고, 도메인 canonical term은 Post Visibility다. 공개와 조용한
공개의 접근 가능 대상은 같지만, 조용한 공개는 검색 결과와 해시태그 목록에 노출되지 않는다.

- 공개: 누구나 볼 수 있고 검색 결과와 해시태그 목록 노출 후보가 된다.
- 조용한 공개: 누구나 볼 수 있지만 검색 결과와 해시태그 목록에는 노출되지 않는다.
- 팔로워 공개: 작성자를 수락된 상태로 팔로우한 Profile에게만 보인다.
- 멘션한 프로필만: Post에서 멘션한 Profile에게만 보인다.

초기 Post Visibility 값은 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만 네 가지로 확정한다.

### 게시 도메인 속성

- 게시는 작성자, 본문, 공개 범위, 작성 시각, 상태를 가진다.
- 본문은 사람이 읽을 수 있는 텍스트 표현과 서식 있는 표현을 함께 가질 수 있다.
- 빈 게시 판단은 텍스트 본문, 첨부 미디어, 설문 같은 확장 콘텐츠를 함께 고려해야 한다.
- 본문 길이 제한은 제품 정책으로 두며, 초기 후보는 500자다.
- 공개 범위는 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만을 구분해야 한다.
- 멘션한 프로필만은 Publishing의 Post Visibility 값이며, 별도 DM 기능으로 부르지 않는다.
- Content Warning은 `내용 경고`로 표현하며 게시 본문의 표시 정책과 별도 속성으로 다룬다.

### 답글

- Profile은 기존 게시에 답글을 달 수 있다.
- 답글은 원본 게시와 thread 관계를 가진다.
- 답글 작성 화면은 원본 작성자, 원본 일부, 공개 범위 상속 여부를 보여줘야 한다.
- 기본 공개 범위는 원본 게시의 공개 범위를 넘지 않는 방향으로 제안한다.
- 답글 작성 시 원본 작성자와 thread 참여자를 멘션 후보로 제안할 수 있다.
- 차단/뮤트/삭제된 게시에는 답글 작성이 제한될 수 있다.

### 내용 경고

- Profile은 게시에 Content Warning 또는 접힘 제목을 붙일 수 있다.
- 접힌 게시의 본문과 미디어는 viewer Profile이 펼치기 전까지 숨긴다.
- 경고 문구는 검색/피드 미리보기에서 본문 대신 노출될 수 있다.
- 민감한 미디어 표시와 Content Warning은 서로 독립적으로 설정할 수 있어야 한다.
- 서버 정책상 특정 키워드나 미디어 유형에는 경고를 권장하거나 요구할 수 있다.

### 미디어 첨부

- Profile은 이미지, 동영상, GIF 계열 미디어를 첨부할 수 있다.
- 첨부 개수, 용량, 파일 형식, 해상도 제한은 제품/운영 정책으로 둔다.
- 이미지에는 alt text를 입력할 수 있어야 한다.
- 민감한 미디어 플래그를 게시 단위 또는 첨부 단위로 둘지 정해야 한다.
- 업로드 중 게시 버튼은 중복 제출을 막아야 한다.
- 업로드 실패와 게시 실패는 분리해서 Profile에게 보여줘야 한다.

### 설문

- 설문은 질문, 선택지, 마감 시간, 복수 선택 여부를 가진다.
- 투표 후 결과 공개 시점은 즉시 공개와 마감 후 공개 중에서 정해야 한다.
- 게시 작성 모델에서 확장 가능성을 남길지 제품 결정이 필요하다.

### 예약 게시와 임시 저장

- 예약 게시와 임시 저장은 공통 SNS 핵심 기능은 아니지만 실제 운영 Profile 또는 Account에게
  유용하다.
- 제품 결정에 따라 별도 스펙으로 분리할 수 있다.
- 이후 도입 시 서버 작업 큐, 실패 재시도, 예약 취소, 시간대 표시 정책이 필요하다.

## 작성 화면 상태

- 기본 상태: 본문 입력, 공개 범위 선택, 미디어 첨부, 게시 버튼.
- 업로드 중: 첨부별 진행 상태와 취소 버튼.
- 게시 중: 중복 제출 방지.
- 실패: 본문과 첨부 상태를 보존하고 재시도 가능.
- 성공: 작성 화면 초기화, 새 게시 표시, 접근성용 성공 알림.

## 도메인 속성/정책 메모

- 게시 ID와 작성자 Profile ID는 불변이어야 한다.
- 본문 수정 기능을 제공할 경우 수정 이력 공개 범위를 정해야 한다.
- 삭제는 하드 삭제보다 tombstone 또는 soft delete 정책이 필요하다.
- 공개 범위 변경을 허용할지 정해야 한다.
- URL 미리보기는 게시 본문 기능이 아니라 링크 카드/미디어 처리 기능으로 분리할 수 있다.

## 미결정 네이밍

- 재게시: Repost
- 내용 경고: Content Warning, CW, 접힘 제목

## 확정된 용어

- 게시물: Post
- 공개 범위: Post Visibility
- 민감한 미디어: Sensitive Media
