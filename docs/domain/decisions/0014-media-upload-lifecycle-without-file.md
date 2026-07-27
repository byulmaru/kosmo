# ADR 0014: Media Upload State Without File

## 상태

Accepted

## 날짜

2026-07-26

## 결정

- Kosmo는 Media Storage Service가 소유하는 원본·파생 파일 표현을 별도 File 객체로 복제하지 않는다.
- 인증된 Account와 행동 주체 Profile이 Local Media 업로드를 시작하면 Kosmo는 Source=Local,
  State=Uploading Media를 만들고 Media Storage Service의 opaque 저장 참조를 그 Media에 결속한다.
- 저장 참조는 Media의 외부 저장 연동 정보이며 Media identity, Account/Profile 소유권, 조회 권한 또는 Post 연결
  권한을 대신하지 않는다. Kosmo API consumer는 Media identity를 사용하고 raw 저장 참조에 의존하지 않는다.
- Kosmo가 Media Storage Service에서 이미지 저장 성공을 확인하면 같은 Media를 State=Ready로 전환한다.
  Uploading Media는 Post Attached Media나 Profile Representation으로 연결할 수 없다.
- Media Storage Service는 이미지 byte, 원본·파생 표현, 형식·크기·dimension 검증, storage key, 접근 URL과
  cache 정책을 소유한다. Kosmo는 제품 관계와 권한에 필요한 Media identity, state, Account/Profile 관계를
  소유한다.
- 사용되지 않는 기존 Kosmo `/upload` API와 File persistence는 호환 계약으로 유지하지 않는다. 실제 consumer가
  없는 현재 상태를 기준으로 새 외부 업로드 경계로 교체한다.
- Remote Media의 외부 저장 projection은 실제 Remote Media 저장 구현이 시작될 때 정밀화하며 Local 업로드
  persistence에 미래 컬럼이나 File 표현을 미리 추가하지 않는다.

## 결과

- 별도 upload claim이나 File row 없이 Media 하나가 업로드 요청부터 저장 완료까지 identity와 소유권을 유지한다.
- Local Media 업로드는 Uploading 생성과 Ready 전환의 두 행동으로 분리된다.
- 같은 Account의 다른 Member Profile이 만든 Ready Media를 Post에 연결할 수 있는 기존 Upload Account 정책은
  유지된다.
- 업로드 만료, 실패, 취소와 orphan Media 정리는 별도 정책이 확정될 때까지 현재 범위에서 제외한다.

## 대체하는 결정

- [ADR 0003](./0003-policy-ownership-clarifications.md)의 File 소유 책임
- [ADR 0005](./0005-domain-boundary-followup-clarifications.md)의 File 표현 경계
- [ADR 0007](./0007-spec-boundary-and-state-clarifications.md)의 File 구현 경계
- [ADR 0013](./0013-media-storage-service-boundary.md)의 저장 성공 뒤 Media/File 동시 성립 계약
