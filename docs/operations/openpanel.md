# OpenPanel 제품 분석 운영

Kosmo Web은 공개 build 변수 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`가 있을 때만 self-hosted OpenPanel을 사용한다. Dashboard는 `https://openpanel.byulmaru.co`, Web SDK ingest base URL은 `https://openpanel.byulmaru.co/api`다. Android·iOS에는 현재 client를 만들지 않는다.

## Production 설정

1. OpenPanel에서 Kosmo production project와 Web write client를 만든다.
2. 허용 origin을 Kosmo production Web origin으로 제한한다.
3. GitHub repository variable `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`에 공개 client ID를 저장한다. client secret이나 root/read credential은 build에 넣지 않는다.
4. 정식 SemVer tag build만 이 값을 Docker build arg로 전달한다. branch와 local build에는 기본 주입하지 않는다.
5. Client ID를 회전하면 repository variable을 바꾸고 새 SemVer image를 발행한다.

Client ID가 없는 build에서는 SDK client, browser listener와 분석 요청이 모두 없어야 한다. Local에서 명시적으로 값을 주입하면 같은 production OpenPanel project에 전송되므로 실제 테스트 계정과 event를 사용하고 검증 뒤 제거한다.

## 수집 계약

- 자동 수집: screen view의 전체 URL·query·title·referrer, 외부 링크 URL·표시 텍스트, `data-track` attribute event
- identity: 로그인 전 anonymous device/session, 로그인 후 opaque Account ID. 이름·이메일·handle trait는 보내지 않는다.
- 명시적 event: `login_succeeded`, `profile_created`, `profile_selected`, `post_created`, `follow_succeeded`, `search_submitted`, `search_results_loaded`, `search_result_selected`
- replay: 10% sample, `maskAllInputs: true`, 모든 canonical Post Content root에 `[data-openpanel-replay-mask]`
- 보유: 일반 event는 분석 목적 달성, project 삭제, Account 삭제 또는 이용자 요청 중 먼저 도달한 때까지다. Replay chunk는 OpenPanel ClickHouse TTL에 따라 30일 뒤 삭제된다.

## 배포 후 acceptance

각 release에서 아래를 production browser와 Dashboard로 확인한다. 실제 Account ID나 사용자 콘텐츠를 증거 문서에 복사하지 않는다.

1. Client ID가 없는 local build의 Network panel에 `/api/track` 요청이 없음을 확인한다.
2. production landing을 비로그인으로 열어 `screen_view`와 anonymous profile/session을 확인한다.
3. 외부 링크를 열어 `link_out`의 `href`와 `text`를 확인한다.
4. 로그인해 같은 browser session이 opaque Account ID로 identify되고 `login_succeeded`가 한 번만 기록되는지 확인한다.
5. Profile 생성·선택, Post 작성, Follow를 각각 성공시켜 대응 event와 허용된 enum/ID 속성만 확인한다. 실패 요청에는 성공 event가 없어야 한다.
6. 검색 직접 입력, 최근 검색, tab 변경, People 첫 결과와 결과 선택을 확인한다. 명시적 event property에 검색 원문과 대상 Profile ID가 없어야 한다.
7. replay 표본 session에서 input·textarea 값과 게시글 본문이 별표로 가려지고 표시명·handle과 화면 동작은 보이는지 확인한다.
8. OpenPanel endpoint를 browser에서 차단한 상태로 로그인·navigation·mutation·검색이 동일하게 완료되는지 확인한다.
9. 로그아웃 후 새 event가 이전 Account ID가 아닌 anonymous identity로 기록되는지 확인한다.
10. `/privacy`가 비로그인으로 열리고 landing과 로그인 후 menu에서 연결되는지 확인한다.

## Account별 열람·삭제 요청

현재 OpenPanel에는 Kosmo Account 삭제와 연결된 공개 profile deletion API가 없으므로 PROD-538 전까지 관리자가 다음 절차를 수행한다. 삭제는 복구하기 어려운 production 변경이다. 요청자 본인 확인, 정확한 Kosmo Account ID와 OpenPanel project ID, 대상 count의 2인 검토가 끝나기 전에는 삭제문을 실행하지 않는다.

### 1. 요청과 대상 확정

1. 요청 ticket에 본인 확인 결과, Kosmo Account ID, 접수일, 처리 기한과 담당자를 기록한다.
2. OpenPanel Dashboard의 Kosmo production project에서 Account ID profile을 조회한다.
3. 아래 조회의 `project_id`, `account_id`는 shell interpolation이 아닌 ClickHouse query parameter로 전달한다. 결과에는 event 이름과 count만 남기고 URL, property, replay payload는 ticket에 복사하지 않는다.

```sql
SELECT 'profiles' AS source, count() AS rows
FROM profiles FINAL
WHERE project_id = {project_id:String} AND id = {account_id:String}
UNION ALL
SELECT 'sessions', count()
FROM sessions FINAL
WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
UNION ALL
SELECT 'events', count()
FROM events
WHERE project_id = {project_id:String}
  AND (
    profile_id = {account_id:String}
    OR session_id IN (
      SELECT id FROM sessions FINAL
      WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
    )
  )
UNION ALL
SELECT 'cohort_events_mv', count()
FROM cohort_events_mv
WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
UNION ALL
SELECT 'cohort_members', count()
FROM cohort_members
WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
UNION ALL
SELECT 'profile_event_summary_mv', count()
FROM profile_event_summary_mv
WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
UNION ALL
SELECT 'profile_event_property_summary_mv', count()
FROM profile_event_property_summary_mv
WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
UNION ALL
SELECT 'replay_chunks', count()
FROM session_replay_chunks
WHERE project_id = {project_id:String}
  AND session_id IN (
    SELECT id FROM sessions FINAL
    WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
  );
```

Account ID가 직접 연결된 event와 해당 Account session에서 로그인 전에 생성된 anonymous event를 함께 범위로 잡는다. 같은 기기의 다른 session은 삭제하지 않는다.

### 2. 삭제

1. 배포 중 ingest가 대상 Account에 새 event를 만들지 않도록 먼저 Kosmo 계정 삭제 또는 session 철회를 완료한다.
2. 현재 배포된 OpenPanel version의 `packages/db/src/clickhouse/client.ts`와 code migration에서 아래 table·column이 그대로인지 확인한다. `system.columns`에서도 `profile_id` column을 가진 table을 조회해 Account별 파생·cache table이 목록에서 빠지지 않았는지 대조한다. schema가 다르면 실행을 중단하고 runbook을 먼저 갱신한다.

   ```sql
   SELECT table
   FROM system.columns
   WHERE database = currentDatabase() AND name = 'profile_id'
   ORDER BY table;
   ```

3. ClickHouse backup 또는 복구 지점을 확인하고 maintenance 작업으로 승인받는다.
4. replay와 event처럼 session scope를 참조하는 table부터 삭제하고, session과 profile은 마지막에 삭제한다. Self-hosted 기본 table 이름은 아래와 같다. Clustered 배포라면 현재 OpenPanel의 `getReplicatedTableName()` 결과를 사용한다.

```sql
SET lightweight_deletes_sync = 2;
SET mutations_sync = 2;

DELETE FROM session_replay_chunks
WHERE project_id = {project_id:String}
  AND session_id IN (
    SELECT id FROM sessions FINAL
    WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
  );

DELETE FROM events
WHERE project_id = {project_id:String}
  AND (
    profile_id = {account_id:String}
    OR session_id IN (
      SELECT id FROM sessions FINAL
      WHERE project_id = {project_id:String} AND profile_id = {account_id:String}
    )
  );

ALTER TABLE cohort_events_mv
  DELETE WHERE project_id = {project_id:String} AND profile_id = {account_id:String};

DELETE FROM cohort_members
WHERE project_id = {project_id:String} AND profile_id = {account_id:String};

ALTER TABLE profile_event_summary_mv
  DELETE WHERE project_id = {project_id:String} AND profile_id = {account_id:String};
ALTER TABLE profile_event_property_summary_mv
  DELETE WHERE project_id = {project_id:String} AND profile_id = {account_id:String};

DELETE FROM sessions
WHERE project_id = {project_id:String} AND profile_id = {account_id:String};
DELETE FROM profiles
WHERE project_id = {project_id:String} AND id = {account_id:String};
```

각 문장이 성공했는지 확인한 뒤 다음 문장으로 진행한다. 일부만 실패하면 재실행 전에 동일 dry-run으로 잔존 범위를 다시 계산한다. Project 전체 삭제 기능을 Account 삭제에 사용하지 않는다.

### 3. 검증과 완료

1. 1절의 조회를 다시 실행해 모든 count가 0인지 확인한다.
2. Dashboard의 profile 직접 URL과 profile/session API가 더 이상 대상 Account를 반환하지 않는지 확인한다.
3. background mutation이 완료됐는지 `system.mutations`를 확인한다.
4. 처리일, 실행자·검토자, 삭제 전후 count와 검증 결과만 ticket에 기록한다. query 결과 원문이나 replay를 첨부하지 않는다.
5. 일부 보존이 법령상 필요한 경우 삭제 대상과 분리하고 근거·보유 기한을 요청자에게 알린다.

## 비활성화와 rollback

긴급 중단은 GitHub repository variable을 제거한 뒤 새 production image를 발행한다. 이미 배포된 정적 bundle의 Client ID는 runtime 환경 변수 변경만으로 제거되지 않는다. OpenPanel 장애 시 Kosmo 기능은 계속 동작해야 하며, client secret 또는 관리자 credential을 browser에 넣어 우회하지 않는다.
