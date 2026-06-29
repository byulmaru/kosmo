# ADR 0002: PR Review Domain Adjustments

## 상태

Accepted

## 날짜

2026-06-29

## 결정

PR 리뷰에서 확인된 불일치와 불명확한 범위를 다음처럼 정리한다.

- 게시 목록의 canonical domain term은 `Post List`다. `Feed`는 canonical domain term으로 사용하지
  않는다.
- `Post List` 정책은 Home Post List, Profile Post List, Hashtag Post List만 다룬다.
- Home Post List와 Profile Post List는 Repost 후보를 Engagement에서 합쳐 목록 항목으로 표시한다.
- Hashtag Post List는 Post Visibility가 공개인 원본 Post만 포함하고 답글과 Repost는 포함하지 않는다.
- Local, Federated, List 기반 Post List, Custom Post List, 키워드 수집형 Post List는 현재 범위에서
  제외한다.
- Repost는 공개 또는 조용한 공개 Post만 대상으로 한다. Repost는 원본 Post Visibility를 변경하지
  않는다.
- Reaction은 같은 Post에 대해 Profile당 같은 이모지 1개만 허용하고, 서로 다른 이모지는 여러 개
  허용한다.
- 본문 길이는 500자로 제한한다. 첨부 미디어가 있으면 본문이 없어도 Post를 게시할 수 있다.
- 게시 후 Post Visibility는 변경할 수 없다.
- 팔로워 공개 Post도 멘션된 Profile에게는 보인다.
- 민감한 미디어 플래그는 Post 단위 속성으로 둔다.
- 설문, 예약 게시, 임시 저장, 동영상, GIF는 현재 Publishing/Media 범위에서 제외한다.
- alt text 입력은 강제가 아니라 권장 정책으로 둔다.
- Media는 Account와 Profile이 동시에 소유한다. 개인 파일함과 과거 업로드 재사용 라이브러리는 현재
  Media 범위에서 제외한다.
- 단어/해시태그 제어의 canonical term은 Word Mute, Hashtag Mute다. Filter는 canonical term으로
  사용하지 않는다.
- 단어/해시태그 뮤트는 대소문자를 구분하지 않고, 단어 경계 없이 부분 문자열로 매치한다.
- thread mute는 해당 Post/thread의 답글, Reaction, Repost 알림을 끄는 단위다.
- Block 발생 시 기존 Notification은 삭제한다.
- 신고 제출 주체는 Account다. Account는 자신이 소유하지 않은 Profile을 신고할 수 있다.
- 신고자에게 처리 결과와 처리 상태 목록을 제공하지 않는다.
- 서버 차단 또는 Profile 도메인 차단에 걸린 콘텐츠는 없는 것처럼 취급한다.
- Labeler, stackable moderation, 커뮤니티 moderation은 현재 Trust & Safety 범위에서 제외한다.

## 문서 반영

- [Post List 컨텍스트](../contexts/post-list.md)는 게시 목록과 Repost 후보 합성 규칙을 정의한다.
- [Publishing 컨텍스트](../contexts/publishing.md)는 Post Visibility, 본문 길이, 빈 Post 판정,
  Content Warning, 민감한 미디어 속성을 정의한다.
- [Media 컨텍스트](../contexts/media.md)는 이미지 중심의 Media 도메인만 다룬다.
- [Notification 컨텍스트](../contexts/notification.md)는 thread mute와 읽음 상태를 정의한다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md)는 Word Mute, Hashtag Mute, 신고, 서버 차단
  정책을 정의한다.
