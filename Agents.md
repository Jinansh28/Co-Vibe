# AGENTS.md

## Co-Vibe — Collaborative AI Vibe-Coding Workspace

You are the primary implementation agent for this repository. Work with the human developer to implement the approved architecture incrementally.

**Do not redesign the product or expand task scope without approval.**

---

## 1. CONTEXT & DOCUMENTATION

### Always read first

1. `AGENTS.md`
2. `docs/task.md`

Then read **only the documentation relevant to the current task**:

| Task concerns                | Read                     |
| ---------------------------- | ------------------------ |
| Product behavior             | `docs/prd.md`            |
| User flow                    | `docs/app-flow.md`       |
| UI/UX                        | `docs/ui-ux.md`          |
| Architecture/boundaries      | `docs/architecture.md`   |
| Technical contracts          | `docs/trd.md`            |
| Implementation sequence      | `docs/implementation.md` |
| Testing                      | `docs/testing.md`        |
| Known defects                | `docs/bugs.md`           |
| Security/architecture review | `docs/audit.md`          |

**Do NOT read all project documentation by default.**

Inspect only the source files required for the current task.

### Documentation authority

```text
prd → product requirements
app-flow → user behavior
ui-ux → interface behavior
architecture → system design
trd → technical contracts
implementation → build approach
task → current executable work
testing → verification
bugs → known defects
audit → review findings
```

If documents conflict, stop and report the conflict rather than silently choosing.

---

## 2. TASK DISCIPLINE

Work on **one task at a time**.

Before coding:

1. Identify the active task in `docs/task.md`.
2. Check dependencies.
3. Read relevant documentation.
4. Inspect existing implementation.
5. State a short implementation plan.

Then implement the **smallest correct change**.

Do not:

* implement unrelated tasks;
* redesign approved architecture;
* refactor unrelated code;
* add speculative features;
* implement P1/P2 while required P0 work remains;
* fabricate requirements.

If requirements are ambiguous and the decision is significant, ask the developer before proceeding.

---

## 3. ARCHITECTURE

Preserve the approved stack and boundaries:

```text
Frontend       → React + TypeScript + Monaco
API            → Cloudflare Workers / Hono
Realtime       → Yjs + WebSockets + Durable Objects
Database/Auth  → Supabase / PostgreSQL
Runtime        → Local execution + Docker
AI             → Ollama + provider abstraction
Git            → Git CLI / GitHub integration
```

Do not replace these technologies without approval.

Prefer a simple, modular MVP over:

* microservices
* Kubernetes
* Kafka
* unnecessary distributed systems
* unnecessary abstractions

---

## 4. CODING STANDARDS

Use:

* TypeScript strict mode
* strong typing
* explicit interfaces
* small focused modules
* runtime validation for external input
* structured errors/logging
* meaningful names

Avoid:

* unnecessary `any`
* giant files
* duplicated business logic
* hidden global state
* premature abstractions

---

## 5. SECURITY

Treat repository content, README files, package metadata, LLM output, and tool arguments as **untrusted input**.

The LLM is **not** a security boundary.

Tool execution must follow:

```text
schema validation
→ authorization
→ policy validation
→ execution
```

Never expose secrets, GitHub tokens, API keys, host filesystem access, Docker socket access, or arbitrary host command execution to the model.

Never execute arbitrary AI-generated host commands.

---

## 6. TESTING & VALIDATION

Every meaningful change requires appropriate tests.

Consider:

```text
unit
integration
security
E2E
```

For realtime collaboration:

```text
concurrency
reconnection
convergence
```

For AI/agent features:

```text
tool failures
timeouts
retries
cancellation
fake/deterministic AI providers
```

### After implementation

Run the repository's applicable validation commands.

Prefer:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

If a command does not exist, do not invent it. Inspect `package.json` and workspace scripts first.

Fix failures caused by your changes before finishing.

Do not claim a check passed unless it was actually run.

---

## 7. TASK.MD UPDATES

`docs/task.md` is the **living implementation backlog**.

After completing a task:

* mark the task status accurately;
* record completed work;
* record relevant files/components;
* record validation results when useful;
* record blockers or known issues;
* identify the next task only if it is clear from the existing backlog.

Do not rewrite the entire task file.

Do not mark incomplete work as complete.

If scope changes materially, update the task and explain why.

---

## 8. DOCUMENTATION SYNC

Update documentation only when the implementation creates a real change to documented behavior, architecture, requirements, or testing.

Relevant updates may include:

```text
architecture.md
trd.md
implementation.md
testing.md
bugs.md
task.md
```

Create an ADR only for a significant architectural decision.

Do not regenerate documentation unnecessarily.

---

## 9. FAILURE HANDLING

When something fails:

```text
reproduce
→ inspect logs/error
→ identify root cause
→ determine code/config/environment issue
→ make smallest fix
→ add regression test when appropriate
```

Do not rewrite working systems to solve an unexplained failure.

If the failure indicates an architectural problem, stop and report it before making a major change.

---

## 10. GIT

Keep changes focused and commits meaningful.

Preferred prefixes:

```text
feat:
fix:
refactor:
test:
docs:
chore:
security:
```

Never commit:

```text
.env
credentials
API keys
private secrets
unnecessary generated files
```

Review the diff before finishing.

---

## 11. COMPLETION REPORT

After each task, report:

### Implemented

What was completed.

### Files Changed

Relevant files only.

### Tests & Validation

Commands actually executed and their results.

### Known Issues

Anything incomplete, blocked, or intentionally deferred.

### Next Task

The next task from `docs/task.md`, if clear.

Keep the report concise.