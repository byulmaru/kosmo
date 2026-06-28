# Media 컨텍스트: 미디어와 파일

## 목표

Profile이 게시와 프로필에 이미지를 포함하고, 접근성 정보를 제공하고, 민감 콘텐츠를 안전하게
처리할 수 있어야 한다. 파일 재사용 기능도 제품 결정 후보로 함께 기록한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Publishing](./publishing.md), [Discovery](./discovery.md), [Messaging](./messaging.md)
- peer: [Notification](./notification.md)

## DDD 명세

- 컨텍스트 경계: 로컬 업로드, 원격 미디어, 파일 원본, 파생 이미지, 접근성 설명, 민감 미디어
  상태를 정의한다. 게시 본문과 프로필 편집 자체는 소유하지 않는다.
- 보편 언어: Media, File Original, Variant, Thumbnail, Alt Text, Sensitive Media, Remote Media,
  Media Proxy.
- 핵심 모델: Media를 aggregate root 후보로 둔다. File Original과 Variant는 Media의 물리 파일
  표현으로 둔다.
- 값 객체 후보: MIME Type, Byte Size, Dimensions, Hash, Alt Text, Focus Point, Remote URL.
- 불변 조건: 팔로워 공개 또는 멘션한 프로필만 Post의 미디어 접근 권한은 URL만으로 우회할 수 없어야
  한다. 로컬 업로드와 원격 미디어는 출처를 구분해야 한다.
- 도메인 이벤트 후보: MediaUploaded, MediaAttached, MediaDetached, MediaMarkedSensitive,
  MediaVariantReady, RemoteMediaCached, MediaDeleted.
- 정책 후보: 파일 크기/형식 제한, alt text 요구 수준, 민감 미디어 표시, 원격 미디어 proxy/cache,
  EXIF 제거와 바이러스 스캔.

## 핵심 기능

### 이미지 첨부

- Profile은 게시에 이미지를 첨부할 수 있다.
- 첨부 개수 제한이 필요하다.
- 파일 크기, MIME type, 해상도 제한이 필요하다.
- 업로드 중 개별 첨부를 취소하거나 제거할 수 있어야 한다.
- 게시 전 미리보기를 제공한다.

### 동영상 첨부

- Profile은 동영상을 첨부할 수 있다.
- 인코딩, 썸네일, 길이 제한, 자동 재생 정책이 필요하다.
- 이미지와 같은 범위로 다룰지 별도 제품 결정이 필요하다.
- 원격 동영상은 proxy/caching 정책이 필요하다.

### GIF와 애니메이션

- GIF 또는 짧은 애니메이션 이미지를 허용할 수 있다.
- 자동 재생, reduced motion, 파일 크기 제한이 필요하다.
- GIF 검색/라이브러리 연동 포함 여부는 별도 제품 결정이 필요하다.

### Alt text

- 이미지는 alt text를 가질 수 있어야 한다.
- alt text 입력을 강제할지 권장할지 정책이 필요하다.
- alt text가 없는 이미지에는 접근성 경고를 보여줄 수 있다.
- 원격 이미지의 alt text는 원본 프로토콜 데이터가 있으면 표시한다.

### 민감 미디어

- Profile은 첨부 또는 게시를 민감 미디어로 표시할 수 있다.
- 민감 미디어는 기본적으로 흐리거나 접힌 상태로 보여준다.
- content warning과 함께 사용할 수 있다.
- Profile은 민감 미디어 자동 표시 설정을 가질 수 있다.

### 프로필 미디어

- avatar와 header image를 업로드할 수 있다.
- 프로필 미디어에는 크롭, 미리보기, 제거 기능이 필요하다.
- 정사각형 avatar와 wide header 비율 정책을 정해야 한다.
- 프로필 미디어는 게시 첨부와 저장/캐싱 정책이 다를 수 있다.

## 파일 관리

### 첨부 파일 모델

- 파일 원본, 파생 이미지, 썸네일, 메타데이터를 구분한다.
- 게시 첨부와 프로필 이미지가 같은 file storage를 함께 사용할 수 있다.
- 파일 삭제와 게시 삭제의 관계를 정해야 한다.
- 같은 파일 중복 업로드를 dedupe할지 정해야 한다.

### 재사용 라이브러리

- Profile은 이전에 올린 파일을 다시 사용할 수 있다.
- 파일별 접근 정책, 소유 Profile, 사용된 게시 목록이 필요하다.
- 개인 파일함은 편리하지만 개인정보와 저장 비용 문제가 크다.
- 재사용 라이브러리를 포함할지, 내부 file 모델만 확장 가능하게 둘지 제품 결정이 필요하다.

### 원격 미디어 프록시

- 원격 게시의 미디어는 원본 URL을 직접 노출하지 않고 proxy할 수 있다.
- proxy는 개인정보 보호, hotlink 방지, 이미지 변환에 유용하다.
- 원격 서버 차단 또는 미디어 제거 요청을 반영해야 한다.
- 캐시 만료와 저장 비용 정책이 필요하다.

## 미디어 표시

- 피드에서는 정해진 비율의 grid로 표시한다.
- 상세 화면에서는 원본 비율과 확대 보기를 제공할 수 있다.
- alt text 표시 또는 설명 보기 버튼을 제공한다.
- 민감 미디어는 viewer Profile의 명시적 action 전까지 숨긴다.
- 실패한 이미지 로딩에는 대체 UI를 제공한다.

## 상태와 에러

- 파일 선택 실패: 형식/용량/개수 제한 메시지.
- 업로드 실패: 첨부별 재시도 또는 제거.
- 변환 대기: 게시 후 처리 중 상태 표시.
- 삭제된 원격 미디어: placeholder 표시.
- 차단된 원격 미디어: 정책상 표시 불가 안내.

## 도메인 속성/정책 메모

- 미디어는 Profile이 다루는 논리적 첨부와 실제 파일 원본을 분리하는 편이 좋다.
- 로컬 업로드와 원격 미디어는 출처가 달라야 한다.
- 팔로워 공개 또는 멘션한 프로필만 Post의 미디어 접근 권한을 URL만으로 우회할 수 없어야 한다.
- 이미지 변환 흐름이 실패해도 원본 삭제 여부를 신중히 정해야 한다.
- EXIF 제거, 바이러스 스캔, 성인물 탐지 같은 운영 기능은 별도 단계로 검토한다.

## 미디어 도메인 속성

- 업로드는 로그인 세션과 active profile을 필요로 한다.
- 초기 이미지 업로드는 단일 파일, 10 MiB 이하, AVIF/GIF/JPEG/PNG/WebP 허용을 후보로 둔다.
- 미디어는 로컬 업로드와 원격 미디어를 구분해야 한다.
- 미디어는 소유 프로필, 원본 파일, 썸네일 또는 파생 이미지, 원격 원본 위치, 접근성 설명,
  민감 콘텐츠 상태를 가질 수 있다.
- 파일 원본은 형식, 크기, 해상도, 검증용 해시 같은 운영 메타데이터를 가질 수 있다.
- 업로드된 미디어는 게시 첨부와 프로필 미디어로 연결될 수 있어야 한다.
- 공개 URL은 미디어의 영구 속성이 아니라 접근 권한과 배포 정책을 통과한 결과로 다룬다.

## 미결정 네이밍

- 미디어: Media, Attachment
- 파일함: Library
- 민감 미디어: Sensitive Media, Content Warning Media
- 대체 텍스트: Alt Text, Image Description
- 프록시: Media Proxy, Remote Cache
