# ADR 0022: Post Content Revision Media Nodes

## 상태

Accepted

## 날짜

2026-07-29

## 대체하는 결정

- ADR 0002의 “게시 후 Attached Media 관계를 바꾸지 않는다”와 Sensitive Media를 Post 속성으로 두는 결정을
  대체한다. Alt Text를 Media 속성으로 두는 결정은 유지한다.
- ADR 0003과 ADR 0005의 Post 작성 시 Media 관계를 만들고 게시 뒤 연결을 바꾸지 않는 결정을 대체한다.
- ADR 0013의 Attached Post 관계 소유 부분을 대체한다. Media의 Alt Text 소유와 Media Storage Service와
  Kosmo의 저장·접근 책임 분리는 유지한다.
- `version-post-content-document` 결정의 “canonical document node와 재구축 가능한 revision-owned DB relation을
  함께 사용한다” 방향 중 별도 DB relation 요구를 대체한다.

## 결정

- [Post Content](../objects/post-content.md)는 Post의 immutable authored-content revision이다. Post는 현재
  Post Content를 가리키며, 본문·Content Warning·Sensitive Media·Media 구성이 바뀌면 새 revision을 만들고
  현재 포인터를 원자적으로 바꾼다.
- `document.version`은 revision 번호가 아니라 breaking Content Document schema version이다. Media node와
  생략 시 기존 의미를 유지하는 attr 추가는 additive V1 확장이므로 version을 올리지 않는다.
- V1 ProseMirror body에 `media` block node를 추가한다. node의 `mediaId`와 document 안의 위치가 revision별
  Media 참조와 표시 순서를 소유한다. nullable Alt Text는 Media가 소유한다. document root의 `sensitiveMedia` attr는
  모든 Media node에 적용하고 생략하면 `false`다.
- 별도 Post/Post Content-Media 관계 테이블이나 Media ID 배열을 만들지 않는다. Content Document가 유일한
  canonical 관계이며 서버가 revision 생성 시 참조 무결성, Ready 상태와 Upload Account 권한을 검증한다.
- 이미지 교체는 새 Local Media를 Ready로 만든 뒤 새 Media를 참조하는 Post Content revision을 만드는 것이다.
  기존 revision과 그 Media 참조는 수정하지 않는다.
- 새 Post Content에 Media를 첨부할 때 입력된 Alt Text는 같은 transaction에서 Media에 저장한다. 같은 Media에
  다른 Alt Text를 다시 입력하는 것은 정상적인 작성 흐름은 아니지만 금지하거나 Post 귀속 제약을 만들지 않는다.
  발생하면 최신 Alt Text가 그 Media의 모든 참조에 보이며 Alt Text 변경만으로 새 Post Content revision을 만들지 않는다.
- ActivityPub projection은 paragraph/text/link를 안전한 `Note.content` HTML로 직렬화하고 Media node를 문서
  순서대로 `Note.attachment` Image로 분리한다. Image URL과 MIME type은 `mediaId`에서 조회 시점에 해석하고
  Media의 Alt Text는 Image의 사람이 읽을 수 있는 이름으로 제공한다. `sensitiveMedia`는 지원하는 ActivityPub
  sensitive 속성으로 투영한다.
- Media node를 HTML `<img>`와 `Note.attachment`에 중복 투영하지 않는다. attachment-only 수신자에게 내부
  Media 삽입 위치가 보존되지 않는 것은 현재 federation 표현의 허용된 손실이다.
- Media 첨부 기능이 아직 배포되지 않은 출시 전 단계에서 기존 V1 초안의 `altText` node attr를 제거하고 Media
  소유로 바로잡는다. 이 초안은 외부 호환 계약이 아니므로 V2를 만들지 않는다. 기능 출시 뒤에는 기존 node/field
  의미 변경·제거·이름 변경, Media 참조 형식 변경 또는 호환되지 않는 canonicalization 변경에 새 version을 사용한다.
- Media를 revision-owned node로 저장하는 결정은 기존 Post 수정 기능의 존재를 전제하지 않는다. 새 Post의 첫
  Post Content에 Media node를 저장하는 이미지 업로드와 기존 Post의 새 revision을 만드는 수정 기능은 독립
  계약이다. 수정 mutation/UI와 `Update(Note)` delivery를 이미지 업로드의 구현 자식이나 blocker로 두지 않는다.

## 결과

- 본문, Content Warning과 Media 편집이 하나의 revision 경계를 공유한다.
- Sensitive Media는 revision별로 바뀔 수 있지만 Alt Text는 Media의 최신 metadata를 모든 참조가 공유한다.
- DB foreign key가 JSON Media 참조를 보호하지 않으므로 write-time validation과 Media 물리 삭제 정책이 참조
  안전성을 책임진다. 현재 범위에서는 과거 revision을 깨뜨리는 Media 물리 삭제를 제공하지 않는다.
- Post 작성과 편집 API, 앱 renderer와 composer/editor는 같은 V1 Media node를 사용해야 한다.
- 기존 ProseMirror HTML serializer는 Media node를 제외한 body projection을 직렬화하고, Local Note
  projection은 참조 Media를 함께 조회해 ActivityPub attachment를 구성해야 한다.
- Post Content 수정 후 원격 수신자에게 `Update(Note)`를 전달하는 lifecycle은 이 결정이 정하지 않는다.

## 문서 반영

- [Post Content](../objects/post-content.md)는 revision, Content Document와 Referenced Media를 정의한다.
- [Post](../objects/post.md)는 현재 Post Content 관계와 Post Content 수정 행동을 연결한다.
- [Media](../objects/media.md)는 논리 이미지, Alt Text와 업로드 lifecycle을 소유한다.
