# Media 객체

## 정의

Media는 Post와 Profile 표현에 사용되는 논리적 이미지다. Local upload와 Remote 원본, Media와 연결된 Profile,
Alt Text, File 표현, 접근 결과를 소유한다.

## 상태

### Media Source

| 값     | 의미                       |
| ------ | -------------------------- |
| Local  | Kosmo에 업로드된 Media     |
| Remote | 원격 Instance에서 온 Media |

## 속성

| 속성              | 타입/nullability | 검증 정책                                               | 존재 조건       | 조회 조건            | 조회 권한          |
| ----------------- | ---------------- | ------------------------------------------------------- | --------------- | -------------------- | ------------------ |
| Alt Text          | 문자열, nullable | Local은 Media의 Profile이 변경하며 Remote는 원본을 보존 | 항상            | Media 조회 정책 통과 | 없음               |
| Remote URL        | URL, 필수        | 원격 Media 원본 위치                                    | Source가 Remote | Media 조회 정책 통과 | 없음               |
| Remote Fetched At | 시각, nullable   | 마지막 성공 fetch 결과로 갱신                           | Source가 Remote | 운영 조회            | `Account.Operator` |

## 관계

| 관계                   | 대상                    | 방향             | cardinality | 존재 조건                                  | 조회 조건              | 조회 권한             |
| ---------------------- | ----------------------- | ---------------- | ----------- | ------------------------------------------ | ---------------------- | --------------------- |
| Profile                | [Profile](./profile.md) | Media -> Profile | 1 -> 1      | 항상                                       | Media 조회 정책 통과   | `Media.Profile`       |
| Upload Account         | [Account](./account.md) | Media -> Account | 1 -> 1      | Source가 Local                             | 업로드 감사 조회       | `Media.UploadAccount` |
| Original File          | [File](./file.md)       | Media -> File    | 1 -> 1      | Source가 Local                             | Media 조회 정책 통과   | 없음                  |
| Derived File           | [File](./file.md)       | Media -> File    | 1 -> 0..N   | Source가 Local이고 파생 표현이 생성된 경우 | Media 조회 정책 통과   | 없음                  |
| Attached Post          | [Post](./post.md)       | Media <- Post    | 1 -> 0..N   | Post에 첨부된 경우                         | Post 조회 정책 통과    | 없음                  |
| Profile Representation | [Profile](./profile.md) | Media <- Profile | 1 -> 0..N   | avatar/header로 연결된 경우                | Profile 조회 정책 통과 | 없음                  |

Local Media의 Profile은 upload를 수행한 Local Profile이다. Remote Media의 Profile은 원본 Remote Profile이며,
Instance는 이 Profile에서 파생한다.

Post에 Attached Media 관계를 만드는 요청은 Source=Local이고 행동을 요청한 Account와 Upload Account가 같은
Media만 사용할 수 있다. 같은 Upload Account를 가진 Local Media는 Media Profile과 Post Author Profile이
달라도 연결할 수 있다.

## 행동

| 행동              | 행동 주체 | 대상 객체 | 입력값                               | 권한                               | 조건                                                                                  | 결과                                                                                                  |
| ----------------- | --------- | --------- | ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 이미지 업로드     | Profile   | Media     | 이미지 데이터, Alt Text              | `Account.Active`, `Profile.Member` | 행동 주체는 Active/Normal Local Profile이고 입력 데이터가 이미지 검증을 통과한다      | Source=Local인 Media와 Type=Original File, Media/File, 행동 주체 Profile/요청 Account 관계가 생성된다 |
| Remote Media 등록 | 시스템    | Media     | Remote Profile, Remote URL, Alt Text | `System.RemoteMediaSource`         | Remote Profile의 Instance가 새 원격 요청 허용 상태이고 같은 Remote URL의 Media가 없다 | Source=Remote인 Media와 Remote Profile 관계가 생성된다                                                |
| Remote Media 갱신 | 시스템    | Media     | Alt Text, Fetch 결과                 | `System.RemoteMediaSource`         | Source가 Remote이고 Profile의 Instance가 새 원격 요청 허용 상태다                     | 원격 속성과 Remote Fetched At이 갱신된다                                                              |
| Alt Text 변경     | Profile   | Media     | Alt Text                             | `Account.Active`, `Media.Profile`  | Source가 Local이다                                                                    | Alt Text가 바뀐다                                                                                     |

## 권한

| 권한                       | 종류      | 성립 조건                                         |
| -------------------------- | --------- | ------------------------------------------------- |
| `Media.Profile`            | 객체 종속 | 행동/요청 Profile이 Media의 Profile이다           |
| `Media.UploadAccount`      | 객체 종속 | 요청 Account가 Local Media의 Upload Account다     |
| `System.RemoteMediaSource` | 독립      | 시스템이 Remote Media 원본 정보를 반영하는 주체다 |

## 조회 정책

- Post에 연결된 Media는 해당 Post 조회 정책을 통과한 viewer만 조회할 수 있다.
- Profile avatar/header Media는 해당 Profile 조회 정책을 통과한 viewer만 조회할 수 있다.
- 아직 Post나 Profile에 연결되지 않은 Local Media는 Media의 Profile만 조회할 수 있다.
- Remote Media는 Profile의 Instance Safety State가 Domain Block이 아니어야 한다.
- viewer의 Profile Domain Block 대상 Instance에서 온 Remote Media는 viewer에게 없는 것처럼 취급한다.
- Profile의 Instance Reachability State가 Unreachable이거나 Service State가 Suspended이면 새 fetch와 원본
  재검증을 보내지 않지만 기존에 허용된 표현의 공개 범위를 자동으로 바꾸지 않는다.
- Sensitive Media가 true인 Post에 연결된 모든 Media 표시는 가린다.
- avatar 표현은 400x400 crop, header 표현은 1500x500 crop을 기준으로 한다.
- 접근 가능한 URL은 위 정책을 통과한 조회 결과이며 Media의 영구 속성이 아니다.

## 확정 용어

- 미디어: Media
- Media Source: Media Source
- 대체 텍스트: Alt Text
- 원격 미디어: Remote Media

## 제외/보류

- 완료 전 업로드 취소는 upload lifecycle 상태가 확정되지 않아 현재 행동에서 제외한다.
- Media Proxy 조회는 Mutation이 아니므로 행동에서 제외한다.
- 동영상, GIF, 개인 파일함, 과거 업로드 재사용 라이브러리는 현재 범위에서 제외한다.
- 다른 Account의 Local Media와 Remote Media를 Local Post 작성에 연결하는 것은 현재 범위에서 제외한다.
- 구체 MIME type 목록, Hash, EXIF, dedupe, 이미지 변환 실패 삭제 정책, 바이러스 스캔, 성인물 탐지는
  구현/OpenSpec에서 다룬다.
