# 미디어와 파일

## 목표

사용자가 게시와 프로필에 이미지를 포함하고, 접근성 정보를 제공하고, 민감 콘텐츠를 안전하게
처리할 수 있어야 한다. Misskey Drive처럼 파일 재사용 기능도 제품 결정 후보로 함께 기록한다.

## 핵심 기능

### 이미지 첨부

- 사용자는 게시에 이미지를 첨부할 수 있다.
- 첨부 개수 제한이 필요하다.
- 파일 크기, MIME type, 해상도 제한이 필요하다.
- 업로드 중 개별 첨부를 취소하거나 제거할 수 있어야 한다.
- 게시 전 미리보기를 제공한다.

### 동영상 첨부

- 사용자는 동영상을 첨부할 수 있다.
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

- 사용자는 첨부 또는 게시를 민감 미디어로 표시할 수 있다.
- 민감 미디어는 기본적으로 흐리거나 접힌 상태로 보여준다.
- content warning과 함께 사용할 수 있다.
- 사용자는 민감 미디어 자동 표시 설정을 가질 수 있다.

### 프로필 미디어

- avatar와 header image를 업로드할 수 있다.
- 프로필 미디어에는 크롭, 미리보기, 제거 기능이 필요하다.
- 정사각형 avatar와 wide header 비율 정책을 정해야 한다.
- 프로필 미디어는 게시 첨부와 저장/캐싱 정책이 다를 수 있다.

## 파일 관리

### 첨부 파일 모델

- 파일 원본, 파생 이미지, 썸네일, 메타데이터를 구분한다.
- 게시 첨부와 프로필 이미지가 같은 file storage를 공유할 수 있다.
- 파일 삭제와 게시 삭제의 관계를 정해야 한다.
- 같은 파일 중복 업로드를 dedupe할지 정해야 한다.

### 재사용 라이브러리

Misskey Drive를 참고한다.

- 사용자는 이전에 올린 파일을 다시 사용할 수 있다.
- 파일별 공개 범위, 소유 profile, 사용된 게시 목록이 필요하다.
- 개인 파일함은 편리하지만 개인정보와 저장 비용 문제가 크다.
- 재사용 라이브러리를 포함할지, 내부 file 모델만 확장 가능하게 둘지 제품 결정이 필요하다.

### 원격 미디어 프록시

- 원격 게시의 미디어는 원본 URL을 직접 노출하지 않고 proxy할 수 있다.
- proxy는 개인정보 보호, hotlink 방지, 이미지 변환에 유용하다.
- 원격 서버 차단 또는 미디어 제거 요청을 반영해야 한다.
- 캐시 만료와 저장 비용 정책이 필요하다.

## 미디어 표시

- 타임라인에서는 정해진 비율의 grid로 표시한다.
- 상세 화면에서는 원본 비율과 확대 보기를 제공할 수 있다.
- alt text 표시 또는 설명 보기 버튼을 제공한다.
- 민감 미디어는 사용자 action 전까지 숨긴다.
- 실패한 이미지 로딩에는 대체 UI를 제공한다.

## 상태와 에러

- 파일 선택 실패: 형식/용량/개수 제한 메시지.
- 업로드 실패: 첨부별 재시도 또는 제거.
- 변환 대기: 게시 후 처리 중 상태 표시.
- 삭제된 원격 미디어: placeholder 표시.
- 차단된 원격 미디어: 정책상 표시 불가 안내.

## 데이터/정책 메모

- media는 logical media, file은 physical object로 분리하는 편이 좋다.
- local upload와 remote media는 source가 달라야 한다.
- private 게시의 미디어 접근 권한을 URL만으로 우회할 수 없어야 한다.
- 이미지 변환 pipeline이 실패해도 원본 삭제 여부를 신중히 정해야 한다.
- EXIF 제거, 바이러스 스캔, 성인물 탐지 같은 운영 기능은 별도 단계로 검토한다.

## 현재 코드상 확인된 구현

- REST `POST /upload` 이미지 업로드 엔드포인트가 있다.
- 업로드는 로그인 세션과 active profile이 필요하다.
- 단일 이미지 파일은 10 MiB 이하로 제한되어 있고, 요청 본문 limit은 64 MiB다.
- 허용 MIME type은 `image/avif`, `image/gif`, `image/jpeg`, `image/png`, `image/webp`다.
- 업로드된 파일은 R2 object로 저장하고, DB에는 `file`과 `media` row를 트랜잭션으로 생성한다.
- `file`은 storage key, MIME type, byte size, width/height, sha256 메타데이터를 가질 수 있다.
- `media`는 `LOCAL`/`REMOTE` source, account/profile 소유자, original/thumbnail file, remote URL,
  thumbhash를 가질 수 있다.
- 응답은 media id, object key, public URL, content type을 반환한다.
- 현재 코드상 업로드된 media를 게시 첨부로 연결하는 모델이나 작성 UI 연동은 확인되지 않았다.

## 미결정 네이밍

- 미디어: Media, Attachment
- 파일함: Drive, Library
- 민감 미디어: Sensitive Media, Content Warning Media
- 대체 텍스트: Alt Text, Image Description
- 프록시: Media Proxy, Remote Cache
