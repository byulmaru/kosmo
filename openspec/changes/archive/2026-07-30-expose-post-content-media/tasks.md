## 1. PROD-570 PostContent Media Node 조회

**Deliverable**

Post viewer가 current PostContent에서 document 순서의 실제 Media Node와 URL, media type, Media-owned Alt Text를
조회하며 Sensitive Media는 document에서 해석한다.

- [x] 1.1 canonical, Linear와 공유 OpenSpec을 Media-owned Alt Text 계약으로 정렬한다.
- [x] 1.2 Media Alt Text persistence와 createPost 원자적 갱신을 구현한다.
- [x] 1.3 `PostContent.media` grant와 Media 표시 필드 scope auth를 구현한다.
- [x] 1.4 순서, 최신 Alt Text, 권한, media-less/unavailable 결과를 검증한다.
- [x] 1.5 schema, migration, 정적 검사, 테스트와 strict OpenSpec validation을 통과시킨다.
- [x] 1.6 완료 승인을 받은 뒤 active spec에 동기화해 archive한다.
