## Context

Media는 stable identity와 URL, media type, Alt Text를 소유한다. PostContent document는 Media ID와 순서,
document root는 Sensitive Media를 소유한다. 기존 Media Node loader는 Upload Account만 직접 조회할 수 있다.

## Goals / Non-Goals

**Goals:**

- `PostContent.media: [Media!]`로 실제 Node를 document 순서대로 반환한다.
- authorized PostContent field가 Media 표시 필드에 `readMedia`를 grant한다.
- createPost가 입력 Alt Text를 Media에 원자적으로 저장한다.
- Media가 없으면 `[]`, 불완전한 representation이면 field 전체를 `null`로 반환한다.

**Non-Goals:**

- 참조 Post를 역추적하는 standalone Media Node 권한
- Media 재사용을 정상 workflow로 만들거나 Post 귀속을 제한하는 정책
- UI, ActivityPub delivery, Post 수정, remote media

## Implementation Guidance

- PostContent Media node에는 `mediaId`만 저장한다.
- createPost core service는 document Media ID 순서와 `{mediaId, altText}` 입력이 일치하는지 검증한 뒤,
  첨부 가능성 검증, Media Alt Text 갱신, Post/PostContent 생성을 한 transaction에서 수행한다.
- 같은 Media에 다른 Alt Text를 다시 쓰는 비정상 사례는 거부하지 않는다. 최신 Media 값이 모든 참조에 보인다.
- `PostContent.media`는 Media row를 batch read해 document 순서로 복원하고 `grantScopes: ['readMedia']`를 둔다.
- `Media.url`, `Media.mediaType`, `Media.altText`는 `$granted: 'readMedia'`를 요구한다. Upload Account가 직접
  조회한 Media는 Media type grant로 같은 scope를 얻는다.
- standalone Media loader는 변경하지 않는다. 참조 Post 기반 direct Node authorization은 후속 이슈가 소유한다.
- URL/media type이 없는 row, non-Ready row 또는 missing row가 하나라도 있으면 partial list 대신 `null`이다.

## Migration Plan

nullable `media.alt_text` column을 additive migration으로 추가한다. 첨부 기능은 아직 출시 전이므로 document
V1 초안의 `altText` attr를 별도 version/backfill 없이 제거한다.
