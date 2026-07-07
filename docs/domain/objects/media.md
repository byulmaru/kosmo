# Media 객체

## 정의

Media는 게시와 Profile 표현에 사용되는 논리적 미디어다. 로컬 업로드와 원격 미디어 출처, Alt Text,
Media Proxy 접근 결과를 소유한다.

## 상태

명시된 Media 상태 차원은 아직 없다. 로컬 업로드와 원격 미디어는 `Media Source` 값으로 구분한다.

### Media Source

| 값     | 의미                       |
| ------ | -------------------------- |
| Local  | Kosmo에 업로드된 Media     |
| Remote | 원격 원본에서 표현된 Media |

## 속성

| 속성                     | 타입/nullability   | 검증 정책                     | 상태별 존재 조건 | 조회 권한          |
| ------------------------ | ------------------ | ----------------------------- | ---------------- | ------------------ |
| source                   | Media Source, 필수 | Local 또는 Remote             | 항상             | `Media.Accessible` |
| Alt Text                 | 문자열, nullable   | 필수 아님, 원격 원본 값 보존  | 항상             | `Media.Accessible` |
| remote URL               | URL, nullable      | 원격 Media 원본 위치          | Remote           | `Media.Accessible` |
| remote fetched timestamp | 시각, nullable     | 미정                          | Remote           | `Media.Accessible` |
| thumbhash                | 문자열, nullable   | 파생 이미지 처리 후 존재 가능 | 항상             | `Media.Accessible` |
| avatar crop 기준         | 크기 값, 필수      | 400x400                       | Profile 표현용   | `Media.Accessible` |
| header crop 기준         | 크기 값, 필수      | 1500x500                      | Profile 표현용   | `Media.Accessible` |

## 관계

| 관계           | 대상                      | 조건                                     | 조회 권한          |
| -------------- | ------------------------- | ---------------------------------------- | ------------------ |
| 사용 Profile   | [Profile](./profile.md)   | 게시/프로필 표현에서의 사용 주체         | `Media.Accessible` |
| 업로드 Account | [Account](./account.md)   | 로컬 업로드와 보안 감사 기준             | `Account.Self`     |
| 원본 File      | [File](./file.md)         | Local Media의 원본 파일                  | `Media.Accessible` |
| 파생 File      | [File](./file.md)         | 썸네일과 크기별 표시용 이미지            | `Media.Accessible` |
| 연결 Post      | [Post](./post.md)         | Post-Media 연결은 Post가 소유            | `Post.Visible`     |
| Profile 표현   | [Profile](./profile.md)   | avatar/header 현재 참조는 Profile이 소유 | `Profile.Visible`  |
| 출처 Instance  | [Instance](./instance.md) | Remote Media의 원격 서버                 | `Media.Accessible` |

## 행동

| 행동             | 행동 주체 Profile | 대상 객체 | 입력값      | 권한                   | 결과                                                                          |
| ---------------- | ----------------- | --------- | ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| 이미지 업로드    | Profile           | Media     | 이미지 파일 | `Profile.ActiveMember` | Local Media와 원본 File이 생성되고 행동 주체 Profile이 Media owner로 기록된다 |
| 업로드 취소      | Profile           | Media     | 없음        | `Media.OwnerProfile`   | 완료 전 Media가 사용 불가가 된다                                              |
| Alt Text 변경    | Profile           | Media     | Alt Text    | `Media.OwnerProfile`   | Media Alt Text가 바뀐다                                                       |
| Media Proxy 조회 | viewer            | Media     | 접근 요청   | `Media.Accessible`     | 접근 가능한 배포 결과를 반환한다                                              |

## 권한

| 권한                  | 종류      | 성립 조건                                                                       | 대표 참조                   |
| --------------------- | --------- | ------------------------------------------------------------------------------- | --------------------------- |
| `Media.Accessible`    | 객체 종속 | 연결된 Post 또는 Profile 표현과 출처 Instance safety 상태가 viewer에게 허용한다 | Media URL/Proxy 결과 조회   |
| `Media.OwnerProfile`  | 객체 종속 | 행동 주체 Profile이 Media의 owner Profile이다. 연결 전 Local Media에도 적용된다 | Media 변경, Post-Media 연결 |
| `Media.ProfileUsable` | 객체 종속 | Media가 대상 Profile 표현에 연결될 수 있다                                      | avatar/header 연결          |

## 불변 조건

- 팔로워 공개 또는 멘션한 Profile만 Post의 Media 접근 권한은 URL만으로 우회할 수 없어야 한다.
- Local Media와 Remote Media는 출처를 구분해야 한다.
- 공개 URL은 Media의 영구 속성이 아니라 접근 권한과 배포 정책을 통과한 결과다.
- Remote Media 접근 결과는 출처 Instance의 Instance Safety State를 반영해야 한다.
- Domain Block 상태인 Instance의 Remote Media는 접근 가능한 배포 결과를 반환하지 않는다.
- Domain Limit 상태는 Media Proxy 접근 결과의 제한 정책에 반영한다.
- 출처 Instance가 Unreachable 또는 Suspended 상태이면 새 원격 fetch 또는 원본 재검증 요청을 보내지 않는다.
- Post가 Sensitive Media로 설정되면 해당 Post에 연결된 모든 Media 표시가 가려진다.
- avatar 이미지는 400x400 crop을 기준으로 하고, header image는 1500x500 crop을 기준으로 한다.

## 확정 용어

- 미디어: Media
- 대체 텍스트: Alt Text
- 프록시: Media Proxy
- 원격 미디어: Remote Media

## 제외/보류

- 동영상, GIF, GIF 검색/라이브러리, 개인 파일함, 과거 업로드 재사용 라이브러리는 현재 범위에서 제외한다.
- 구체 MIME type, Hash, EXIF 처리, 파일 dedupe, 이미지 변환 실패 시 원본 삭제 정책, 바이러스 스캔,
  성인물 탐지는 도메인 명세에서 제외한다.
