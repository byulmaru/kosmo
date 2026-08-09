## 1. PROD-737 Post/Post Content RLS base

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/instance.md`
- `docs/domain/policies/post-list.md`
- `memory/database-design.md`
- `memory/database-migrations.md`
- `docs/operations/production-migrations.md`
- `PROD-737`
- `PROD-368`

**Deliverable**

기존 owner workload를 유지하면서 `post`와 `post_content`의 RLS metadata와 후속 policy join/index 기반이 독립
배포 가능한 상태다.

**Guardrails**

- `FORCE ROW LEVEL SECURITY`, policy, grant, actor setting/helper, credential·endpoint·SQL DB handle 전환,
  애플리케이션 predicate 변경을 포함하지 않는다.
- 기존 migration history 파일을 수정·이동하지 않고 row rewrite/backfill을 하지 않는다.
- concrete gap이 증명되지 않은 speculative index와 영구적인 stage-specific migration test를 추가하지 않는다.

**Verification**

- Drizzle schema/snapshot diff와 migration SQL을 확인한다.
- 기존 generic migration replay를 실행한다.
- disposable PostgreSQL에서 owner SELECT/DML, policy 없는 non-owner fail-closed, RLS catalog와 concrete
  join/index execution plan을 일회성으로 확인한다.
- 관련 static check, OpenSpec strict validation과 diff hygiene를 통과한다.

- [x] 1.1 Post와 Post Content schema 선언에 RLS metadata를 반영하고 additive migration/snapshot을 생성한다.
- [x] 1.2 생성된 migration이 두 table RLS 활성화 외 변경을 포함하지 않으며 전체 migration replay가 성공하는지 확인한다.
- [x] 1.3 disposable PostgreSQL에서 owner bypass, non-owner no-policy fail-closed, FORCE/policy 부재와 기존
      Post/Profile/Instance/Follow/PostContent/Repost Source index 경로를 일회성으로 검증한다.
- [x] 1.4 관련 lint/format, OpenSpec strict validation과 `git diff --check`를 통과시키고 변경 scope를 self-review한다.
