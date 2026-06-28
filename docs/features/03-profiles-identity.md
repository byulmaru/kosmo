# 프로필과 계정 정체성

## 목표

사용자가 자신을 표현하고, 다른 사용자를 안정적으로 식별하고, 로컬/원격 actor를 혼동하지 않게
해야 한다. Kosmo는 계정과 프로필을 분리하는 구조를 이미 갖고 있으므로 제품 스펙도 계정,
프로필, 표시 handle, actor identity를 구분한다.

## 핵심 기능

### 계정

- 로그인과 보안 설정의 주체다.
- 하나 이상의 프로필을 소유할 수 있다.
- 이메일, OAuth, 패스키 같은 인증 수단은 계정 기능에 속한다.
- 계정 삭제와 프로필 삭제는 분리해서 정책을 정해야 한다.
- 계정 정지와 프로필 정지는 운영 정책상 별도 상태가 될 수 있다.

### 프로필

- 공개적으로 보이는 소셜 정체성이다.
- 표시 이름, handle, bio, avatar, header image, 링크, 생성일, 통계, 고정 게시를 가진다.
- 프로필은 로컬 프로필과 원격 프로필로 나뉠 수 있다.
- 로컬 프로필은 사용자가 직접 편집할 수 있다.
- 원격 프로필은 원격 actor document 또는 프로토콜 동기화에서 온 정보를 캐시한다.

### 표시 이름과 handle

- 표시 이름은 사람이 읽는 이름이며 중복될 수 있다.
- handle은 URL, 멘션, 검색, 연합 식별에 쓰인다.
- 화면 표시용 handle과 로컬 URL 생성용 handle을 분리한다.
- 로컬 프로필은 `@handle`처럼 표시할 수 있다.
- 원격 프로필은 `@handle@host`처럼 표시할 수 있다.
- 같은 `handle`이라도 instance가 다르면 다른 프로필이다.

### 프로필 URL

- 로컬 프로필은 안정적인 내부 URL을 가진다.
- 원격 프로필은 Kosmo 안의 캐시 프로필 URL과 원본 canonical URL을 모두 가질 수 있다.
- 사용자가 보는 링크가 내부 라우트인지 원격 원본인지 명확해야 한다.
- handle 변경 시 기존 URL redirect 정책을 정해야 한다.

### 프로필 편집

- 사용자는 표시 이름, bio, avatar, header image, 링크를 수정할 수 있다.
- handle 변경 허용 여부는 별도 정책으로 정한다.
- 변경 사항은 프로필 페이지, 사이드바, 게시 작성자 표시, 검색 결과에 반영되어야 한다.
- 미디어 업로드 실패와 프로필 저장 실패를 분리해서 처리한다.

### 고정 게시

- 사용자는 자신의 게시를 프로필 상단에 고정할 수 있다.
- 여러 개를 고정할 수 있는지, 순서를 바꿀 수 있는지 정해야 한다.
- 비공개 게시를 고정할 경우 방문자 권한에 따라 보이지 않을 수 있다.
- 원격 actor의 pinned posts 동기화는 ActivityPub 호환성을 따로 검토한다.

### 개인 프로필 노트

Mastodon의 private note on profile을 참고한다.

- 사용자는 다른 프로필에 대해 본인만 볼 수 있는 메모를 남길 수 있다.
- 메모는 대상 프로필 공개 정보가 아니라 viewer와 대상 프로필 사이의 관계 메타데이터다.
- 상대방, 공개 방문자, 원격 서버에는 노출하지 않는다.
- 삭제는 빈 문자열 또는 null 저장 중 하나로 정하되, UI에서는 `메모 없음`과 저장 실패를 구분한다.
- 관계 화면, 프로필 상세, 팔로우 관리 화면 중 어디에 노출할지 제품 결정이 필요하다.

### 프로필 통계

- 팔로워 수, 팔로잉 수, 게시 수를 보여준다.
- 각 수치는 차단/비공개/원격 동기화 지연에 따라 정확하지 않을 수 있다.
- 수치 클릭 시 관련 목록으로 이동한다.
- 비공개 계정 또는 제한된 프로필의 목록 공개 범위를 정해야 한다.

## 프로필 상태

- 활성: 정상 표시.
- 비공개 또는 승인제: 팔로우 요청과 공개 범위 제한이 적용된다.
- 정지: 운영자 또는 서버 정책으로 숨김.
- 삭제됨: tombstone 또는 삭제 안내 상태.
- 원격 접근 실패: 이전 캐시를 표시하되 최신성 경고를 둘 수 있다.

## 참고 기능

### 인증 배지

- X의 인증 배지와 Bluesky의 도메인 handle/검증 모델을 참고할 수 있다.
- 유료 인증이나 권위 배지를 포함할지 제품 결정이 필요하다.
- 조직, 공식 계정, 도메인 소유권 검증이 필요해질 때 별도 스펙으로 분리한다.

### 프로필 테마

- Misskey 계열의 풍부한 프로필 꾸미기를 참고할 수 있다.
- 제품 결정에 따라 avatar/header/bio/link 정도로 제한할 수 있다.
- 테마 기능은 접근성, 대비, 모바일 레이아웃 영향을 검토한 뒤 도입한다.

### 계정 이동

- Mastodon의 계정 이동, Bluesky의 portability 개념을 참고한다.
- 원격 follow redirect, 이전 계정 표시, 새 계정 안내가 필요하다.
- 계정 이동을 포함할지 제품 결정이 필요하다. 단, actor identity 설계가 이동 가능성을 막지 않아야 한다.

### Featured profiles와 featured tags

- Mastodon의 featured profiles처럼 사용자가 자기 프로필에 추천 프로필을 노출할 수 있다.
- Mastodon의 featured tags처럼 사용자가 자주 쓰는 해시태그를 프로필에 고정 노출할 수 있다.
- 추천 프로필은 팔로우와 다르며, 공개 프로필 장식과 신뢰 신호에 가깝다.
- featured tag는 해시태그 타임라인과 프로필 게시 목록을 연결한다.
- Kosmo에서 프로필 고정 게시, 추천 프로필, 추천 태그를 같은 `프로필 하이라이트` 모델로 묶을지
  결정이 필요하다.

## 데이터/정책 메모

- `profile.handle`은 표시 문자열과 URL lookup 책임을 혼동하면 안 된다.
- 로컬 프로필과 원격 프로필의 uniqueness 기준은 달라야 한다.
- profile 상태 변경은 게시, 팔로우, 알림, 검색 색인에 영향을 준다.
- private key, actor signing material, 인증 토큰은 프로필 API로 노출하면 안 된다.

## 현재 코드상 확인된 구현

- `profile.handle`은 3자 이상 30자 이하이며 영문, 숫자, 밑줄만 허용한다.
- `profile.displayName`은 1자 이상 80자 이하로 검증된다.
- `profile.bio`는 nullable이며 500자 이하로 검증된다.
- `profile` 테이블에는 `state`, `handle`, `normalizedHandle`, `displayName`, `bio`, `followPolicy`,
  `createdAt`이 있다.
- `normalizedHandle`은 unique로 저장된다.
- `createProfile`은 handle만 입력받아 profile을 만들고, 기본 `displayName`은 handle, 기본
  `followPolicy`는 `OPEN`으로 설정한다.
- `updateProfile`은 `displayName`, `bio`, `followPolicy`를 수정할 수 있고, 프로필의 OWNER 또는
  ADMIN 권한이 필요하다.
- 현재 코드상 avatar, header image, profile links, 개인 프로필 노트, featured profiles,
  featured tags의 완성된 구현은 확인되지 않았다.

## 미결정 네이밍

- 계정: Account, User
- 프로필: Profile, Actor
- 표시 handle: displayHandle, qualifiedHandle, acctHandle
- 원본 URL: canonicalUrl, actorUrl, remoteUrl
- 승인제 프로필: Locked, Protected, Follow approval required
