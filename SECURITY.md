# Security Policy

## 지원 범위

KOSMO는 `main`의 최신 코드, 현재 공식적으로 운영되는 Dev·Production 배포와
공식 배포 중인 클라이언트 빌드를 지원합니다.

오래된 커밋, 개인 포크 또는 임의로 수정된 배포에서만 발생하는 문제는 지원 범위가
아닙니다. 다만 같은 문제가 지원 중인 코드나 배포에도 영향을 준다면 제보 대상입니다.

## 취약점 제보

보안 취약점은 공개 Issue나 Pull Request 대신
[hello@byulmaru.co](mailto:hello@byulmaru.co)로 비공개 제보해 주세요.

- 제목에 `[Security] KOSMO`를 포함해 주세요.
- 영향받는 구성 요소와 버전 또는 커밋을 알려 주세요.
- 재현 조건, 예상 영향과 최소한의 재현 자료를 포함해 주세요.
- 불필요한 개인정보, 실제 사용자 데이터와 비밀 값은 보내지 마세요.
- 사전 협의 없이 Production 서비스에 부하를 주거나 데이터를 변경하지 마세요.

## 시스템과 범위

이 정책은 다음 저장소 구성 요소와 그 공식 배포 구성을 다룹니다.

- Web 클라이언트와 BFF, GraphQL API 및 Admin
- iOS·Android 클라이언트
- ActivityPub endpoint, Fedify queue와 consumer
- Temporal Worker와 외부 side effect
- PostgreSQL 데이터와 migration
- Media Storage Service, OIDC 등 외부 서비스 연동
- 빌드, CI, 컨테이너, Helm과 release workflow

보호 대상에는 계정과 세션, Profile과 콘텐츠의 접근 범위, 미디어, 서비스 자격 증명,
데이터 무결성과 서비스 가용성이 포함됩니다.

## 위협 모델과 신뢰 경계

HTTP·GraphQL 요청, OIDC callback 입력, 업로드, ActivityPub payload와 remote document,
외부 서비스 응답 및 저장된 원격 콘텐츠는 신뢰하지 않는 입력으로 취급합니다.

주요 경계는 클라이언트와 Web/API, federation ingress와 Fedify consumer,
애플리케이션과 PostgreSQL·Temporal·외부 서비스, 그리고 source와 CI·배포 artifact
사이입니다. 운영자가 관리하는 설정과 secret store는 신뢰하지만, 그 경계를 통과하는
값은 용도와 형식에 맞게 검증해야 합니다.

## 보안 불변식

- 인증된 identity를 확정하기 전에 사용자나 remote actor를 신뢰하지 않습니다.
- 데이터 조회와 변경 전에 Account–Profile membership, owner 권한과 visibility 정책을
  적용합니다.
- ActivityPub actor, signature, 대상과 visibility를 검증하며 검증되지 않은 remote
  identity로 상태를 변경하지 않습니다.
- 사용자·원격 콘텐츠는 실행 가능한 코드가 아닌 데이터로 처리하고 안전한 표현으로
  변환합니다.
- 업로드의 소유권, 상태와 허용된 표현을 검증하고 완료되지 않은 미디어를 게시하지
  않습니다.
- redirect와 outbound request가 자격 증명을 유출하거나 의도한 네트워크 경계를
  우회하지 않게 합니다.
- secret은 서버 경계에 유지하고 client bundle, 로그와 오류 응답에 노출하지 않습니다.
- transaction rollback, replay와 retry가 중복 변경이나 외부 전달을 만들지 않아야
  하며 외부 side effect는 선언된 commit 경계를 지킵니다.
- 신뢰하지 않는 입력의 크기와 처리량을 제한하여 무제한 parsing, queue 증가 또는
  자원 고갈을 허용하지 않습니다.
- release artifact는 승인된 source revision과 연결되며 배포 자격 증명은 최소 권한으로
  사용합니다.

## 제보 가능한 문제와 심각도

지원 중인 경로에서 현실적인 공격자가 위 불변식을 위반해 기밀성, 무결성 또는
가용성에 영향을 줄 수 있다면 제보 대상입니다. 계정 탈취, 권한 우회, 비공개 데이터
노출, 서버 코드 실행, secret 유출, federation identity 위조, 공급망 침해, 데이터
손실과 지속적인 서비스 거부는 높은 영향으로 평가합니다.

심각도는 필요한 권한과 사용자 상호작용, 공격자 도달 가능성, 영향받는 사용자·instance
범위, 자동화·지속 가능성과 복구 비용을 함께 고려합니다.

Scanner 또는 Dependabot 알림만으로 실제 영향이나 안전성이 확정되지는 않습니다.
해당 버전, 공격자 입력, runtime·build·CI 경로와 보안 통제 영향을 확인합니다.
개발 의존성이라는 이유만으로 제외하지 않습니다.

## 범위 밖 항목과 수용 위험

다음 항목만으로는 취약점으로 보지 않습니다.

- 지원 중인 코드나 배포에 영향을 주지 않는 오래된 revision 또는 수정된 포크의 문제
- 현실적인 도달 경로와 보안 영향이 없는 이론적 문제
- KOSMO의 연동 방식이나 설정에 결함이 없는 외부 서비스 자체의 문제
- 공식 CI·배포에는 영향을 주지 않고, 문서와 다르게 외부에 노출한 로컬 개발 환경만의
  문제

현재 저장소 전체에 적용되는 별도의 수용 위험은 없습니다. 수용 위험을 추가하려면
영향 범위, 근거, 보완 통제, 책임자와 재검토 조건을 함께 기록해야 합니다.

## 알려진 제한과 보완 통제

GraphQL의 사용자별 visibility와 owner 권한은 PostgreSQL RLS가 아니라 중앙
application policy가 적용합니다. Runtime은 shared non-owner database role을 사용하고,
PostgreSQL constraint와 분리된 migration·Fedify queue 권한이 구조적 경계를 보완합니다.
Application policy를 우회할 수 있는 경로는 제보 대상이지만 RLS가 없다는 사실만으로는
취약점이 아닙니다.

Semgrep, Trivy, Nuclei와 Dependabot은 검토 신호를 제공하며 안전성을 증명하거나 개별
알림의 자동 제외를 정당화하지 않습니다.
