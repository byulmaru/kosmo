# Local Post 콘텐츠 재처리 운영

이 절차는 기존 활성 Local Post의 현재 Post Content revision에 저장 document 기반 콘텐츠 처리 규칙을 적용한다.
현재 구현은 본문 Hashtag를 발견하고 Hashtag 관계를 정합화한다. 원문 입력을 따로 저장하지 않으므로 재처리는 전체
작성 parser를 다시 실행하지 않으며 Mention을 재발견·resolve하거나 Remote source를 가져오지 않는다. 원본 revision은
유지하고 처리 결과나 관계가 바뀔 때만 새 revision을 current로 전환한다. 재처리는 ActivityPub `Update(Note)` delivery나
notification을 발생시키지 않으며, 이후 Local ActivityPub Note 조회는 current revision을 사용한다.

`reprocessLocalPostContentsWorkflow` 하나로 대상을 재처리한다. 필수 `targets` 배열에는 `{ postId, postContentId }`
쌍을 넣는다. 한 쌍은 Post 하나, 여러 쌍은 지정한 Post들이며, 빈 배열은 no-op이다. Workflow는 전달된 쌍만
처리하고 Post를 검색하거나 추가하지 않는다.

대상은 최대 50개씩 순차 처리한다. Continue-As-New는 남은 target 쌍과 누적 `counts`를 이어받는다. Workflow 결과에는
`counts`만 포함한다.

## 사전 확인

1. 실행할 Temporal namespace를 확인한다. 해당 namespace에서 최신 Worker가 `kosmo` task queue를 polling하고
   `reprocessLocalPostContentsWorkflow`를 등록했는지 확인한다.
2. 선택 대상 목록을 만들 때는 변경 권한이 없는 read-only DB 연결로 각 Post의 현재 Post Content ID만 확인한다.
   SQL의 `$1`에는 해당 Post UUID를 bound parameter로 전달한다. 본문 document나 사용자 콘텐츠 값을 조회·복사·로그하지 않는다.

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

   한 행이 반환된 Post만 선택 목록에 추가한다. 조회와 실행 사이에 current Post Content가 바뀌어도 재처리는
   다른 revision을 덮어쓰지 않는다. 해당 입력이 `skipped`되면 current ID를 다시 조회한 뒤 새 대상 목록을 만든다.

## Dry-run

`dryRun` 생략 또는 `true`가 기본값이며 database state를 바꾸지 않는다. `targets`는 반드시 지정한다.

```sh
temporal workflow start \
  --type reprocessLocalPostContentsWorkflow \
  --task-queue kosmo \
  --input '{"targets":[{"postId":"<post-uuid>","postContentId":"<current-post-content-uuid>"}],"dryRun":true}'
```

대상을 더 지정하려면 `targets` 배열에 Post ID와 현재 Post Content ID 쌍을 추가한다. 빈 배열은 no-op이다. CLI가
반환한 Workflow ID로 결과를 확인한다. `--workflow-id`를 생략하면 Temporal Service가 unique ID를 만든다.

```sh
temporal workflow result --workflow-id YourWorkflowId
```

`YourWorkflowId`를 `start` 명령이 반환한 Workflow ID로 바꾼다.

Dry-run 결과의 `counts`는 처리 결과나 관계에 차이가 있는 Post를 `wouldUpdate`, 이미 반영된 Post를 `unchanged`, 더
이상 처리할 수 없는 Post를 `skipped`로 집계한다. 집계는 실행 결과를 요약하며 감사 원장으로 사용하지 않는다.
Workflow가 완료되기 전에는 같은 입력을 다시 시작하지 않는다.

## 적용

Dry-run 결과와 대상 namespace를 검토한 다음, 같은 `targets` 배열을 사용하고 `dryRun:false`로 실행한다.

```sh
temporal workflow start \
  --type reprocessLocalPostContentsWorkflow \
  --task-queue kosmo \
  --input '{"targets":[{"postId":"<post-uuid>","postContentId":"<current-post-content-uuid>"}],"dryRun":false}'
```

여러 Post를 지정할 때는 dry-run에 전달한 각 ID 쌍을 그대로 배열에 넣는다. 이미 current Post Content가 바뀌어
`skipped`된 Post는 현재 ID를 다시 확인해 새 대상 쌍을 만든다.

Apply 결과는 `updated`, `unchanged`, `skipped` 상태별로 확인한다. 새 revision의 `post_content.created_at`은
재처리 시각이며 source revision은 삭제하지 않으므로 저장 공간이 늘어난다. Post의 `post.created_at`, author,
visibility와 콘텐츠 처리 대상이 아닌 관계는 변경되지 않는다.

## 재시도와 종료 확인

Temporal Activity retry와 Continue-As-New가 처리 재개를 맡는다. Workflow가 실패 상태로 끝나면 Temporal Web의
해당 Workflow history에서 실패한 Activity와 원인을 확인한 뒤 복구한다. Continue-As-New는 남은 target 쌍과 누적
`counts`를 이어받는다. 다시 시작할 때는 각 대상의 최신 current Post Content ID를 조회해 필요한 대상 쌍을 갱신한다.
처리 결과와 관계가 이미 반영된 current content는 `unchanged`가 되고, document 변환이나 관계 반영이 다르면 다시
처리한다. 상태별 집계는 Workflow가 관찰한 Activity 결과의 요약이지 transaction commit 수를 증명하는 감사 기록은 아니다.

Apply가 완료되면 dry-run으로 결과를 다시 확인한다. `counts.wouldUpdate`가 `0`이면 그 실행 시점에 처리할 document나
관계의 차이가 없는 것이다. 위 ID-only query로 current ID를 다시 확인한 뒤 최신 쌍을 전달한다. `skipped`가 남으면
Temporal Web history의 해당 Activity input에
있는 Post ID와 Post Content ID를 확인하고 위 query로 현재 값과 eligibility를 다시 검사한다. 본문 document는 조회하지 않는다.

Workflow input과 운영 기록에는 Post ID, Post Content ID와 `counts`만 사용한다. 본문,
Mention 표시 문자열, Hashtag 이름 등 사용자 콘텐츠를 Workflow input, 운영 메모나 로그에 넣지 않는다.
