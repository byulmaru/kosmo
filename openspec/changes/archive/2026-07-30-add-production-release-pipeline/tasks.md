## 1. PROD-563 Tag build identity

**Authority / Provenance**

- PROD-563

**Deliverable**

모든 Git tag가 이름 제한 없이 production image를 build하고 그 run의 digest를 확정한다.

**Guardrails**

- Branch build는 production deploy를 시작하지 않는다.
- Tag 문자열을 Kubernetes label이나 container identity로 직접 사용하지 않는다.
- GitHub Release, asset 또는 mutable registry tag를 중간 identity source로 추가하지 않는다.

**Verification**

- 임의 tag trigger, branch 제외, build digest output과 tag metadata를 정적으로 검증한다.

- [x] 1.1 Docker Build의 tag trigger와 ref validation에서 SemVer 제한을 제거한다.
- [x] 1.2 Tag image metadata를 일반 tag ref로 만들고 build digest output을 보존한다.
- [x] 1.3 `stable`을 ECR lifecycle 보존 표식으로 유지하되 deploy identity에는 사용하지 않는다.

## 2. PROD-563 Production approval and sync

**Authority / Provenance**

- PROD-563

**Deliverable**

Tag build가 만든 digest를 같은 workflow의 production 승인 job이 PreSync migration과 API·Web에 배포한다.

**Guardrails**

- `prod` Environment 승인 전 Argo CD credential을 얻거나 상태를 변경하지 않는다.
- Migration, API와 Web은 같은 build digest를 사용한다.
- Pipeline은 Rollout preview·promotion·ReplicaSet recovery를 직접 조정하지 않는다.
- 실행 중 배포는 취소하지 않고 최신 pending tag가 이전 pending tag를 대체한다.
- PROD-562 runtime과 PROD-564 migration credential·Job command를 구현하지 않는다.

**Verification**

- Tag-only deploy 조건, build dependency, Environment, OIDC와 Argo CD sync 순서를 확인한다.
- 동일 digest render, PreSync Job 하나와 controller 기본 activation을 확인한다.

- [x] 2.1 Production deploy를 Docker Build workflow의 tag-only `prod` Environment job으로 이동한다.
- [x] 2.2 Build digest를 Helm parameter로 전달하고 동일-image PreSync manifest 확인 뒤 Argo CD sync를 실행한다.
- [x] 2.3 Production Rollout controller 기본 activation과 custom recovery 부재를 검증한다.
- [x] 2.4 `prod` Environment의 main-only policy를 제거하고 tag-only 조건은 workflow 한 곳에 둔다.
- [x] 2.5 고정 concurrency group이 실행 중 배포와 최신 pending tag만 유지하는 계약을 검증한다.

## 3. PROD-563 Obsolete release path removal and verification

**Authority / Provenance**

- PROD-563

**Deliverable**

GitHub Release와 별도 deploy lifecycle을 제거하고 tag workflow 하나만 남긴다.

**Guardrails**

- 별도 publish, resolve 또는 rollback command를 만들지 않는다.
- 이전 application 재배포는 pipeline 도입 이후 실제 production에 배포된 호환 가능한 이전 release commit에 새 tag를 붙이는 같은 경로를 사용한다.
- DB rollback, actual production run과 public smoke는 포함하지 않는다.

**Verification**

- Release API·script·workflow 참조가 남지 않았는지 확인한다.
- Workflow actionlint, Helm render, format과 OpenSpec strict validation을 통과시킨다.

- [x] 3.1 `publish_release`, GitHub Release publish/resolve script와 별도 production deploy workflow를 제거한다.
- [x] 3.2 삭제한 release script 전용 test 대신 workflow·Helm·GitHub bootstrap을 각 표준 validator와 정적 검증으로 확인한다.
- [x] 3.3 관련 검증을 통과시키고 main spec을 동기화해 change를 archive한다.
