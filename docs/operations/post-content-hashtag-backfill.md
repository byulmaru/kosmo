# 로컬 게시물 Hashtag 재처리

이 절차는 저장된 내용에서 기존 활성 Local Post의 현재 Post Content revision을 재처리해 본문 Hashtag를
보완한다. 원본 revision은 유지하고 새 revision을 현재 값으로 전환한다. Remote source를 fetch하지 않는다.
재처리는 ActivityPub delivery나 notification을 발생시키지 않으며, 이후 Local ActivityPub Note 조회는 현재
revision을 사용한다.

`reprocessLocalPostContentWorkflow`는 한 Post를 처리한다. `backfillLocalPostContentHashtagsWorkflow`는 대상 ID를
선택하고 페이지당 최대 50개를 순차 처리한 뒤 Temporal Continue-As-New로 이어간다. Batch는 첫 페이지에서 확인한
최대 eligible Local Post ID를 끝점으로 고정한다.

## 사전 확인

1. 실행할 Temporal namespace를 확인한다. 해당 namespace에서 최신 Worker가 `kosmo` task queue를 polling하고
   위 두 Workflow type을 등록했는지 확인한다.
2. 단일 Post를 재처리할 때는 변경 권한이 없는 read-only DB 연결로 대상 Post와 현재 Post Content ID만 확인한다.
   SQL의 `$1`에는 대상 Post UUID를 bound parameter로 전달한다. 본문 document나 Hashtag 이름을 조회·복사·로그하지 않는다.

   ```sql
   SELECT p.id AS "postId", current_content.id AS "postContentId"
   FROM post AS p
   JOIN profile AS owner ON owner.id = p.profile_id
   JOIN instance AS i ON i.id = owner.instance_id
   JOIN post_content AS current_content
     ON current_content.id = p.current_content_id
    AND current_content.post_id = p.id
   WHERE p.id = $1::uuid
     AND p.state = 'ACTIVE'
     AND p.current_content_id IS NOT NULL
     AND i.kind = 'LOCAL';
   ```

   한 행이 반환되지 않으면 해당 입력으로 시작하지 않는다. 실행 중 current Post Content가 바뀌면 재처리는
   이전 revision을 덮어쓰지 않으므로, 새 current ID를 다시 확인한 뒤 재시도한다.

3. Batch 범위를 먼저 확인하려면 dry-run을 실행한다. Batch가 내부에서 high-water Post ID를 정하므로 전체 Post ID
   목록을 추출할 필요가 없다.

## Dry-run

`dryRun` 생략 또는 `true`가 기본값이며 database state를 바꾸지 않는다.

단일 Post:

```sh
temporal workflow start \
  --type reprocessLocalPostContentWorkflow \
  --task-queue kosmo \
  --input '{"postId":"<post-uuid>","postContentId":"<current-post-content-uuid>"}'
```

모든 eligible Local Post를 순차 처리하는 Batch:

```sh
temporal workflow start \
  --type backfillLocalPostContentHashtagsWorkflow \
  --task-queue kosmo \
  --input '{"dryRun":true}'
```

CLI가 반환한 Workflow ID로 결과를 확인한다. `--workflow-id`를 생략하면 Temporal Service가 unique ID를 만든다.

```sh
temporal workflow result --workflow-id YourWorkflowId
```

`YourWorkflowId`를 `start` 명령이 반환한 Workflow ID로 바꾼다.

Dry-run에서 변경 후보는 `wouldUpdate`, 이미 완료·정합된 current content는 `unchanged`, 처리하지 않은 Post는
`skipped`로 집계된다. 일부 Hashtag node나 관계가 빠지거나 어긋난 Post는 재처리 후보로 남는다. Batch 결과에는
per-Activity 상태 집계와 frozen maximum Post ID가 포함된다. 집계는 실행 결과를 요약하며 감사 원장으로 사용하지
않는다. Workflow가 완료되기 전에는 Batch를 다시 시작하지 않는다.

## 적용

Dry-run 결과와 대상 namespace를 검토한 다음, 같은 입력에 `dryRun:false`를 명시해 실행한다.

단일 Post:

```sh
temporal workflow start \
  --type reprocessLocalPostContentWorkflow \
  --task-queue kosmo \
  --input '{"postId":"<post-uuid>","postContentId":"<current-post-content-uuid>","dryRun":false}'
```

Batch:

```sh
temporal workflow start \
  --type backfillLocalPostContentHashtagsWorkflow \
  --task-queue kosmo \
  --input '{"dryRun":false}'
```

Apply 결과는 `updated`, `unchanged`, `skipped` 상태별로 확인한다. 새 revision의 `post_content.created_at`은
재처리 시각이며 source revision은 삭제하지 않으므로 저장 공간이 늘어난다. Post의 `post.created_at`, author,
visibility와 관계는 변경되지 않는다. Hashtag-only revision은 알림을 만들거나 ActivityPub `Update(Note)`를
전송하지 않는다.

## 재시도와 종료 확인

Temporal Activity retry와 Batch Continue-As-New가 처리 재개를 맡는다. Workflow가 실패 상태로 끝나면 Temporal Web의
해당 Workflow history에서 실패한 Activity와 원인을 확인한 뒤 복구한다. Batch를 다시 시작하면 처음부터 현재
high-water mark까지 다시 살피며, Hashtag node와 관계가 모두 정합된 current content만 `unchanged`가 된다.
부분 변환이나 관계 누락·불일치는 다시 처리한다. `wouldUpdate`는 dry-run의 변경 후보를 나타낸다. 상태별 집계는
Workflow가 관찰한 Activity 결과의 요약이지 transaction commit 수를 증명하는 감사 기록은 아니다.

Apply Batch가 완료되면 동일한 Batch dry-run을 다시 실행한다. `wouldUpdate: 0`이면 그 실행 시점에 추가할 Hashtag
node나 관계가 없는 것이다. `skipped`가 남으면 Temporal Web history의 해당 Activity input에 있는 Post ID와 Post
Content ID를 확인하고 위의 ID-only query로 현재 값과 eligibility를 다시 검사한다. 본문 document는 조회하지 않는다.

Workflow input과 운영 기록에는 Post ID, Post Content ID, frozen maximum Post ID와 상태 집계만 사용한다. 본문,
Mention 표시 문자열 또는 Hashtag 이름을 Workflow input, 운영 메모나 로그에 넣지 않는다.
