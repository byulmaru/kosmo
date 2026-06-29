# Media 컨텍스트: 미디어와 파일

## 목표

Media의 업로드 주체, 사용 주체, 파일 원본, 파생 이미지, Alt Text, 접근 정책을 정의한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Publishing](./publishing.md), [Discovery](./discovery.md)
- peer: [Notification](./notification.md), [Post List](./post-list.md)

## DDD 명세

- 컨텍스트 경계: 로컬 이미지 업로드, 원격 이미지, 파일 원본, 파생 이미지, Alt Text를 정의한다.
  게시 본문, Post-Media 연결, 프로필 편집, Profile-Media 연결, Post 단위 민감한 미디어 상태는 소유하지
  않는다.
- 보편 언어: Media, File Original, Variant, Thumbnail, Alt Text, Remote Media, Media Proxy.
- 핵심 모델: Media를 aggregate root 후보로 둔다. File Original과 Variant는 Media의 물리 파일
  표현으로 둔다.
- 값 객체 후보: MIME Type, Byte Size, Pixel Dimensions, Hash, Alt Text, Focus Point, Remote URL.
- 불변 조건: 팔로워 공개 또는 멘션한 프로필만 Post의 미디어 접근 권한은 URL만으로 우회할 수 없어야
  한다. 로컬 업로드와 원격 미디어는 출처를 구분해야 한다.
- 도메인 이벤트 후보: MediaUploaded, MediaVariantReady, RemoteMediaCached, MediaDeleted.
- 정책 후보: 파일 크기/형식/픽셀 캔버스 제한, Alt Text 요구 수준, 원격 미디어 proxy/cache, EXIF 제거.

## 핵심 기능

### 이미지 업로드

- Profile은 게시와 프로필 표현에 사용할 이미지를 업로드할 수 있다.
- 이미지 파일 하나는 최대 10 MiB까지 허용한다.
- 허용 MIME type은 `image/avif`, `image/jpeg`, `image/png`, `image/webp`다.
- 로컬 이미지의 픽셀 캔버스는 가로와 세로 각각 최대 4096px까지 허용한다.
- 완료되지 않은 Media upload는 취소될 수 있다.

### Alt Text

- Media는 Alt Text를 가질 수 있다.
- Alt Text는 Media 자체의 속성이다.
- Alt Text는 필수 입력이 아니다.
- Alt Text 누락은 Media 업로드와 사용을 차단하지 않는다.
- 원격 Media는 원본 프로토콜 데이터의 Alt Text를 보존한다.

### 프로필 미디어

- avatar와 header image로 사용할 Media를 업로드할 수 있다.
- avatar 이미지의 표시 crop은 400x400을 기준으로 한다.
- header image의 표시 crop은 1500x500을 기준으로 한다.
- avatar 이미지는 정사각형 crop을 기준으로 하고, header image는 wide ratio crop을 기준으로 한다.
- Media는 avatar/header 표시용 crop과 파생 이미지를 제공하고, 현재 Profile에 연결된 avatar/header
  Media 참조는 Identity가 소유한다.

## 파일 관리

### 첨부 파일 모델

- 파일 원본, 파생 이미지, 썸네일, 메타데이터를 구분한다.
- 동일 Media는 게시 첨부와 프로필 이미지 연결에서 참조될 수 있다.
- 파일 삭제와 게시 삭제의 관계는 Publishing이 소유한 Post-Media 연결 생명주기로 구분한다.

### 소유권

- Media는 Account의 업로드/감사 책임과 Profile의 사용 주체를 함께 기록한다.
- Account는 업로드와 보안 추적의 기준이고, Profile은 게시/프로필 표현에서의 사용 주체다.
- 미디어 접근 권한은 연결된 Post Visibility와 Profile 표현 정책을 따라야 한다.
- Post가 민감한 미디어로 설정되면 해당 Post에 연결된 모든 Media 표시가 가려진다.

### 원격 미디어 프록시

- 원격 Media는 원본 URL과 Media Proxy URL을 구분한다.
- 외부에 노출되는 Media URL은 접근 권한, Domain moderation action, Media 변환 정책을 통과한 결과다.
- 원격 서버 차단 또는 미디어 제거 요청은 Media 접근 결과에 반영한다.

## 도메인 속성/정책 메모

- 미디어는 Profile이 다루는 논리적 첨부와 실제 파일 원본을 분리한다.
- 미디어의 사용 주체는 Profile이다.
- Account는 미디어 업로드와 보안 감사 기준으로 기록한다.
- 로컬 업로드와 원격 미디어는 출처가 달라야 한다.
- 팔로워 공개 또는 멘션한 프로필만 Post의 미디어 접근 권한을 URL만으로 우회할 수 없어야 한다.
- 파생 이미지는 썸네일과 크기별 표시용 이미지를 포함하는 상위 개념이다.
- Pixel Dimensions는 이미지의 가로/세로 픽셀 크기다.
- 로컬 이미지 업로드 시 EXIF는 제거한다.

## 미디어 도메인 속성

- 업로드는 로그인 세션과 active Profile을 필요로 한다.
- 미디어는 로컬 업로드와 원격 미디어를 구분해야 한다.
- 미디어는 업로드 Account, 사용 Profile, 원본 파일, 썸네일 또는 파생 이미지, 원격 원본 위치, Alt
  Text를 가질 수 있다.
- 파일 원본은 형식, 크기, 픽셀 크기 같은 검증 메타데이터를 가질 수 있다.
- 업로드된 Media는 Publishing의 Post-Media 연결과 Identity의 Profile-Media 연결에서 참조될 수 있다.
- 공개 URL은 미디어의 영구 속성이 아니라 접근 권한과 배포 정책을 통과한 결과로 다룬다.

## 제외/보류 범위

- 동영상 첨부는 현재 Media 도메인 범위에서 제외한다.
- GIF와 짧은 애니메이션 이미지는 현재 Media 도메인 범위에서 제외한다.
- GIF 검색/라이브러리 연동은 현재 Media 도메인 범위에서 제외한다.
- 개인 파일함과 과거 업로드 재사용 라이브러리는 현재 Media 도메인 범위에서 제외한다.
- 파일 dedupe, 이미지 변환 실패 시 원본 삭제 정책, 바이러스 스캔, 성인물 탐지는 현재 도메인 스펙에서
  제외한다.

## 확정된 용어

- 미디어: Media
- 대체 텍스트: Alt Text
- 프록시: Media Proxy
