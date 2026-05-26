## 왜 필요한가

클라이언트는 이미지 바이너리 payload를 GraphQL로 보내지 않고 업로드할 수 있는 전용 API가 필요하다. 이번 변경은 `POST /upload` REST 엔드포인트를 추가하고, 인증된 사용자의 이미지 파일을 R2에 스트리밍 업로드한 뒤 `file`/`media` row로 기록하는 데 집중한다.

이미지 변환, WebP 정규화, 썸네일 생성, thumbhash 생성, 산출물 byte size/SHA-256 계측은 업로드 API와 분리해 후속 워커 기반 처리에서 다룬다.

## 변경 내용

- 기존 `/graphql`과 별개로 루트 경로에 `POST /upload` REST 엔드포인트를 추가한다.
- `multipart/form-data`의 `image` 파일 필드를 받는다.
- 업로드 최대 크기는 endpoint 정책 상수로 제한한다.
- 이미지 파일 MIME type으로 보이지 않는 입력은 거부한다.
- 파일 bytes는 R2에 스트리밍 업로드한다.
- `File`은 우리 R2에 저장된 물리 파일을 나타낸다.
- `Media`는 서비스에서 사용하는 논리 미디어를 나타내며 로컬/리모트 모두 표현한다.
- `MediaSource` enum은 `LOCAL`, `REMOTE`를 가진다.
- 로컬 업로드 `Media`는 업로드된 `File`을 `originalFileId`로 참조한다.
- 리모트 ActivityPub `Media`는 초기에는 파일 참조 없이 remote URL, actor, fetchedAt metadata만 저장할 수 있다.
- 변환/썸네일/프록시 워커가 추후 `thumbnailFileId`, `thumbhash`, dimension, hash metadata를 채울 수 있도록 모델을 열어 둔다.

## 기능 범위

### 새 기능

- `image-upload`: REST 이미지 업로드 API의 인증, 입력 검증, R2 저장, DB persistence, 응답 계약.

### 수정 기능

- `data-model`: R2 물리 파일을 위한 `file` 테이블과 로컬/리모트 논리 미디어를 위한 `media` 테이블 추가.

## 영향 범위

- `apps/api/src/index.ts`: REST route를 루트 Hono app에 mount한다.
- `apps/api/src/rest/`: 업로드 REST route를 추가한다.
- `apps/api/src/utils/`: R2 helper를 추가한다.
- `apps/api/package.json`: `@aws-sdk/client-s3` 의존성을 추가한다.
- `packages/core/db/`: `file`, `media`, `media_source`, table discriminator, relation을 추가한다.
- 런타임 설정: R2 endpoint, bucket, access key, secret key, public base URL을 사용한다.
- 업로드 최대 크기는 endpoint 정책 상수로 관리한다.

## 추가 환경변수

- `R2_ENDPOINT`: S3-compatible R2 API endpoint. 예: `https://<account-id>.r2.cloudflarestorage.com`
- `R2_BUCKET`: 업로드 객체를 저장할 R2 bucket 이름.
- `R2_ACCESS_KEY_ID`: R2 S3 API access key ID.
- `R2_SECRET_ACCESS_KEY`: R2 S3 API secret access key.
- `R2_PUBLIC_BASE_URL`: 업로드 후 클라이언트에 반환할 공개 URL base. R2 API endpoint와 다를 수 있으며 custom domain 또는 public bucket URL을 사용한다.
