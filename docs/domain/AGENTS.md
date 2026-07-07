# docs/domain 작업 규칙

## 목적

`docs/domain`은 Kosmo의 도메인 원천 문서다. 구현 스펙, 테이블/컬럼 정의, resolver/API 세부, 현재 코드
감사 결과를 중심으로 쓰지 않는다. 객체, 상태, 속성, 관계, 행동, 권한, 불변 조건을 기준으로 유지한다.

OpenSpec은 이 문서를 참조하는 downstream 구현 스펙이다. OpenSpec에만 있는 타입, nullable, 검증 값은
도메인 결정으로 자동 승격하지 않는다.

## 문서 위치

- `objects/`: durable 객체별 도메인 문서. 상태, 행동, 권한을 소유하는 객체만 파일로 둔다.
- `decisions/`: 확정된 보편 언어, 모델 소유권, 제외 범위 같은 장기 결정을 ADR 형태로 남긴다.
- `records/`: 특정 점검/대화에서 어떤 질문이 닫혔고 무엇이 남았는지 기록한다.

`records/`는 현재 canonical 명세가 아니라 이력 보존 문서다. 과거 record의 용어, 질문, 미정 표현,
당시 결정 문장이 최신 `objects/` 또는 ADR과 다르다는 이유만으로 수정하지 않는다. 정합성 검수와 수정은
현재 명세인 `objects/`, `decisions/`, `README.md`, `AGENTS.md`를 대상으로 하고, `records/`는 결정
경위와 근거를 확인하는 참고 자료로만 사용한다.

## 객체 문서 형식

각 객체 문서는 다음 섹션을 가진다.

- 정의: 객체가 대표하는 도메인 개념과 책임.
- 상태: 객체가 가진 상태 차원과 상태 값. 상태 차원은 enum type처럼, 값은 enum value처럼 명명한다.
- 속성: 객체가 가진 스칼라 값. 타입, nullable 여부, 검증 정책, 상태별 존재 조건, 조회 권한을 기록한다.
- 관계: 다른 객체와의 연결. 방향, cardinality, 존재 조건, 조회 권한을 기록한다.
- 행동: 객체의 상태, 속성, 관계 또는 객체 자체를 바꾸는 mutation. 행동 주체, 대상 객체, 입력값, 권한,
  조건, 변경 결과를 기록한다.
- 권한: 이 객체가 소유한 조회/행동 조건. 권한 이름은 ACL action이 아니라 주체/대상/관계/상태 조건을
  표현한다.
- 불변 조건: 항상 유지되어야 하는 규칙.
- 확정 용어: 한국어 표현과 canonical domain term.
- 제외/보류: 현재 도메인 범위에서 제외하거나 별도 스펙으로 분리한 항목.

## 반영 기준

- 행동은 주로 변경되는 객체 문서에 둔다. 예를 들어 Follow Relationship 생성/언팔로우는
  `objects/follow-relationship.md`, Follow Request 생성/승인/거절은 `objects/follow-request.md`, Post
  작성/삭제/답글은 `objects/post.md`에 둔다.
- 값 객체와 정책 값은 소유 객체 문서 안에 둔다. `Post Visibility`는 `objects/post.md`에 둔다.
- 권한 정의는 권한을 소유하는 객체 문서의 `권한` 섹션에 둔다. 다른 객체 문서는 필요한 권한 이름만
  참조한다.
- 제외하기로 결정한 도메인은 객체 인덱스에서 제거하고, 제외 결정은 `decisions/`와 `records/`에 남긴다.
- Post Visibility는 Post 속성이다. Post Eligibility는 데이터를 가지는 Post 속성이 아니라 Post가 소유한
  후보성 정책이다.
- Account가 주체인 행동은 인증, Profile Owner/Member 권한, 운영자 권한에 한정한다. 기본 소셜
  행동 주체는 Profile이다.
- Messaging은 현재 도메인 범위에서 제외한다.
- Collection은 현재 Engagement 범위에서 제외한다.
- `유용하다`, `편리하다`, `빠르다`, `예측 가능하다` 같은 평가 문장은 도메인 규칙이 아니다. 필요한
  경우 책임, 정책, 상태, 불변 조건 문장으로 바꾼다.

## 검증 명령

```sh
pnpm lint:prettier
node -e 'const fs=require("fs"),path=require("path"); const files=[]; function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(p.endsWith(".md")) files.push(p)}} walk("docs/domain"); const slug=s=>s.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu,"").replace(/\s+/g,"-"); const anchors=new Map(files.map(f=>[path.resolve(f),new Set(fs.readFileSync(f,"utf8").split(/\n/).filter(l=>/^#{1,6}\s+/.test(l)).map(l=>slug(l.replace(/^#{1,6}\s+/,""))))])); let bad=[]; for(const f of files){const s=fs.readFileSync(f,"utf8"); const re=/\[[^\]]*\]\(([^)]+)\)/g; let m; while((m=re.exec(s))){const href=m[1]; if(/^(https?:|mailto:)/.test(href)) continue; const [target,hash]=href.split("#"); const resolved=target?path.resolve(path.dirname(f),target):path.resolve(f); if(target&&!fs.existsSync(resolved)) bad.push(`${f}: ${href}`); else if(hash&&anchors.has(resolved)&&!anchors.get(resolved).has(hash)) bad.push(`${f}: ${href}`); }} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log(`checked ${files.length} markdown links`);'
node -e 'const fs=require("fs"),path=require("path"); const pattern=/사용자|User|Actor|actor|Share|share|Timeline|타임라인|비공개 게시|private 게시|공유|share\/repost|repost|\bprofile\b|\baccount\b|\bpost\b|Antenna|Keyword Feed|키워드 수집 피드/; const files=[]; function collect(p){const st=fs.statSync(p); if(st.isDirectory()){for(const e of fs.readdirSync(p,{withFileTypes:true})){collect(path.join(p,e.name))}} else if(p.endsWith(".md")) files.push(p)} ["docs/domain/README.md","docs/domain/objects","docs/domain/decisions"].forEach(collect); const bad=[]; for(const f of files){const raw=fs.readFileSync(f,"utf8"); const text=raw.replace(/\[([^\]]*)\]\([^)]+\)/g,"$1"); text.split(/\n/).forEach((line,i)=>{if(pattern.test(line)) bad.push(`${f}:${i+1}: ${line}`)})} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("no canonical term conflicts found");'
node -e 'const fs=require("fs"),path=require("path"); const files=fs.readdirSync("docs/domain/objects").filter(f=>f.endsWith(".md")).map(f=>path.join("docs/domain/objects",f)); const defs=new Set(); const refs=new Map(); for(const f of files){const s=fs.readFileSync(f,"utf8"); for(const m of s.matchAll(/^\|\s*`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`\s*\|/gm)) defs.add(m[1]); for(const m of s.matchAll(/`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`/g)){if(!refs.has(m[1])) refs.set(m[1],[]); refs.get(m[1]).push(f)}} const missing=[...refs.keys()].filter(x=>!defs.has(x)).sort(); if(missing.length){console.error("missing permission definitions:\n"+missing.map(x=>x+" <- "+[...new Set(refs.get(x))].join(", ")).join("\n")); process.exit(1)} console.log("all object permission refs are defined in object docs");'
node -e 'const fs=require("fs"),path=require("path"); const banned=/\.(Read|Create|Manage|Delete|Remove|Upload|Attach|Use|Generate|Mark|Moderate)(Own|Incoming|Accessible|Profile|Variant|Read)?\b/; const bad=[]; function walk(p){const st=fs.statSync(p); if(st.isDirectory()) for(const e of fs.readdirSync(p)) walk(path.join(p,e)); else if(p.endsWith(".md")){const s=fs.readFileSync(p,"utf8"); for(const m of s.matchAll(/`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`/g)){if(banned.test(m[1])) bad.push(`${p}: ${m[1]}`)}}} walk("docs/domain/objects"); if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("no action-style permission names found");'
node -e 'const fs=require("fs"),path=require("path"); const bad=[]; for(const f of fs.readdirSync("docs/domain/objects").filter(x=>x.endsWith(".md"))){const p=path.join("docs/domain/objects",f); const s=fs.readFileSync(p,"utf8"); const m=s.match(/## 상태\n([\s\S]*?)(?=\n## )/); if(!m) continue; m[1].split(/\n/).forEach((line,i)=>{if(/현재 상태|다음 상태|Post Eligibility|Muted Thread|요청 취소|언팔로우|전이|정책 단위/.test(line)) bad.push(`${p}:${i+1}: ${line}`)})} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("state sections contain only state definitions");'
! rg -ni "c[o]ntext|컨텍[스]트|bounded c[o]ntex[t]|c[o]ntext[s]/" docs/domain/README.md docs/domain/AGENTS.md docs/domain/objects docs/domain/decisions
! rg -n "docs/f[e]ature[s]|c[o]ntext[s]/" . --glob '!docs/domain/records/**' --glob '!node_modules/**' --glob '!**/.git/**'
```
