# Agent Rules & Guide for Universal-Context (UCW)

## 📌 개요 (Overview)
이 문서는 OpenAI Codex, Antigravity, 그리고 기타 모든 Agent가 `extension/` 프로젝트에서 **Universal Context Window (UCW) v3** 스펙에 맞춰 협업하기 위한 규칙(Rules)과 가이드라인(Guide)입니다.
현재 UCW는 `extension/.ucw/` 경로에 설정되어 있습니다.

## 🎯 기본 원칙 (Core Principles)
1. **Markdown-first**: 모든 상태와 조율(coordination) 정보는 Markdown으로 기록합니다.
2. **Attach before bootstrap**: 작업을 시작할 때 무조건 `.ucw/INDEX.md`와 `state/current.md` 등을 확인하고(Attach 모드), 처음부터 새로 덮어쓰지(Bootstrap) 마세요.
3. **Observe before authoring**: 기존 문서(README, git 상태, 파일 변경사항)가 진실의 출처(Source of truth)입니다. 대량 복사하지 말고, `source-map`을 통해 필요한 부분만 인덱싱하세요.
4. **Append-first for coordination**: 병렬 작업 시 동일 파일을 덮어쓰지 말고, `coordination/events/`나 `coordination/channels/`에 이벤트를 추가하여 충돌을 막으세요.

## 🤝 Agent 간 협업 (Coordination) 가이드
- **Agent 등록**: 작업에 참여하는 Agent는 `.ucw/coordination/registry/{agent-id}.md` 에 자신을 등록하고 Subscription, Role 등을 명시해야 합니다.
- **Task Claim / Dependency**: 할 일을 정하면 `.ucw/tasks/`나 `coordination/live-tasks/`에 `claim` 상태를 기록하고, "이 작업이 끝나야 다음 작업을 한다"는 의존성은 `depends_on`, `blocked_by` 필드에 명확히 기록하세요.
- **메시지 교환 (Direct & Broadcast)**:
  - 다른 Agent에게 전달할 사항은 해당 Agent의 Inbox (`coordination/inbox/`)에 작성하세요.
  - 모두에게 알릴 공지/주의사항/막힘(Blocker) 상황은 Shared Channel (`coordination/channels/general/`, `blockers/` 등)에 남기세요.

## 📂 주요 폴더 역할 및 이용
- `.ucw/INDEX.md` & `.ucw/ONTOLOGY.md`: UCW 전체 상태와 객체 관계
- `.ucw/state/current.md`: 현재 가장 중요한 컨텍스트 (실행 전 우선 확인)
- `.ucw/coordination/registry/`: 참여 Agent 정보 (Codex, Antigravity 등)
- `.ucw/coordination/channels/` & `inbox/`: 메세지 채널
- `.ucw/snapshots/`: 특정 시점의 전체 저장소 상태
- `.ucw/tasks/`, `decisions/`, `artifacts/`: 장기 보관해야 할 프로젝트 지식

## 🤖 Antigravity & Codex 행동 수칙
1. **작업 시작 시 (Attach 단계)**:
   - 항상 `.ucw/INDEX.md` 와 최신 `SNAPSHOT-*.md`, `ATTACH-BRIEF-*.md` 를 먼저 읽으십시오.
   - 현재 Repository의 drift 여부를 판단하세요.
2. **작업 중 (Coordination 단계)**:
   - 본인이 수행 중인 Task ID를 `coordination/live-tasks/` 등에 명시하고, 진행 상황 이벤트를 남기세요.
   - Codex에게 작업 바통을 넘기거나 결과 검토를 요청할 때는 `handoffs/` 폴더에 관련 문서를 생성하고, 필요시 `coordination/channels/handoffs/` 에 메세지를 남기세요.
3. **작업 완료 및 정리 (Lifecycle 단계)**:
   - Task가 완료되면 `status: done` 으로 갱신하고, 필요 없는 휘발성 상태/채팅 정보는 GC(Garbage Collection)나 Compaction 정책에 따라 요약 후 `archive/` 혹은 삭제 처리합니다.

이 가이드에 따라 Agent들은 충돌 없이 안전하고 효율적으로 단일 Repository 내 프로젝트를 병렬 전개해야 합니다.
