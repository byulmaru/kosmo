# Post Content Hashtag renderer

Local Post·Reply·Quote 본문에서 서버가 확인한 Hashtag를 원래 occurrence 위치에 inline으로 표시한다. 본문 text와
Hashtag identity 관계를 함께 사용하며, 클라이언트가 raw text를 다시 파싱해 대상을 추측하지 않는다.

## 표시

- 작성된 `#` 표기, 대소문자, 등장 순서와 반복 occurrence를 유지한다. Hashtag 이름을 chip이나 별도 목록으로 분리하지 않는다.
- Hashtag는 기존 본문 typography와 text layout을 사용한다. 앞뒤 문장과 같은 inline text로 줄바꿈한다.
- 인터랙티브 게시물 본문에서 Hashtag는 서버가 제공한 Global ID의 공개 게시물 목록으로 이동한다. 원래 token을
  inline link로 표시하고, link activation은 부모 게시물 press로 전파하지 않는다.
- 미리보기 등 `interactive=false`인 본문에서는 Hashtag를 원래 token의 static text로 유지한다.
- Web·Android·iOS에서 interactive 본문은 inline link semantics를, noninteractive 미리보기는 원래 text semantics를 사용한다.

## 범위

- Post Content 표시와 Hashtag 관계는 현재 revision을 따른다.
- Composer의 입력·validation·draft 동작은 [Post Composer](./post-composer.md)가 소유한다.
- Hashtag 작성·identity와 Profile Tag entry는 별도 계약을 따른다. 공개 게시물 목록은 PROD-827이 소유한다.
