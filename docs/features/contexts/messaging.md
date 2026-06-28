# Messaging 컨텍스트: 메시징

## 목표

Profile이 공개 피드 밖에서 제한된 대상과 대화할 수 있어야 한다. 다만 메시징은 Publishing의
`멘션한 프로필만` Post Visibility와 별도 Direct Message 모델을 구분한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Social Graph](./social-graph.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Notification](./notification.md)
- peer: [Publishing](./publishing.md), [Media](./media.md)

## DDD 명세

- 컨텍스트 경계: 공개 피드 밖의 제한 대화, 대화방, 메시지, 요청함, 읽음 상태를 정의한다.
  Publishing의 `멘션한 프로필만` Post Visibility는 소유하지 않는다.
- 보편 언어: Conversation, Message, Participant, Message Request, Inbox, Read State, Direct Message.
- 핵심 모델: Conversation을 aggregate root 후보로 둔다. Message와 Participant는 Conversation
  안에서 생명주기를 맞춘다.
- 값 객체 후보: Conversation Type, Message Body, Read Receipt, Delivery State.
- 불변 조건: 차단한 Profile은 새 메시지를 보낼 수 없어야 한다. 요청함의 수락 전 접근과 알림 범위는
  제한되어야 한다.
- 도메인 이벤트 후보: ConversationCreated, MessageSent, MessageDeleted, MessageRequestAccepted,
  ConversationMuted, MessageRead.
- 정책 후보: 별도 DM 포함 여부, 그룹 대화, 읽음 표시, E2EE 여부, 신고 시 메시지 제출 범위.

## 가능한 모델

### 멘션한 프로필만 Post

- 게시 공개 범위를 멘션한 Profile 중심으로 제한한다.
- UI는 메시지처럼 보일 수 있지만 게시 공개 범위 정책을 따르는 대화 방식이다.
- 게시 모델과 같은 공개 범위 정책을 사용할 수 있어 상대적으로 단순하다.
- 화면 문구는 대화방식 DM과 혼동되지 않아야 한다.

### Direct Message

- Profile 간 별도 대화방을 제공한다.
- 메시지는 피드 게시와 별도 대화 도메인으로 다룬다.
- 읽음 상태, 대화 목록, 알림, 요청함, 차단 연동이 필요하다.
- end-to-end encryption 여부를 정해야 한다.
- 연합 또는 원격 Profile DM 지원은 복잡도가 높다.

### 요청함

- 팔로우하지 않는 사람의 메시지를 바로 inbox에 넣지 않고 요청함에 둔다.
- Profile은 수락, 삭제, 차단, 신고를 선택할 수 있다.
- spam 방지를 위해 신규 계정/반복 발송 제한이 필요하다.

## 제품 결정 기준

- 별도 DM 시스템을 포함할지 제품 결정이 필요하다.
- 멘션한 프로필만 Post를 먼저 제공하고, UI에서 private conversation처럼 과장하지 않는다.
- 실제 DM을 만들 경우 별도 이슈로 분리한다.
- 공개 SNS 기능이 안정화된 뒤 메시징을 도입하는 편이 안전하다.

## DM을 도입할 때 필요한 기능

### 대화방

- 1:1 대화와 그룹 대화 지원 여부를 정한다.
- 대화방에는 참여자 목록, 생성 시각, 마지막 메시지, 읽음 상태가 있다.
- 참여자 추가/퇴장/차단 시 과거 메시지 접근 정책이 필요하다.

### 메시지 작성

- 텍스트 메시지를 보낼 수 있다.
- 미디어 첨부 허용 여부와 파일 제한을 정한다.
- 전송 실패 시 재시도와 삭제를 제공한다.
- 동일 메시지 중복 전송을 막아야 한다.

### 메시지 삭제

- 내 화면에서만 삭제와 모두에게 삭제를 구분해야 한다.
- 모두에게 삭제는 상대 클라이언트와 원격 서버에서의 보장 범위를 명확히 해야 한다.
- 감사/신고 목적으로 보관해야 하는 로그 범위를 정해야 한다.

### 읽음 상태

- 읽음 표시를 제공할지 정한다.
- Profile이 읽음 표시를 끌 수 있는지 정한다.
- 그룹 대화에서 참여자별 읽음 상태를 보여줄지 정한다.

### 차단과 신고

- 차단한 Profile은 새 메시지를 보낼 수 없어야 한다.
- 메시지 대화에서 바로 신고할 수 있어야 한다.
- 신고 시 메시지 내용을 운영자에게 제출할지 명확히 안내해야 한다.

## 도메인 속성/정책 메모

- DM은 Post Visibility만으로 해결하기 어렵다.
- 보안 기대치가 높으므로 암호화 여부와 서버 접근 가능성을 명확히 해야 한다.
- 원격 DM은 프로토콜 호환성과 개인정보 리스크가 크다.
- 메시지 보존 기간, export, 삭제, 신고 보관 정책이 필요하다.

## 미결정 네이밍

- 메시지: Message, DM, Direct Message
- 요청함: Message Requests, Requests
- 멘션한 프로필만 Post: Mentioned Profiles Only, Mention-only Post
- 대화방: Conversation, Chat
