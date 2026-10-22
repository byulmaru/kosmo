# Post Content Hashtag renderer

Local Post·Reply·Quote 본문에서 서버가 확인한 Hashtag를 원래 occurrence 위치에 inline으로 표시한다. 본문 text와
Hashtag identity 관계를 함께 사용하며, 클라이언트가 raw text를 다시 파싱해 대상을 추측하지 않는다.

## 표시

- 작성된 `#` 표기, 대소문자, 등장 순서와 반복 occurrence를 유지한다. Hashtag 이름을 chip이나 별도 목록으로 분리하지 않는다.
- Hashtag는 기존 본문 typography와 text layout을 사용한다. 앞뒤 문장과 같은 inline text로 줄바꿈한다.
- PROD-827이 Hashtag 선택·이동·공개 게시물 목록을 제공하기 전까지 Hashtag는 static text다. link styling, link role,
  focus stop, click·keyboard·touch action 또는 임시 navigation target을 제공하지 않는다.
- Web·Android·iOS에서 같은 본문 구조와 text semantics를 사용한다. 별도 Hashtag accessibility element를 만들지 않는다.

## 범위

- Post Content 표시와 Hashtag 관계는 현재 revision을 따른다. 본문 원문은 tag relation이 없거나 Hashtag 표시를 지원하지 않는
  reader에서도 그대로 읽을 수 있다.
- Composer의 입력·validation·draft 동작은 [Post Composer](./post-composer.md)가 소유한다.
- Hashtag 선택·이동과 공개 게시물 목록은 PROD-827이 소유한다.
