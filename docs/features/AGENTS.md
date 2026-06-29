# docs/features 작업 규칙

## 목적

`docs/features`는 DDD를 위한 도메인 정의 문서다. 구현 스펙, 테이블/컬럼 정의, resolver/API 세부,
현재 코드 감사 결과를 중심으로 쓰지 않는다. 도메인 책임, 보편 언어, 상태, 정책, 불변 조건,
컨텍스트 관계를 기준으로 유지한다.

## 반복 플로우

1. 문서에서 미확정, 애매함, 문서 간 불일치, 용어 충돌을 찾는다.
2. 한 번에 너무 많은 결정을 묶지 말고, 결정 가능한 질문 단위로 사용자에게 묻는다. Question tool을
   사용할 수 있으면 우선 사용한다.
3. 질문에는 현재 문서 기준의 선택지와 각 선택지가 바꾸는 도메인 소유권을 함께 적는다.
4. 사용자가 답하면 다음 질문으로 넘어가기 전에 관련 `contexts/` 문서를 수정한다.
5. 같은 답변을 `decisions/`에는 확정 결정으로, `records/`에는 결정 이력으로 남긴다.
6. 결정으로 해결된 미결정 항목은 제거하거나 확정 문장으로 바꾼다. 관련 없는 TODO는 정리하지 않는다.
7. `pnpm lint:prettier`, Markdown 내부 링크 검사, 확정 용어 충돌 검색을 실행한다.
8. 검증이 끝나면 해당 질문 반영분을 커밋하고 현재 이슈 브랜치에 push한다.
9. 여러 질문의 답을 한 메시지에서 받은 경우에도 records에는 질문별 결정을 분리해서 남긴다.
10. push 후 다시 남은 미확정 항목을 찾아 다음 질문 목록을 제시한다.

## 문서 위치

- `contexts/`: bounded context별 도메인 명세. 도메인당 파일 하나를 원칙으로 한다.
- `decisions/`: 확정된 보편 언어, 모델 소유권, 제외 범위 같은 장기 결정을 ADR 형태로 남긴다.
- `records/`: 특정 점검/대화에서 어떤 질문이 닫혔고 무엇이 남았는지 기록한다.

## 반영 기준

- 제외하기로 결정한 도메인은 도메인 지도와 컨텍스트 링크에서 제거하고, 제외 결정은
  `decisions/`와 `records/`에 남긴다.
- Post List에는 전역 기본 정책을 두지 않는다. 답글과 Repost 포함 정책은 Post List Definition별로
  둔다.
- Post Visibility는 Publishing이 소유하는 Post 속성이다. Post Eligibility는 데이터를 가지는 Post
  속성이 아니라 Publishing이 소유하는 후보성 정책이다.
- Account가 주체인 행동은 인증, 보안, Profile Owner/Member 권한, 운영자 권한에 한정한다. 기본 소셜
  행동 주체는 Profile이다.
- Messaging은 현재 도메인 범위에서 제외한다.
- Collection은 현재 Engagement 범위에서 제외한다.

## 검증 명령

```sh
pnpm lint:prettier
node -e 'const fs=require("fs"),path=require("path"); const files=[]; function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(p.endsWith(".md")) files.push(p)}} walk("docs/features"); let bad=[]; for(const f of files){const s=fs.readFileSync(f,"utf8"); const re=/\[[^\]]*\]\(([^)]+)\)/g; let m; while((m=re.exec(s))){const href=m[1]; if(/^(https?:|mailto:|#)/.test(href)) continue; const target=href.split("#")[0]; if(!target) continue; const resolved=path.resolve(path.dirname(f), target); if(!fs.existsSync(resolved)) bad.push(`${f}: ${href}`); }} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log(`checked ${files.length} markdown files`);'
node -e 'const fs=require("fs"),path=require("path"); const pattern=/사용자|User|Actor|actor|Share|share|Timeline|타임라인|비공개 게시|private 게시|공유|share\/repost|repost|\bprofile\b|\baccount\b|\bpost\b|Antenna|Keyword Feed|키워드 수집 피드/; const files=[]; function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(p.endsWith(".md") && path.basename(p)!=="AGENTS.md") files.push(p)}} walk("docs/features"); const bad=[]; for(const f of files){const raw=fs.readFileSync(f,"utf8"); const text=raw.replace(/\[([^\]]*)\]\([^)]+\)/g,"$1"); text.split(/\n/).forEach((line,i)=>{if(pattern.test(line)) bad.push(`${f}:${i+1}: ${line}`)})} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("no canonical term conflicts found");'
```
