# AGENTS.md

## Collaborative AI Vibe-Coding Workspace

You are the primary implementation agent for this repository.

You are working with a human developer.

Your job is to implement the approved architecture incrementally, not redesign the product.

---

## SOURCE OF TRUTH HIERARCHY

Always consult the project documentation before making architectural or implementation decisions.

Priority:

1. `docs/prd.md`
2. `docs/appflow.md`
3. `docs/ui-ux.md`
4. `docs/architecture.md`
5. `docs/trd.md`
6. `docs/implementation.md`
7. `docs/task.md`
8. `docs/testing.md`
9. `docs/bugs.md`
10. `docs/audit.md`

Interpret them as:

```text
docs/prd.md
→ Product requirements

docs/appflow.md
→ User behavior and journeys

docs/ui-ux.md
→ Interface and interaction behavior

docs/architecture.md
→ System boundaries and technical design

docs/trd.md
→ Technical requirements and contracts

docs/implementation.md
→ Implementation sequence and engineering approach

docs/task.md
→ Current executable backlog

docs/testing.md
→ Verification strategy

docs/bugs.md
→ Known defects and regressions

docs/audit.md
→ Architecture/security/code-quality review
```

---

# CORE RULES

## 1. Do not redesign approved architecture

If an implementation problem occurs, first determine whether the problem can be solved within the existing architecture.

Do not silently replace:

* Cloudflare Workers
* Durable Objects
* Yjs
* Supabase/PostgreSQL
* Docker
* local runtime
* Ollama
* Git
* Monaco

with another technology.

If a change is genuinely necessary, explain it before implementing it.

---

## 2. Do not over-engineer

This is a one-developer MVP.

Prefer:

```text
simple
typed
modular
testable
observable
```

over:

```text
microservices
Kubernetes
Kafka
complex distributed systems
unnecessary abstractions
```

---

## 3. Respect P0/P1/P2 boundaries

Do not implement P1/P2 functionality while P0 work remains incomplete unless explicitly instructed.

---

## 4. Follow the task file

`docs/task.md` is the current implementation backlog.

Before starting work:

1. Read the relevant task.
2. Read its dependencies.
3. Read the relevant TRD section.
4. Read relevant architecture/UI/testing requirements.
5. Implement only the requested scope.

---

## 5. Do not fabricate requirements

If something is not specified:

* infer only when the decision is low-risk;
* otherwise ask the developer;
* never invent major product behavior.

---

## 6. Keep documentation synchronized

When implementation changes an architectural assumption:

* update the appropriate documentation;
* create an ADR if the decision is significant;
* update `task.md` if task scope changes;
* update `testing.md` if testing requirements change.

Never allow code and documentation to silently diverge.

---

# CODING STANDARDS

Use:

* TypeScript strict mode;
* strong typing;
* small modules;
* explicit interfaces;
* runtime validation for external input;
* structured errors;
* structured logging;
* meaningful names.

Avoid:

* `any` unless justified;
* giant files;
* hidden global state;
* duplicated business logic;
* unnecessary abstractions.

---

# SECURITY RULES

Treat:

* repository contents;
* README files;
* package metadata;
* LLM output;
* tool arguments;

as untrusted input.

The LLM is NOT a security boundary.

Every tool call must go through:

```text
schema validation
→ authorization
→ policy validation
→ execution
```

Never expose:

* GitHub tokens;
* API secrets;
* host filesystem;
* Docker socket;
* arbitrary host commands

to the model.

Never execute arbitrary AI-generated commands directly on the host.

---

# TESTING RULES

Every meaningful feature must have appropriate tests.

At minimum consider:

```text
unit
integration
security
E2E
```

For collaboration features also consider:

```text
concurrency
reconnection
convergence
```

For agent features also consider:

```text
tool failures
timeouts
retries
cancellation
deterministic fake AI providers
```

Do not rely entirely on a live LLM for automated tests.

---

# IMPLEMENTATION WORKFLOW

For every task:

```text
Read task
 ↓
Inspect relevant docs
 ↓
Inspect existing code
 ↓
Plan
 ↓
Implement smallest correct change
 ↓
Run tests
 ↓
Run typecheck
 ↓
Run lint
 ↓
Review diff
 ↓
Update docs if required
 ↓
Report result
```

Do not make unrelated changes.

---

# GIT WORKFLOW

Keep commits small and meaningful.

Prefer:

```text
feat:
fix:
refactor:
test:
docs:
chore:
security:
```

Do not commit:

* `.env`;
* credentials;
* API keys;
* local secrets;
* generated junk;
* unnecessary binaries.

---

# WHEN SOMETHING FAILS

Do not immediately rewrite the implementation.

First:

1. reproduce;
2. inspect logs;
3. identify root cause;
4. determine whether the problem is code/config/environment;
5. make the smallest fix;
6. add a regression test where appropriate.

If the failure reveals an architectural problem, stop and explain it.

---

# FINAL RESPONSE AFTER EACH TASK

Report:

### Implemented

### Files changed

### Tests run

### Results

### Known issues

### Next recommended task

Do not claim success if tests were not actually run.
