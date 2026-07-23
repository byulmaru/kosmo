# ADR 0015: Post Share Reference

## 상태

Accepted

## 날짜

2026-07-23

## 결정

- Post의 공유 참조는 같은 Post를 식별하는 canonical public Web URL이다.
- 공유 참조는 canonical Web origin과 `/{relativeHandle}/{postId}` 경로를 결합한 절대 URL이다.
- 공유 참조에는 현재 화면의 query와 hash를 포함하지 않는다.
- API origin과 플랫폼 전용 native deep link는 Post의 공유 참조로 사용하지 않는다.
- Web, Android와 iOS는 같은 Post에 대해 같은 공유 참조를 제공한다.
- 인증하지 않은 guest도 조회할 수 있는 Post의 공유 참조를 복사할 수 있다.
- 공유 참조를 알고 있어도 Post Visibility와 Post Eligibility가 허용하지 않은 viewer의 조회 범위는 넓어지지
  않는다.

## 이유

Post 링크는 현재 화면의 검색·필터·탭 상태나 실행 플랫폼이 아니라 공유 대상 Post 자체를 안정적으로 가리켜야
한다. API endpoint와 native deep link는 특정 클라이언트나 배포 환경에 종속되므로, 여러 플랫폼과 외부
수신자가 함께 사용할 제품 공유 참조로 적합하지 않다.

## 대안

- 현재 browser URL 전체를 복사하면 query와 hash가 일시적인 화면 상태를 공유 계약에 포함하므로 채택하지
  않았다.
- native deep link를 복사하면 Web 수신자와 앱 미설치 환경에서 같은 참조를 사용할 수 없으므로 채택하지
  않았다.
- API origin을 사용하면 사용자용 Post 화면 대신 구현 endpoint가 공개 참조가 되므로 채택하지 않았다.

## 결과

- 공유 UI는 현재 플랫폼과 무관하게 canonical public Web URL을 복사한다.
- 현재 화면 URL을 그대로 재사용하지 않고 Post의 Author Profile `relativeHandle`과 Post ID로 공유 경로를
  구성한다.
- URL 생성과 clipboard 동작은 구현 계층의 책임이며, 이 결정은 공유 결과의 제품 계약만 정의한다.

## 문서 반영

- [Post](../objects/post.md)는 공유 참조의 조회 정책과 Post Visibility 경계를 정의한다.
