## Context

`issueMediaUploadUrl`과 `completeMediaUpload`은 Account/Profile에 결속된 Local Media를 Uploading에서 Ready로
전환하고 Media Storage Service가 byte를 직접 받는다. 현재 `createPost`는 Plain Text에서 PostContent V1
document를 만들지만 Media를 받지 않으며, V1 canonicalizer와 HTML serializer는 top-level paragraph만
가정한다. Post Composer에는 picker와 item별 upload state가 없고 Local Note projection은 current PostContent만
읽어 HTML `content`만 만든다.

PROD-461은 PROD-554, PROD-553, PROD-559와 PROD-581을 하나의 “이미지가 있는 새 Post 작성” 결과로 통합한다. 기존 Post
수정은 독립 Backlog이며 이 change에 포함하지 않는다.

## Goals / Non-Goals

**Goals:**

- PostContent V1에 Media ID·순서를 소유하는 Media node와 Sensitive Media를 additive하게 추가하고 Media에
  nullable Alt Text를 둔다.
- Ready Local Media 검증과 첫 PostContent 생성을 하나의 Post 작성 transaction으로 처리한다.
- Web/iOS/Android Composer에서 갤러리 선택부터 direct upload, Ready 완료와 게시까지 제공한다.
- 새 Local Note의 HTML, attachment와 sensitive 표현을 같은 current PostContent에서 만든다.
- 기존 V1 document, body-only Post·Reply와 Media 없는 Local Note를 호환한다.

**Non-Goals:**

- 기존 Post 수정, revision 교체, 과거 revision UI와 `Update(Note)` delivery
- 카메라, crop/filter, 재정렬 gesture, 목록·상세 Media 렌더링과 fullscreen viewer
- upload 취소·삭제·orphan 정리, thumbnail, background/offline upload와 Remote Media

## Implementation Guidance

### Current Constraints

- PostContent envelope와 ProseMirror JSON key 검증은 exact allowlist이고 canonicalizer가 모든 top-level child를
  paragraph로 재구축하므로 schema node만 추가하면 Media가 손실된다.
- `postContentDocumentToText`와 HTML serializer는 Media 없는 body만 처리한다. HTML serializer는 동기
  DOMSerializer라 Media Storage URL을 직접 조회할 수 없다.
- DB `media.storageReference`는 persistence-only opaque 값이고 GraphQL consumer에게 노출하거나 Kosmo에서 URL과
  media type을 추론할 수 없다. 업로드 완료 시 Media Storage Service가 반환한 공개 URL과 media type을 Media에 저장해야
  read path가 외부 서비스에 의존하지 않는다.
- `createPost` core input은 Account identity를 받지 않지만 Local Media 사용 권한은 요청 Account와 Upload Account
  일치를 요구한다.
- GraphQL `PostContent.document`는 output scalar다. DB UUID와 GraphQL global ID를 같은 persistent 문자열로
  취급하면 core persistence가 transport identity에 결합된다.
- `postBodyTextSchema`의 field 단독 non-empty 검증은 media-only 작성의 body/Media 조합을 표현할 수 없다.
- Composer preview에는 공개 Media 조회 URL이 필요하지 않으며 picker가 제공한 local URI를 사용할 수 있다.
- upload 취소·삭제 계약이 없으므로 실패·제거·재시도는 orphan Uploading/Ready Media를 남길 수 있다.

### Recommended Approach

- V1 ProseMirror schema에 block Media node와 default false인 doc Sensitive Media attr를 추가한다. canonicalizer는
  paragraph와 Media를 각각 보존하고, Plain Text projection은 Media를 무시하며 최소 빈 paragraph를 유지한다.
- persistence Media node에는 검증한 Media DB UUID만 저장한다. GraphQL create input은 Media
  global ID를 decode하고, `PostContent.document` output은 node의 DB UUID를 global ID로 encode한다.
- Local `createPost`는 검증된 Account ID, ordered Media item과 Sensitive Media를 받아 transaction 안에서 Media를
  한 번 조회하고 exact count, distinct, Local/Ready/Account 조건을 확인한 뒤 Media Alt Text와 Post의 첫
  PostContent를 같은 transaction에 저장한다.
- GraphQL create input은 optional ordered Media item list와 optional Sensitive Media를 사용한다. omitted는 빈
  list와 false다. 별도 Media Alt Text mutation이나 Post Media field를 만들지 않는다.
- 앱은 SDK 호환 `expo-image-picker`를 `pnpm` CLI로 추가하고 library-only selection을 남은 슬롯으로 제한한다.
  item별 local key, URI, `uploading | ready | failed`, Media global ID와 Alt Text를 유지한다.
- 각 item은 `issueMediaUploadUrl` → local byte PUT → `completeMediaUpload` 순서로 즉시 처리한다. 재시도는 새
  Uploading Media부터 시작하고 제거된 local key의 늦은 결과를 무시한다.
- `completeMediaUpload`은 인증된 representation 조회가 반환한 URL과 media type을 Ready At·Ready state와
  함께 저장한다. 필드 존재와 transport type만 확인하고 Media Type의 MIME 문법·지원 여부·byte 일치성은
  Media Storage Service를 최종 권위로 신뢰해 재검증·정규화하지 않는다.
- Composer는 local URI preview, 상태, 재시도·제거, Alt Text와 Sensitive Media를 공용 React Native primitive와
  canonical platform target으로 제공한다. 선택 Media가 없으면 Sensitive Media를 false로 되돌린다.
- Local Note projection은 current PostContent의 Media DB IDs를 함께 읽는다. Media node를 제거한 body만 기존
  DOMSerializer에 전달하고 Media에 저장된 URL·media type·Alt Text를 Media node 순서대로
  ActivityPub Image로 만든다. projection과 authorization은 Media Storage Service를 호출하지 않으며 sensitive는
  Fedify가 지원하는 확장 표현 경계에서 추가한다.

### Allowed Alternatives

- PostContent body에서 Media node를 제거한 HTML projection은 canonical ProseMirror transform 또는 동등하게
  schema 검증을 재사용하는 adapter를 사용할 수 있다. 별도 수동 rich-text renderer는 허용하지 않는다.
- Native local URI byte 읽기는 Expo SDK 56에서 실제 검증된 `fetch(uri).blob()` 또는 동등한 native-safe File
  API를 사용할 수 있다. Web은 picker asset의 `File`을 사용할 수 있다.
- Fedify vocab이 sensitive extension을 직접 지원하지 않으면 동일 JSON-LD 의미를 보존하는 지원 extension
  경계를 사용할 수 있다.

### Known Traps

- `post_media`, `post_content_media`, Media ID array 또는 `Post.sensitiveMedia`를 추가하지 않는다.
- GraphQL global ID를 DB document에 저장하거나 DB UUID를 GraphQL document에 그대로 노출하지 않는다.
- Media node의 `toDOM`을 public `<img>`로 만들어 HTML과 attachment에 중복 출력하지 않는다.
- raw storage reference, upload URL 또는 local preview URI를 Post/Media 공개 identity나 ActivityPub 속성으로
  노출하지 않는다.
- Media Profile과 Author Profile 일치나 selected Profile의 Local Instance를 요구하지 않는다.
- PUT 성공 전에 Ready 완료·Post 작성을 시도하거나 실패한 제한 URL을 재사용하지 않는다.
- `PROD-435` Local Media 업로드 change가 archive되기 전에 stale root `image-upload`를 이번 change의 현재 계약으로
  간주하지 않는다.

## Risks / Trade-offs

- [JSON Media 참조에 DB FK가 없음] → create transaction에서 존재·Ready·Account를 검증하고 과거 revision을
  깨뜨리는 Media 물리 삭제를 현재 범위에서 제공하지 않는다.
- [ActivityPub attachment는 내부 삽입 위치를 보존하지 않음] → document 순서만 attachment 순서로 유지하고
  HTML `<img>` 중복으로 보완하지 않는다.
- [실패·제거가 orphan Media를 남김] → item 상태와 제외 범위를 명시하고 cleanup을 선제 구현하지 않는다.
- [앱과 backend의 순차 rollout] → backend schema/core/API를 먼저 배포하고 구버전 앱의 omitted input을 유지한다.
- [저장된 공개 URL 정책 변화] → Kosmo는 provider URL을 조립하지 않고 완료 응답을 저장한다. URL
  교체 lifecycle은 별도 계약으로 다루며 raw storage reference는 protocol output에 노출하지 않는다.
- [저장 서비스가 잘못된 표현을 확정함] → 이미지 검증·변환과 Media Type 결정은 Media Storage Service의 단일
  책임으로 둔다. Kosmo의 중복 MIME parser·allowlist·byte 검사는 추가하지 않으며 서비스가 반환한 값을 그대로
  저장·투영한다.
- [Followers Media URL 재공유] → Note delivery·역참조에서 recipient 권한을 확인한 뒤 저장된 공개 URL을
  전달한다. URL 획득 뒤 byte 조회·재전달은 제한하지 않으며 Media proxy·audience별 signed URL은 별도
  capability로 둔다.

## Migration Plan

1. PROD-554에서 V1 schema, core와 GraphQL input/output을 배포한다. JSONB table/column migration은 없다.
2. PROD-581에서 nullable URL·Media Type column과 완료 write를 배포한다.
3. PROD-559에서 저장된 표현을 쓰는 Local Note attachment와 sensitive projection을 배포한다. Media 없는 Note는 그대로 유지한다.
4. PROD-553에서 picker dependency와 Composer upload UI를 배포한다.
5. PROD-461에서 격리 DB와 stateful Media Storage fake를 사용하는 통합 테스트로 발급 → client-equivalent direct
   PUT → Ready → Post 작성 → GraphQL document → Local Note를 한 흐름에서 검증한다.
6. rollback은 app/Fedify/API code를 이전 버전으로 되돌린다. 새 V1 document가 이미 저장됐다면 구버전
   canonicalizer가 Media node를 거부하므로 backend rollback 전에 해당 document 존재 여부와 호환 처리를 확인한다.

## Open Questions

없음.
