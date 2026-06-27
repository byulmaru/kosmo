# Kosmo 기능 리스트 초안

## 목적

이 문서는 Kosmo를 단문형 SNS 제품으로 만들기 위해 필요한 기능을 도메인별로 정리한
초안이다. X, Bluesky, Mastodon, Misskey의 공통 기능을 먼저 보고, 충돌하거나 특정
플랫폼에만 있는 기능은 별도 참고 항목으로 분리한다.

이 문서는 최종 PRD가 아니라 실제 제품 스펙을 작성하기 위한 작업대다. 기능명, 포함 범위,
정책 문구, 구현 방식은 이후 제품 결정과 기술 검토를 거쳐 확정한다.

## 기준

- 공통 기능을 먼저 제품 후보로 둔다.
- 플랫폼마다 이름만 다른 기능은 Kosmo 이름을 확정하지 않고 후보명을 병기한다.
- 작동 방식이 충돌하면 Mastodon 스타일을 우선 기준으로 설명한다.
- Mastodon에도 없거나 Mastodon과 다르게 강한 장점이 있는 기능은 참고 기능으로 분리한다.
- 단순 기술 레이어는 기능으로 분리하지 않는다. GraphQL, DB, 캐시, 인프라, 디자인 시스템은
  각 기능을 구현하기 위한 내부 수단이다.
- Bluesky, ActivityPub, AT Protocol 같은 연합/프로토콜은 사용자에게 보이는 기능과
  내부 호환성 요구를 구분해서 기록한다.

## 문서 목록

- [게시와 작성](./01-posting.md)
- [타임라인과 피드](./02-timelines.md)
- [프로필과 계정 정체성](./03-profiles-identity.md)
- [관계와 소셜 그래프](./04-relationships.md)
- [상호작용](./05-interactions.md)
- [검색과 발견](./06-search-discovery.md)
- [알림](./07-notifications.md)
- [안전과 모더레이션](./08-safety-moderation.md)
- [메시징](./09-messaging.md)
- [미디어와 파일](./10-media-files.md)
- [플랫폼 차이와 미결정 항목](./90-platform-differences.md)

## 참고 플랫폼

### X

X는 포스트, 답글, 리포스트, 인용, 북마크, 리스트, 커뮤니티, DM, Spaces처럼 대중형
중앙집중 SNS에 가까운 기능 묶음을 제공한다. Kosmo에서는 공통 SNS 기능의 기준점으로
참고하되, 추천 알고리즘 중심 경험이나 유료 인증/수익화 기능은 이번 초안의 핵심 범위로
두지 않는다.

공식 참고:

- [X posts](https://help.x.com/en/using-x/how-to-post)
- [X direct messages](https://help.x.com/en/using-x/direct-messages)
- [X lists](https://help.x.com/en/using-x/x-lists)
- [X bookmarks](https://help.x.com/en/using-x/bookmarks)
- [X communities](https://help.x.com/en/using-x/communities)
- [X Spaces](https://help.x.com/en/using-x/spaces)

### Bluesky

Bluesky는 custom feed, starter pack, labeler 기반 모더레이션, account portability처럼
발견과 계정 이동성에 강한 방향을 가진다. Kosmo에서는 feed 선택권, 온보딩 묶음, 외부
모더레이션 레이블이라는 참고 기능으로 다룬다.

공식 참고:

- [Bluesky custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds)
- [Bluesky direct messages](https://bsky.social/about/blog/05-22-2024-direct-messages)
- [Bluesky starter packs](https://bsky.social/about/blog/06-26-2024-starter-packs)
- [Bluesky stackable moderation](https://bsky.social/about/blog/03-12-2024-stackable-moderation)

### Mastodon

Mastodon은 연합형 단문 SNS의 기본 모델로 본다. 공개 범위, content warning, boost,
favourite, bookmark, 로컬/연합 타임라인, 필터, mute/block/report 같은 충돌 항목은
Mastodon 방식을 우선 기준으로 잡는다.

공식 참고:

- [Mastodon posting](https://docs.joinmastodon.org/user/posting/)
- [Mastodon network features](https://docs.joinmastodon.org/user/network/)
- [Mastodon moderation](https://docs.joinmastodon.org/user/moderating/)
- [Mastodon quote posts](https://docs.joinmastodon.org/user/quote-posts/)

### Misskey

Misskey는 note, renote, reaction, antenna, channel, clip, drive처럼 커뮤니티와 개인
정리에 강한 기능을 제공한다. Kosmo에서는 풍부한 반응, 키워드 기반 수집, 클립/드라이브형
재사용 기능을 참고 후보로 둔다.

공식 참고:

- [Misskey notes](https://misskey-hub.net/en/docs/for-users/features/note/)
- [Misskey timelines](https://misskey-hub.net/en/docs/for-users/features/timeline/)
- [Misskey reactions](https://misskey-hub.net/en/docs/for-users/features/reaction/)
- [Misskey antennas](https://misskey-hub.net/en/docs/for-users/features/antenna/)
- [Misskey clips](https://misskey-hub.net/en/docs/for-users/features/clip/)
- [Misskey Drive](https://misskey-hub.net/en/docs/for-users/features/drive/)

## 공통 스펙 형식

각 기능 문서는 다음 관점으로 읽는다.

- 목표: 사용자가 얻는 가치
- 핵심 기능: 공통적으로 필요한 동작
- Mastodon 우선 기준: 충돌 시 기본값으로 삼을 정책
- 참고 기능: 특정 플랫폼에만 있거나 별도 제품 결정이 필요한 기능
- 데이터/정책 메모: 이후 구현 스펙으로 옮겨야 하는 결정
- 미결정 항목: 제품 이름, 정책, 포함 범위가 확정되지 않은 부분
