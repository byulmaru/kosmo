# File 객체

## 정의

File은 Object Storage에 저장된 물리 파일 원본 또는 파생 이미지 표현이다. Media의 논리적 사용과 분리해
파일 메타데이터와 저장 원본을 표현한다.

## 상태

명시된 File 상태 차원은 아직 없다.

## 속성

| 속성        | 타입/nullability | 검증 정책                               | 상태별 존재 조건 | 조회 권한          |
| ----------- | ---------------- | --------------------------------------- | ---------------- | ------------------ |
| storage key | 문자열, 필수     | Object Storage 객체 식별자              | 항상             | `Media.Accessible` |
| MIME type   | 문자열, 필수     | 구체 허용 목록은 구현/OpenSpec에서 다룸 | 항상             | `Media.Accessible` |
| byte size   | 숫자, nullable   | 업로드 입력에서 채울 수 있음            | Local 원본       | `Media.Accessible` |
| width       | 숫자, nullable   | 후속 계측 전까지 비어 있을 수 있음      | 이미지 파일      | `Media.Accessible` |
| height      | 숫자, nullable   | 후속 계측 전까지 비어 있을 수 있음      | 이미지 파일      | `Media.Accessible` |

## 관계

| 관계  | 대상                | 조건                             | 조회 권한          |
| ----- | ------------------- | -------------------------------- | ------------------ |
| Media | [Media](./media.md) | File을 논리적으로 사용하는 Media | `Media.Accessible` |

## 행동

| 행동           | 행동 주체   | 대상 객체 | 입력값      | 권한                    | 결과                       |
| -------------- | ----------- | --------- | ----------- | ----------------------- | -------------------------- |
| 원본 File 생성 | Profile     | File      | 이미지 파일 | `Profile.ActiveMember`  | 원본 File이 생성된다       |
| 파생 File 생성 | 시스템 작업 | File      | 원본 File   | `System.ImageProcessor` | 썸네일 또는 파생 File 생성 |

## 권한

| 권한                    | 종류 | 성립 조건                   | 대표 참조      |
| ----------------------- | ---- | --------------------------- | -------------- |
| `System.ImageProcessor` | 독립 | 시스템 이미지 처리 작업이다 | 파생 File 생성 |

## 불변 조건

- CDN/Public URL은 storage key와 배포 정책에서 계산하고 File의 영구 도메인 속성으로 보지 않는다.
- 파일 삭제와 Post 삭제의 관계는 Post-Media 연결 생명주기와 구분한다.

## 확정 용어

- 파일 원본: File Original
- 파생 이미지: Derived Image
- 썸네일: Thumbnail

## 제외/보류

- 구체 파일 형식, 파일 크기 수치, Hash, EXIF 처리, 파생 이미지 생성 방식은 구현/OpenSpec에서 다룬다.
