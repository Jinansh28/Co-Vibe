# TASK BACKLOG — Collaborative AI Vibe-Coding Workspace

**Target Document:** `docs/task.md`  
**Role:** Technical Project Manager + Staff Software Engineer  
**Baseline Inputs:** Approved `PRD.md`, `TRD.md`, `Architecture.md`, `AppFlow.md`, and `implementation.md`  
**Execution Model:** Single developer, MVP-first, vertical slice delivery, dependency-aware backlog tracking.

---

## 1. TASK PRINCIPLES & GOVERNANCE

1. **Concrete & Actionable:** Every task defines specific implementation details, file locations, measurable acceptance criteria, and explicit test cases.
2. **Dependency-Aware Ordering:** Tasks strictly declare `Depends on: TASK-XXX`. No task may begin until its prerequisites are completed.
3. **Vertical Slice Focus:** Early tasks establish end-to-end functionality (Project Creation → Workspace Open → Local Runtime Connect → File Edit → Run Test) before expanding horizontally into collaboration, AI, and diff review.
4. **Objective Acceptance Criteria:** Acceptance criteria use testable assertions (e.g. "Two browser sessions editing the same Y.Text converge to identical content") rather than vague statements.
5. **Format Compliance:** All tasks adhere strictly to the standardized Task Template.

---

## 2. CURRENT STATE & BACKLOG TRACKING

```text
Current Sprint:     Sprint 1 — Monorepo Foundation & Core Shell
Current Task:       TASK-025 — Agent Execution Tables Migration (`004_agent_execution.sql`)
Completed Tasks:    TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021, TASK-022, TASK-023, TASK-024
Next Task:          TASK-026 — Agent Finite State Machine (`state-machine.ts`)
Blocked Tasks:      None
Known Risks:        - Browser memory overhead during long-lived Yjs sessions.
                    - Ollama model inference latency on consumer hardware.
                    - Docker socket security boundaries on developer host OS.
```

---

## 3. RECOMMENDED MVP EXECUTION ORDER

```mermaid
flowchart TD
    subgraph Slice1 ["Vertical Slice 1: Core IDE & Local Execution"]
        T1[TASK-001: Foundation] --> T4[TASK-004: Frontend Shell]
        T1 --> T7[TASK-007: Database & Auth]
        T7 --> T10[TASK-010: Projects & Workspaces]
        T10 --> T13[TASK-013: Runtime Daemon]
        T13 --> T16[TASK-016: Docker Sandbox]
        T10 --> T18[TASK-018: Monaco Editor]
        T16 --> T20[TASK-020: Terminal Stream]
    end

    subgraph Slice2 ["Vertical Slice 2: Realtime Collaboration"]
        T18 --> T21[TASK-021: Durable Object Room]
        T21 --> T22[TASK-022: Yjs Monaco Sync]
        T22 --> T23[TASK-023: Presence & Cursors]
    end

    subgraph Slice3 ["Vertical Slice 3: Autonomous AI Agent & Review"]
        T13 --> T24[TASK-024: Git Worktree Manager]
        T1 --> T27[TASK-027: AI Provider Abstraction]
        T27 --> T29[TASK-029: Context Engine P0]
        T29 --> T31[TASK-031: Agent Core & State Machine]
        T31 --> T34[TASK-034: Change Sets & Diff Review]
        T34 --> T36[TASK-036: Automated Test Repair Loop]
    end

    subgraph Slice4 ["Vertical Slice 4: Security & Deployment"]
        T36 --> T38[TASK-038: Security Hardening]
        T38 --> T40[TASK-040: CI/CD & Cloudflare Deploy]
    end
```

---

## 4. DETAILED TASK BACKLOG

---

### GROUP 1: Foundation

## TASK-001 — Monorepo Workspace & TypeScript Base Setup

Status: DONE  
Priority: P0  
Component: Foundation  
Depends on: None  
Estimated effort: S

### Objective

Establish the root monorepo structure, pnpm workspace configuration, base TypeScript configurations, and shared utility packages.

### Implementation

- Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`.
- Create directory structure for `apps/` (`web`, `api`, `runtime`) and `packages/` (`shared`, `protocol`, `collaboration`, `agent`, `context`, `git`, `security`).
- Configure root scripts: `install`, `build`, `dev`, `test`, `typecheck`, `lint`.

### Files

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`

### Acceptance Criteria

- [x] `pnpm install` resolves dependencies across all workspaces without warnings.
- [x] `pnpm typecheck` executes `tsc --noEmit` across packages with 0 errors.
- [x] Root `packages/shared` exports core TypeScript interfaces (`User`, `Project`, `Workspace`).

### Tests

- [x] `packages/shared/tests/types.test.ts` verifies type exports and object initialization.

### Definition of Done

Monorepo builds cleanly with `pnpm build` and passes `pnpm typecheck`.

---

## TASK-002 — Shared Protocol & Zod Envelopes Package

Status: DONE  
Priority: P0  
Component: Foundation  
Depends on: TASK-001  
Estimated effort: S

### Objective

Create `@co-vibe/protocol` package providing Zod schemas and runtime validation types for HTTP requests and WebSocket message envelopes.

### Implementation

- Define `WsEnvelopeSchema` containing `id`, `type`, `version`, `workspaceId`, `clientId`, `timestamp`, `payload`.
- Define runtime request schemas (`RuntimeStartSchema`, `ProcessExecSchema`, `GitCommandSchema`).
- Export type inferences via `z.infer`.

### Files

- `packages/protocol/package.json`
- `packages/protocol/src/index.ts`
- `packages/protocol/src/envelope.ts`
- `packages/protocol/src/runtime.ts`

### Acceptance Criteria

- [x] Valid envelopes pass `WsEnvelopeSchema.parse()` without throwing.
- [x] Malformed payloads (missing `workspaceId` or `timestamp`) fail validation with Zod error.

### Tests

- [x] `packages/protocol/tests/envelope.test.ts` validates envelope serialization/deserialization.

### Definition of Done

Protocol package published internally to monorepo and imported by `apps/api` and `apps/web`.

---

## TASK-003 — Vitest Test Infrastructure Setup

Status: DONE  
Priority: P0  
Component: Testing  
Depends on: TASK-001  
Estimated effort: S

### Objective

Configure Vitest test runner across monorepo packages and apps with unified reporting and coverage thresholds.

### Implementation

- Create `vitest.config.ts` in monorepo root and package subdirectories.
- Configure coverage provider (`v8`) targeting 80%+ coverage on core protocol and security packages.
- Add `pnpm test` script executing Vitest in workspace mode.

### Files

- `vitest.config.ts`
- `packages/shared/vitest.config.ts`

### Acceptance Criteria

- [x] Running `pnpm test` executes tests across all packages concurrently.
- [x] Test summary outputs formatted test counts and execution times.

### Tests

- [x] Running `pnpm test` successfully runs fixture test suites.

### Definition of Done

Test runner configured and passing in CI pipeline setup.

---

### GROUP 2: Frontend Shell

## TASK-004 — React + Vite IDE Shell Layout

Status: DONE  
Priority: P0  
Component: Frontend  
Depends on: TASK-001  
Estimated effort: M

### Objective

Build the main IDE layout grid containing TopBar, Sidebar, Main Editor Pane, Agent Panel, and Terminal Drawer.

### Implementation

- Initialize React 18 + Vite app in `apps/web`.
- Configure custom dark theme styling system with glassmorphic panel design tokens (`apps/web/src/index.css`).
- Build layout components: `TopBar`, `Sidebar`, `FileExplorer`, `EditorPane`, `AgentPanel`, `TerminalPane`, `AppLayout`.
- Add collapsible panel toggles and responsive flex grid layout.

### Files

- `apps/web/vite.config.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/components/layout/AppLayout.tsx`
- `apps/web/src/components/layout/TopBar.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/components/layout/FileExplorer.tsx`
- `apps/web/src/components/layout/EditorPane.tsx`
- `apps/web/src/components/layout/AgentPanel.tsx`
- `apps/web/src/components/layout/TerminalPane.tsx`
- `apps/web/src/components/layout/AppLayout.test.tsx`

### Acceptance Criteria

- [x] IDE layout renders responsive panels without horizontal scroll overflow.
- [x] Panel toggle buttons collapse and expand Sidebar, Agent Panel, and Terminal Drawer.
- [x] Layout complies with glassmorphism UI design specification.

### Tests

- [x] `apps/web/src/components/layout/AppLayout.test.tsx` renders shell layout grid and verifies panel toggling.

### Definition of Done

`pnpm --filter web dev` serves IDE shell UI on `http://localhost:5173`.

---

## TASK-005 — Client Toast & Notification System

Status: DONE  
Priority: P1  
Component: Frontend  
Depends on: TASK-004  
Estimated effort: S

### Objective

Implement global toast notification provider for feedback on async operations, errors, and system status updates.

### Implementation

- Build `NotificationProvider` context and custom hook `useNotification()`.
- Support toast types: `info`, `success`, `warning`, `error`.
- Auto-dismiss toasts after 4000ms with manual close option.

### Files

- `apps/web/src/components/ui/Toast.tsx`
- `apps/web/src/context/NotificationContext.tsx`
- `apps/web/src/components/ui/Toast.test.tsx`

### Acceptance Criteria

- [x] Calling `showNotification('Error', 'error')` renders red toast notification banner.
- [x] Toast dismisses automatically after 4 seconds.

### Tests

- [x] `apps/web/src/components/ui/Toast.test.tsx` tests toast lifecycle.

### Definition of Done

Toast system integrated into main layout root.

---

### GROUP 3: Authentication

## TASK-006 — Database Initial Migration (`001_initial_schema.sql`)

Status: DONE  
Priority: P0  
Component: Authentication  
Depends on: TASK-001  
Estimated effort: S

### Objective

Create initial PostgreSQL migration establishing `users`, `projects`, and `project_members` tables.

### Implementation

- Create SQL migration script `infrastructure/db/migrations/001_initial_schema.sql`.
- Create `users` table linked to Supabase `auth.users(id)`.
- Create `projects` table with `owner_id` FK.
- Create `project_members` join table with `role` check constraint (`owner`, `editor`, `viewer`).

### Files

- `infrastructure/db/migrations/001_initial_schema.sql`
- `scripts/migrate.ts`

### Acceptance Criteria

- [x] Migration executes on blank Postgres database without syntax errors.
- [x] Unique constraints and foreign keys correctly enforced.

### Tests

- [x] Integration test executes up/down migrations on test Postgres container.

### Definition of Done

Migration schema applied cleanly to Supabase database.

---

## TASK-007 — Worker JWT Authentication Middleware

Status: DONE  
Priority: P0  
Component: Authentication  
Depends on: TASK-002, TASK-006  
Estimated effort: M

### Objective

Create Hono authentication middleware in Cloudflare Worker (`apps/api`) validating Supabase JWT tokens on protected routes.

### Implementation

- Initialize Hono API app in `apps/api`.
- Create middleware `apps/api/src/middleware/auth.ts` extracting Bearer token or HttpOnly cookie.
- Validate JWT signature against `SUPABASE_JWT_SECRET`.
- Inject `authUser` context into request payload.

### Files

- `apps/api/src/index.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/auth.ts`

### Acceptance Criteria

- [x] Unauthenticated requests to `/api/v1/*` return `401 Unauthorized` with structured JSON error.
- [x] Valid JWT header passes request to route handler with populated user identity context.

### Tests

- [x] `apps/api/tests/auth.test.ts` tests valid, expired, and missing tokens.

### Definition of Done

Protected API routes guarded by authentication middleware.

---

## TASK-008 — Frontend Login Page & Auth Provider

Status: DONE  
Priority: P0  
Component: Authentication  
Depends on: TASK-004, TASK-007  
Estimated effort: M

### Objective

Build Frontend Login/Signup page integrated with Supabase Client Auth SDK and route guards.

### Implementation

- Install `@supabase/supabase-js` in `apps/web`.
- Create `AuthProvider` context managing session state (`user`, `session`, `isLoading`).
- Build `LoginPage.tsx` with email/password authentication forms.
- Protect workspace routes with `ProtectedRoute` redirect wrapper.

### Files

- `apps/web/src/features/auth/LoginPage.tsx`
- `apps/web/src/features/auth/AuthProvider.tsx`
- `apps/web/src/features/auth/useAuth.ts`
- `apps/web/src/features/auth/ProtectedRoute.tsx`
- `apps/web/src/lib/supabaseClient.ts`

### Acceptance Criteria

- [x] User submitting valid credentials gains active session and redirects to `/projects`.
- [x] Unauthenticated access to `/projects/123` redirects to `/login`.

### Tests

- [x] `apps/web/src/features/auth/LoginPage.test.tsx` tests form submission.

### Definition of Done

End-to-end login flow operational in browser UI.

---

### GROUP 4: Projects & Workspaces

## TASK-009 — Workspaces & Repositories Migration (`002_workspaces_repos.sql`)

Status: DONE  
Priority: P0  
Component: Projects  
Depends on: TASK-006  
Estimated effort: S

### Objective

Create migration script establishing `workspaces` and `repositories` tables.

### Implementation

- Create SQL script `002_workspaces_repos.sql`.
- Create `workspaces` table (`id`, `project_id`, `name`, `active_branch`).
- Create `repositories` table (`id`, `project_id`, `provider`, `owner_name`, `repo_name`, `clone_url`).

### Files

- `infrastructure/db/migrations/002_workspaces_repos.sql`

### Acceptance Criteria

- [x] Foreign keys to `projects(id)` cascade delete on project removal.
- [x] Unique index on `(project_id, owner_name, repo_name)` prevents duplicate imports.

### Tests

- [x] Migration runner verifies table schema creation.

### Definition of Done

Database schema updated with workspace tables.

---

## TASK-010 — Projects & Workspaces API Endpoints

Status: DONE  
Priority: P0  
Component: Projects  
Depends on: TASK-007, TASK-009  
Estimated effort: M

### Objective

Implement CRUD API endpoints for managing projects, members, and workspace instances.

### Implementation

- Create route handlers:
  - `POST /api/v1/projects` (Create project + owner membership).
  - `GET /api/v1/projects/:id` (Fetch project details + authorization check).
  - `POST /api/v1/projects/:id/workspaces` (Spawn new workspace instance).
- Enforce RBAC membership check on all project mutations.

### Files

- `apps/api/src/routes/projects.ts`
- `apps/api/src/routes/workspaces.ts`
- `apps/api/src/services/projectService.ts`

### Acceptance Criteria

- [x] User creating project is automatically assigned `owner` role in `project_members`.
- [x] User without project membership receives `403 Forbidden` on `GET /api/v1/projects/:id`.

### Tests

- [x] `apps/api/tests/projects.test.ts` tests project CRUD and authorization limits.

### Definition of Done

Projects API operational and passing integration tests.

---

## TASK-011 — Projects Dashboard UI

Status: DONE  
Priority: P0  
Component: Projects  
Depends on: TASK-008, TASK-010  
Estimated effort: M

### Objective

Build frontend Projects Dashboard page listing user projects, repository import trigger, and Create Project modal.

### Implementation

- Create `ProjectsPage.tsx` listing active user projects with metadata cards.
- Build `CreateProjectModal.tsx` form handling project creation and GitHub import link.
- Connect API service using React Query / fetch hook.

### Files

- `apps/web/src/features/projects/ProjectsPage.tsx`
- `apps/web/src/features/projects/ProjectCard.tsx`
- `apps/web/src/features/projects/CreateProjectModal.tsx`

### Acceptance Criteria

- [x] Dashboard displays list of projects fetched from `/api/v1/projects`.
- [x] Submitting modal form creates project and navigates to workspace route `/projects/:id/workspace/:wsId`.

### Tests

- [x] `apps/web/src/features/projects/ProjectsPage.test.tsx` tests project creation flow.

### Definition of Done

User can navigate from login -> dashboard -> create project.

---

### GROUP 5: Local Runtime Daemon

## TASK-012 — Runtime Pairing Server & Token Authentication

Status: DONE  
Priority: P0  
Component: Runtime  
Depends on: TASK-007  
Estimated effort: M

### Objective

Create local HTTP pairing server in `apps/runtime` enabling initial authentication exchange between local daemon and Worker API.

### Implementation

- Initialize Node.js runtime daemon in `apps/runtime`.
- Create local HTTP server on `http://127.0.0.1:7890`.
- Generate short-lived 6-digit pairing code.
- Provide pairing endpoint exchanging code for scoped JWT runtime token.

### Files

- `apps/runtime/src/index.ts`
- `apps/runtime/src/server/pairingServer.ts`
- `apps/runtime/src/auth/tokenManager.ts`

### Acceptance Criteria

- [x] Runtime daemon starts local pairing server on port 7890.
- [x] Submitting valid pairing code exchanges secret for signed runtime authorization token.

### Tests

- [x] `apps/runtime/tests/pairing.test.ts` tests pairing code verification.

### Definition of Done

Runtime daemon authenticates successfully with Worker API.

---

## TASK-013 — Outbound WebSocket Runtime Channel

Status: DONE  
Priority: P0  
Component: Runtime  
Depends on: TASK-002, TASK-012  
Estimated effort: M

### Objective

Establish secure, persistent outbound WebSocket connection from local runtime daemon to Worker control plane.

### Implementation

- Create WebSocket client connection in runtime daemon targeting `wss://<worker>/ws/runtime`.
- Attach runtime token in connection handshake headers or query parameter `?token=...`.
- Implement automatic reconnection backoff (1s -> 2s -> 5s) and ping/pong heartbeats (15s).

### Files

- `apps/runtime/src/server/workerClient.ts`
- `apps/api/src/routes/runtimeWs.ts`
- `apps/runtime/tests/workerClient.test.ts`
- `apps/api/tests/runtimeWs.test.ts`

### Acceptance Criteria

- [x] Runtime connects outbound to Worker WebSocket server.
- [x] Network disconnects trigger automatic reconnect within 5 seconds without duplicate sockets.

### Tests

- [x] `apps/runtime/tests/workerClient.test.ts` verifies heartbeat and reconnect sequence.
- [x] `apps/api/tests/runtimeWs.test.ts` verifies token validation and WebSocket routing.

### Definition of Done

Bi-directional command pipeline established between Cloudflare Worker and local host machine.

---

### GROUP 6: Docker Sandbox Manager

## TASK-014 — Docker Container Manager (`DockerManager.ts`)

Status: DONE  
Priority: P0  
Component: Docker  
Depends on: TASK-013  
Estimated effort: L

### Objective

Build container lifecycle manager in `apps/runtime` using `dockerode` to spawn unprivileged workspace sandbox containers.

### Implementation

- Create `DockerManager` class using `dockerode`.
- Implement `createContainer()`, `startContainer()`, `stopContainer()`, `removeContainer()`.
- Enforce execution flags: `--cpus=2`, `--memory=1g`, `--pids-limit=256`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--user=10001`.
- Mount local project directory into container `/workspace`.

### Files

- `apps/runtime/src/docker/DockerManager.ts`
- `infrastructure/docker/Dockerfile.sandbox`

### Acceptance Criteria

- [x] Sandbox container spins up with UID 10001 and non-root privileges.
- [x] Attempts to access Docker host socket inside container fail with permission denied.

### Tests

- [x] `apps/runtime/tests/dockerManager.test.ts` spawns container, runs `whoami`, verifies `workspace` output, tears down container.

### Definition of Done

Docker containers spawned safely with explicit resource caps and capability restrictions.

---

## TASK-015 — Process Execution & Stream Manager

Status: DONE  
Priority: P0  
Component: Docker  
Depends on: TASK-014  
Estimated effort: M

### Objective

Build process execution manager running commands inside container and streaming stdout/stderr outputs over WebSocket.

### Implementation

- Create `ProcessManager` class in runtime daemon.
- Implement `execCommand(cmd: string[], opts)` with mandatory default 60s timeout.
- Separate `stdout` and `stderr` streams, buffering chunks into protocol envelopes.
- Implement process tree killer for process cancellation.

### Files

- `apps/runtime/src/process/ProcessManager.ts`
- `apps/runtime/src/process/streamBuffer.ts`
- `apps/runtime/tests/processManager.test.ts`

### Acceptance Criteria

- [x] Command `node -e "console.log('hello'); console.error('fail');"` streams separate stdout and stderr chunks.
- [x] Process running longer than timeout duration is forcibly killed with `SIGKILL`.

### Tests

- [x] `apps/runtime/tests/processManager.test.ts` tests streaming and timeout execution.

### Definition of Done

Commands execute inside container with streamed outputs and strict process control.

---

### GROUP 7: Monaco Editor Core

## TASK-016 — Monaco Editor Component Integration

Status: DONE  
Priority: P0  
Component: Editor  
Depends on: TASK-004  
Estimated effort: M

### Objective

Integrate `@monaco-editor/react` into main IDE view with syntax highlighting, VS-Dark theme, and editor settings.

### Implementation

- Create `MonacoEditor.tsx` wrapping `@monaco-editor/react`.
- Configure VS Code Dark Modern theme (`vs-dark`).
- Configure editor options: font size 14px, minimap enabled, line numbers, automatic layout.
- Handle editor mount events (`onMount`) to access monaco editor instance.

### Files

- `apps/web/src/features/editor/MonacoEditor.tsx`
- `apps/web/src/features/editor/editorConfig.ts`

### Acceptance Criteria

- [x] Monaco Editor mounts smoothly inside central EditorPane without layout distortion.
- [x] Opening TypeScript file displays full syntax highlighting and line numbers.

### Tests

- [x] `apps/web/src/features/editor/MonacoEditor.test.tsx` verifies editor mounting.

### Definition of Done

Monaco Editor embedded and operational in browser UI.

---

## TASK-017 — Virtual File Tree & Multi-Tab Model Manager

Status: DONE  
Priority: P0  
Component: Editor  
Depends on: TASK-016  
Estimated effort: M

### Objective

Implement sidebar File Tree view and multi-tab editor manager supporting file opening, switching, and closing.

### Implementation

- Create `FileTree.tsx` rendering recursive directory structure.
- Build Zustand store `useEditorStore.ts` tracking open tabs (`openFiles`, `activeFilePath`).
- Manage Monaco `ITextModel` lifecycle (create model on file open, switch active model on tab select, dispose model on tab close).

### Files

- `apps/web/src/features/editor/FileTree.tsx`
- `apps/web/src/features/editor/TabManager.tsx`
- `apps/web/src/features/editor/useEditorStore.ts`

### Acceptance Criteria

- [x] Clicking file in sidebar opens tab and switches active Monaco model.
- [x] Closing file tab disposes corresponding Monaco `ITextModel` without memory leak.

### Tests

- [x] `apps/web/src/features/editor/TabManager.test.tsx` tests tab switching and model disposal.

### Definition of Done

User can navigate file tree and work across multiple open editor tabs.

---

### GROUP 8: Collaboration & Durable Objects

## TASK-018 — Collaboration Sessions Migration (`003_collaboration_sessions.sql`)

Status: DONE  
Priority: P0  
Component: Collaboration  
Depends on: TASK-009  
Estimated effort: S

### Objective

Create database migration for tracking active collaboration sessions.

### Implementation

- Create SQL script `003_collaboration_sessions.sql`.
- Create `collaboration_sessions` table (`id`, `workspace_id`, `user_id`, `client_id`, `connected_at`, `disconnected_at`).

### Files

- `infrastructure/db/migrations/003_collaboration_sessions.sql`

### Acceptance Criteria

- [x] Migration applies cleanly with unique constraint on `(workspace_id, client_id)`.

### Tests

- [x] Migration runner validation test.

### Definition of Done

Database schema ready for tracking room collaboration sessions.

---

## TASK-019 — Cloudflare Durable Object Workspace Room (`WorkspaceRoom.ts`)

Status: DONE  
Priority: P0  
Component: Collaboration  
Depends on: TASK-007, TASK-018  
Estimated effort: L

### Objective

Create stateful Cloudflare Durable Object `WorkspaceRoom` managing real-time WebSocket client connections and binary Yjs synchronization.

### Implementation

- Implement `WorkspaceRoom` Durable Object class in `apps/api`.
- Maintain active WebSocket connection registry.
- Maintain in-memory `Y.Doc` instance.
- Store snapshot updates in Durable Object persistent storage.
- Broadcast binary Yjs delta updates across connected room clients.

### Files

- `apps/api/src/durable-objects/WorkspaceRoom.ts`
- `apps/api/src/routes/workspaceWs.ts`

### Acceptance Criteria

- [x] Multiple WebSocket connections joining same workspace ID connect to same Durable Object instance.
- [x] Yjs update sent by Client A broadcasts to Client B within 300ms.

### Tests

- [x] `tests/collaboration/durableObject.test.ts` verifies multi-client WebSocket synchronization.

### Definition of Done

Durable Object room handles real-time WebSocket connection lifecycle and CRDT broadcasting.

---

## TASK-020 — Monaco Yjs CRDT & Remote Cursor Binding

Status: DONE  
Priority: P0  
Component: Collaboration  
Depends on: TASK-016, TASK-019  
Estimated effort: L

### Objective

Bind Monaco Editor models to Yjs CRDT document structures (`Y.Text`) with live awareness remote cursor rendering.

### Implementation

- Create `YjsMonacoBinding.ts` adapter in `@co-vibe/collaboration`.
- Bind `Y.Text` instance in `Y.Map("files")` to Monaco `ITextModel`.
- Integrate Yjs Awareness protocol tracking remote user cursors and selections.
- Render colored cursor decorations and selection highlights in Monaco editor pane.

### Files

- `packages/collaboration/src/YjsMonacoBinding.ts`
- `packages/collaboration/src/AwarenessManager.ts`
- `apps/web/src/features/collaboration/useCollaboration.ts`

### Acceptance Criteria

- [x] Typing in Client A updates Client B Monaco editor text automatically without focus reset.
- [x] Remote user selection renders with custom user color marker and name tag.

### Tests

- [x] `tests/collaboration/yjsMonacoBinding.test.ts` tests concurrent edit convergence.

### Definition of Done

Multi-user real-time co-editing operational with remote cursors.

---

### GROUP 9: Git Engine & Worktree Manager

## TASK-021 — Git CLI Wrapper & Status Service (`GitManager.ts`)

Status: DONE  
Priority: P0  
Component: Git  
Depends on: TASK-014  
Estimated effort: M

### Objective

Implement Git CLI wrapper in runtime daemon providing repository status, branch management, diff generation, and local commit capabilities.

### Implementation

- Create `GitManager` class in `@co-vibe/git`.
- Implement `getStatus()`, `getDiff()`, `createBranch()`, `commit()`.
- Use `execa` executing git commands inside workspace directory.
- Parse git output into structured JSON responses.

### Files

- `packages/git/src/GitManager.ts`
- `packages/git/src/diffParser.ts`
- `apps/api/src/routes/git.ts`

### Acceptance Criteria

- [x] `getStatus()` returns list of modified, staged, and untracked files.
- [x] `getDiff()` generates unified diff string matching standard git CLI output.

### Tests

- [x] `packages/git/tests/gitManager.test.ts` executes git operations against test git repository fixture.

### Definition of Done

Git status, diff, branch, and commit operations accessible via API.

---

## TASK-022 — Isolated Agent Git Worktree Manager (`worktree.ts`)

Status: DONE  
Priority: P0  
Component: Git  
Depends on: TASK-021  
Estimated effort: M

### Objective

Build Git worktree manager spawning temporary isolated worktree directories for AI agent task execution.

### Implementation

- Create `GitWorktreeManager` class in `@co-vibe/git`.
- Implement `createWorktree(baseCommit, worktreePath)` using `git worktree add`.
- Implement `generatePatch(worktreePath, baseCommit)` generating binary patch diff.
- Implement `removeWorktree(worktreePath)` cleaning up worktree directories.

### Files

- `packages/git/src/worktree.ts`

### Acceptance Criteria

- [x] Agent edits executed inside worktree directory leave main workspace branch untouched.
- [x] `removeWorktree()` completely prunes temporary worktree path from disk.

### Tests

- [x] `packages/git/tests/worktree.test.ts` verifies isolated worktree creation and patch extraction.

### Definition of Done

Isolated Git worktree lifecycle fully operational.

---

### GROUP 10: AI Provider Abstraction

## TASK-023 — Standardized AI Provider Interface & Ollama Client

Status: DONE  
Priority: P0  
Component: AI  
Depends on: TASK-001  
Estimated effort: M

### Objective

Build standardized `AIProvider` interface and streaming client adapter for local Ollama models.

### Implementation

- Define `AIProvider` interface (`generate`, `stream`, `supportsToolCalling`).
- Create `OllamaProvider` class in `@co-vibe/agent` connecting to `http://127.0.0.1:11434`.
- Support token streaming and structured JSON tool-calling response formatting.
- Create `MockAIProvider` for offline unit testing.

### Files

- `packages/agent/src/model/interface.ts`
- `packages/agent/src/model/ollama.ts`
- `packages/agent/src/model/mock.ts`

### Acceptance Criteria

- [x] `OllamaProvider.stream()` yields text chunks as generated by local Ollama model.
- [x] Model request formats system prompt, message history, and tool definitions correctly.

### Tests

- [x] `packages/agent/tests/ollama.test.ts` tests mock and live model responses.

### Definition of Done

Pluggable AI Provider layer implemented and tested against local Ollama instance.

---

### GROUP 11: Context Engine (P0)

## TASK-024 — Deterministic Context Retrieval Engine (`retrieval.ts`)

Status: DONE  
Priority: P0  
Component: Context  
Depends on: TASK-021  
Estimated effort: L

### Objective

Implement non-vector P0 repository context engine combining lexical search, AST symbol lookup, import graph, and test failure stack trace parsing.

### Implementation

- Create `ContextRetriever` class in `@co-vibe/context`.
- Implement lexical substring and SHA-256 hash file index.
- Implement AST symbol parser extracting exported functions, classes, and types.
- Implement stack trace regex parser pinpointing error line numbers.
- Enforce token budget allocation (40% context budget max).

### Files

- `packages/context/src/retrieval.ts`
- `packages/context/src/lexical.ts`
- `packages/context/src/symbols.ts`
- `packages/context/src/stackTrace.ts`

### Acceptance Criteria

- [x] Querying context engine for symbol `AuthMiddleware` retrieves `apps/api/src/middleware/auth.ts`.
- [x] Retrieved context payload fits within configured 40% token budget limit.

### Tests

- [x] `packages/context/tests/retrieval.test.ts` verifies symbol ranking and budget capping.

### Definition of Done

Context engine constructs deterministic prompt context chunks within 500ms.

---

### GROUP 12: AI Agent Core & State Machine

## TASK-025 — Agent Execution Tables Migration (`004_agent_execution.sql`)

Status: TODO  
Priority: P0  
Component: Agent  
Depends on: TASK-009  
Estimated effort: S

### Objective

Create database migration establishing `agents`, `agent_tasks`, `agent_runs`, and `tool_calls` tables.

### Implementation

- Create SQL script `004_agent_execution.sql`.
- Create `agent_tasks` table with state constraint (`created`, `planning`, `executing`, `validating`, `needs_fix`, `awaiting_review`, `accepted`, `rejected`, `failed`, `completed`).
- Create `agent_runs` and `tool_calls` tracking execution attempts and inputs/outputs.

### Files

- `infrastructure/db/migrations/004_agent_execution.sql`

### Acceptance Criteria

- [ ] Foreign keys cascade delete when parent workspace or task is deleted.

### Tests

- [ ] Migration runner validation test.

### Definition of Done

Database schema ready for durable agent task state tracking.

---

## TASK-026 — Agent Finite State Machine (`state-machine.ts`)

Status: TODO  
Priority: P0  
Component: Agent  
Depends on: TASK-025  
Estimated effort: M

### Objective

Implement durable Agent State Machine enforcing valid state transitions and persisting state events.

### Implementation

- Create `AgentStateMachine` class in `@co-vibe/agent`.
- Define legal state transitions (e.g. `created` → `planning` → `executing` → `validating` → `awaiting_review`).
- Throw invalid state transition exceptions on illegal moves (e.g. `created` → `accepted`).

### Files

- `packages/agent/src/state-machine.ts`

### Acceptance Criteria

- [ ] Valid transition updates state in memory and database transactionally.
- [ ] Attempting illegal state transition throws `INVALID_STATE_TRANSITION` error.

### Tests

- [ ] `packages/agent/tests/stateMachine.test.ts` tests all state transition paths.

### Definition of Done

Agent state machine operational with strict transition rules.

---

## TASK-027 — Tool Registry & Execution Safety Engine (`registry.ts`)

Status: TODO  
Priority: P0  
Component: Agent  
Depends on: TASK-014, TASK-023  
Estimated effort: L

### Objective

Create Agent Tool Registry managing tool registration, Zod schema validation, execution timeouts, and path security checks.

### Implementation

- Create `ToolRegistry` class in `@co-vibe/agent`.
- Implement standard coding tools: `read_file`, `write_file`, `list_dir`, `run_command`, `run_tests`.
- Validate tool input args against Zod schemas.
- Enforce tool timeouts (5s read, 10s write, 60s exec).

### Files

- `packages/agent/src/tools/registry.ts`
- `packages/agent/src/tools/filesystem.ts`
- `packages/agent/src/tools/shell.ts`

### Acceptance Criteria

- [ ] Model invoking `write_file` with invalid arguments receives structured Zod validation error.
- [ ] Tool execution exceeding timeout threshold cancels execution and returns timeout error output.

### Tests

- [ ] `packages/agent/tests/toolRegistry.test.ts` tests tool input validation and execution timeouts.

### Definition of Done

Tool registry loaded with standard tools and security controls.

---

## TASK-028 — Central Agent Orchestrator (`orchestrator.ts`)

Status: TODO  
Priority: P0  
Component: Agent  
Depends on: TASK-024, TASK-026, TASK-027  
Estimated effort: L

### Objective

Build central `AgentOrchestrator` managing full task loop: prompt construction, model query, tool execution, validation check, and timeline event streaming.

### Implementation

- Create `AgentOrchestrator` class in `@co-vibe/agent`.
- Execute agent loop: gather context → call LLM → validate tool → execute tool → check validation.
- Stream execution progress over WebSocket envelope `agent.progress` to browser IDE UI.

### Files

- `packages/agent/src/orchestrator.ts`
- `apps/web/src/features/agent/AgentPanel.tsx`
- `apps/web/src/features/agent/ToolTimeline.tsx`

### Acceptance Criteria

- [ ] Submitting prompt in AgentPanel initiates agent task and displays live tool execution timeline.
- [ ] Agent execution state updates automatically in PostgreSQL database and UI timeline.

### Tests

- [ ] `packages/agent/tests/orchestrator.test.ts` executes complete mock agent task.

### Definition of Done

Agent Orchestrator executes end-to-end task loop streaming step updates to UI.

---

### GROUP 13: Change Sets & Diff Review

## TASK-029 — Change Sets Schema Migration (`005_changesets_conversations.sql`)

Status: TODO  
Priority: P0  
Component: Change Sets  
Depends on: TASK-025  
Estimated effort: S

### Objective

Create database migration for storing change sets and AI conversation histories.

### Implementation

- Create SQL script `005_changesets_conversations.sql`.
- Create `change_sets` table (`id`, `task_id`, `run_id`, `base_revision`, `status`, `patch`, `changed_files`).
- Create `ai_conversations` table storing chat message history.

### Files

- `infrastructure/db/migrations/005_changesets_conversations.sql`

### Acceptance Criteria

- [ ] Table schema applies cleanly with check constraints on `status` (`pending`, `accepted`, `rejected`, `stale`, `conflicted`).

### Tests

- [ ] Migration runner validation test.

### Definition of Done

Database schema ready for storing agent change sets.

---

## TASK-030 — Three-Way Diff Applicability & Hunk Accept Engine

Status: TODO  
Priority: P0  
Component: Change Sets  
Depends on: TASK-022, TASK-029  
Estimated effort: M

### Objective

Build change set patch manager validating patch applicability against current workspace branch using Git three-way merge logic.

### Implementation

- Create `ChangeSetManager` class in `@co-vibe/agent`.
- Implement `applyChangeSet(changeSetId, acceptedHunks)`:
  1. Compare `base_revision` against current workspace HEAD commit.
  2. If clean, execute `git apply`.
  3. If changed, execute `git apply --3way`.
  4. If conflict markers would result, reject application and set status to `conflicted`.

### Files

- `packages/agent/src/changeset.ts`
- `apps/api/src/routes/changesets.ts`

### Acceptance Criteria

- [ ] Valid patch applies cleanly to workspace branch upon human acceptance.
- [ ] Stale patch conflicting with new human edits is rejected without corrupting workspace files.

### Tests

- [ ] `packages/agent/tests/changeset.test.ts` tests three-way patch applicability and conflict detection.

### Definition of Done

Change sets apply safely to shared workspace after human review.

---

## TASK-031 — Side-by-Side Diff Viewer UI

Status: TODO  
Priority: P0  
Component: Change Sets  
Depends on: TASK-016, TASK-030  
Estimated effort: M

### Objective

Build Side-by-Side Diff Viewer UI component in frontend allowing users to inspect agent changes and accept/reject specific file hunks.

### Implementation

- Create `DiffViewer.tsx` using Monaco Diff Editor (`monaco.editor.createDiffEditor`).
- Render original vs modified files with green/red line diff highlights.
- Add "Accept ChangeSet", "Reject ChangeSet", and hunk selection controls.

### Files

- `apps/web/src/features/changeset/DiffViewer.tsx`
- `apps/web/src/features/changeset/HunkSelector.tsx`

### Acceptance Criteria

- [ ] DiffViewer displays side-by-side diff of original file vs agent worktree output.
- [ ] Clicking "Accept ChangeSet" calls `/api/v1/changesets/:id/accept` and updates main workspace.

### Tests

- [ ] `apps/web/src/features/changeset/DiffViewer.test.tsx` tests diff rendering.

### Definition of Done

Human review UI operational for diff inspection and change set acceptance.

---

### GROUP 14: Testing Engine & Repair Loop

## TASK-032 — Containerized Test Runner & Output Parser (`TestRunner.ts`)

Status: TODO  
Priority: P0  
Component: Testing  
Depends on: TASK-015  
Estimated effort: M

### Objective

Implement automated test execution engine running project tests inside Docker sandbox containers and parsing test failure outputs.

### Implementation

- Create `TestRunner` class in `apps/runtime`.
- Detect test framework (Vitest, Jest, Mocha).
- Execute test command (`npm test -- --reporter=json`).
- Parse stdout/stderr JSON to extract failing test spec names, error messages, and line numbers.

### Files

- `apps/runtime/src/process/TestRunner.ts`
- `packages/agent/src/validation.ts`

### Acceptance Criteria

- [ ] TestRunner executes containerized test command and returns structured `TestResult` object (`passed: boolean`, `failedSpecs: [...]`).
- [ ] Failing assertion details are parsed into clean error summaries.

### Tests

- [ ] `apps/runtime/tests/testRunner.test.ts` verifies parsing of failing test outputs.

### Definition of Done

Automated test runner executes inside container and parses spec failures.

---

## TASK-033 — Test-Driven Agent Repair Loop (`repair.ts`)

Status: TODO  
Priority: P0  
Component: Agent  
Depends on: TASK-028, TASK-032  
Estimated effort: M

### Objective

Integrate test-driven repair iteration loop into `AgentOrchestrator` automatically retrying code generation upon test failures.

### Implementation

- Implement `repair.ts` module in `@co-vibe/agent`.
- When test validation fails, transition task to state `needs_fix`.
- Feed test failure stack trace back into `ContextRetriever`.
- Re-query model with repair prompt up to maximum 3 attempts.

### Files

- `packages/agent/src/repair.ts`

### Acceptance Criteria

- [ ] Failing test suite causes agent to transition to `needs_fix` state and generate revised patch.
- [ ] If tests pass on attempt 2, task transitions to `awaiting_review`.
- [ ] If tests fail after attempt 3, task transitions to `failed` state.

### Tests

- [ ] `packages/agent/tests/repair.test.ts` tests 3-attempt repair iteration loop.

### Definition of Done

Agent automatically diagnoses test failures and attempts source code repair.

---

### GROUP 15: Security Hardening & Audit Logging

## TASK-034 — Path Traversal Guard Module (`path-policy.ts`)

Status: TODO  
Priority: P0  
Component: Security  
Depends on: TASK-001  
Estimated effort: S

### Objective

Create path validation module verifying that all filesystem operations remain strictly jailed within workspace root directory.

### Implementation

- Create `assertWorkspacePath(rootPath, requestedPath)` function in `@co-vibe/security`.
- Canonicalize paths using `path.resolve()`.
- Check zero-byte characters and path traversal sequences (`..`).
- Verify target path starts with `rootPath + path.sep`.

### Files

- `packages/security/src/path-policy.ts`

### Acceptance Criteria

- [ ] Path `../../etc/passwd` throws `PATH_NOT_ALLOWED` exception.
- [ ] Path `src/app.ts` resolves correctly to `/workspace/root/src/app.ts`.

### Tests

- [ ] `packages/security/tests/pathPolicy.test.ts` tests valid and malicious path strings.

### Definition of Done

Path policy module imported and enforcing path jail on all filesystem tools.

---

## TASK-035 — Command Policy Allowlist & Sanitizer (`command-policy.ts`)

Status: TODO  
Priority: P0  
Component: Security  
Depends on: TASK-015  
Estimated effort: S

### Objective

Create command validation policy ensuring model tool requests invoke structured allowlisted binaries without raw shell execution.

### Implementation

- Create `validateCommandPolicy(cmd: string[])` in `@co-vibe/security`.
- Enforce strict executable allowlist (`node`, `npm`, `pnpm`, `git`, `npx`, `vitest`).
- Block raw shell invokers (`sh -c`, `bash -c`, `eval`).

### Files

- `packages/security/src/command-policy.ts`

### Acceptance Criteria

- [ ] Command `["npm", "test"]` passes policy validation.
- [ ] Command `["sh", "-c", "rm -rf /"]` fails with `POLICY_VIOLATION` error.

### Tests

- [ ] `packages/security/tests/commandPolicy.test.ts` tests command allowlist.

### Definition of Done

Command policy enforced on all runtime process spawning calls.

---

## TASK-036 — Secret Redactor & Log Masker (`redactor.ts`)

Status: TODO  
Priority: P0  
Component: Security  
Depends on: TASK-002  
Estimated effort: S

### Objective

Create stream redactor masking GitHub OAuth tokens, JWT secrets, and bearer tokens from terminal output streams and log files.

### Implementation

- Create `redactSecrets(text: string)` function in `@co-vibe/security`.
- Apply regular expression patterns matching GitHub tokens (`ghp_[a-zA-Z0-9]{36}`), JWT tokens, and Authorization headers.
- Replace matches with `[REDACTED_SECRET]`.

### Files

- `packages/security/src/redactor.ts`

### Acceptance Criteria

- [ ] Terminal stream containing `ghp_1234567890abcdefghijklmnopqrstuvwxyz` is masked to `[REDACTED_SECRET]`.

### Tests

- [ ] `packages/security/tests/redactor.test.ts` tests regex masking patterns.

### Definition of Done

Stream redactor applied to stdout/stderr log pipelines.

---

## TASK-037 — Database Audit Logs Migration (`006_runtimes_git_audit.sql`)

Status: TODO  
Priority: P0  
Component: Security  
Depends on: TASK-029  
Estimated effort: S

### Objective

Create database migration establishing `audit_logs` table for tracking mutations and security events.

### Implementation

- Create SQL script `006_runtimes_git_audit.sql`.
- Create `audit_logs` table (`id`, `project_id`, `workspace_id`, `user_id`, `event_type`, `target_type`, `target_id`, `metadata`).

### Files

- `infrastructure/db/migrations/006_runtimes_git_audit.sql`
- `apps/api/src/middleware/audit.ts`

### Acceptance Criteria

- [ ] Mutations (project creation, workspace start, changeset accept) insert structured record into `audit_logs`.

### Tests

- [ ] Integration test verifies audit event insertion.

### Definition of Done

Audit logging active across all API write operations.

---

### GROUP 16: Deployment, CI/CD & Documentation

## TASK-038 — GitHub Actions CI Workflow (`ci.yml`)

Status: TODO  
Priority: P0  
Component: Deployment  
Depends on: TASK-003, TASK-035  
Estimated effort: M

### Objective

Configure GitHub Actions automated CI workflow executing linting, type checking, unit tests, and integration tests on pull requests.

### Implementation

- Create `.github/workflows/ci.yml`.
- Configure steps: Checkout → Setup Node.js v22 → Setup pnpm → Install Dependencies → Lint → Typecheck → Run Vitest.

### Files

- `.github/workflows/ci.yml`

### Acceptance Criteria

- [ ] Opening pull request automatically triggers GitHub Actions workflow.
- [ ] Workflow passes cleanly when all checks succeed.

### Tests

- [ ] Test workflow run on GitHub.

### Definition of Done

CI workflow active and protecting `main` branch.

---

## TASK-039 — Cloudflare Worker Wrangler Deployment (`wrangler.toml`)

Status: TODO  
Priority: P0  
Component: Deployment  
Depends on: TASK-007, TASK-019  
Estimated effort: M

### Objective

Configure Cloudflare Worker deployment script (`wrangler.toml`) binding Durable Objects, environment variables, and route triggers.

### Implementation

- Create `infrastructure/cloudflare/wrangler.toml`.
- Configure Durable Object bindings (`WorkspaceRoom`).
- Define secret environment variables bindings (`SUPABASE_URL`, `RUNTIME_AUTH_SECRET`).

### Files

- `infrastructure/cloudflare/wrangler.toml`
- `scripts/deploy.ts`

### Acceptance Criteria

- [ ] Executing `pnpm --filter api deploy` deploys Worker API and Durable Objects to Cloudflare Edge environment.

### Tests

- [ ] Staging deployment test verification.

### Definition of Done

Cloudflare Worker control plane live on public deployment URL.

---

## TASK-040 — Playwright Full E2E Test Suite (`e2e.test.ts`)

Status: TODO  
Priority: P0  
Component: Testing  
Depends on: All previous tasks  
Estimated effort: L

### Objective

Create full end-to-end automated browser test suite using Playwright orchestrating complete user lifecycle flow.

### Implementation

- Install Playwright in `tests/e2e`.
- Automate test flow:
  1. Login user.
  2. Create Project.
  3. Pair Local Runtime Daemon.
  4. Open Workspace & File in Monaco Editor.
  5. Perform concurrent Yjs edits.
  6. Submit AI Agent prompt.
  7. Verify agent execution timeline and automated test repair.
  8. Inspect diff in DiffViewer and accept change set.

### Files

- `tests/e2e/playwright.config.ts`
- `tests/e2e/workspace.spec.ts`

### Acceptance Criteria

- [ ] Playwright test executes end-to-end workflow on test fixture repository without errors.

### Tests

- [ ] Executing `pnpm test:e2e` passes full scenario.

### Definition of Done

E2E suite automated and passing.

---

## TASK-041 — Comprehensive System Documentation (`README.md`)

Status: TODO  
Priority: P1  
Component: Documentation  
Depends on: TASK-039  
Estimated effort: S

### Objective

Write comprehensive project `README.md` providing system architecture overview, local development setup guide, and API quickstart.

### Implementation

- Create `README.md` with system overview diagram, prerequisites, installation steps, `.env` setup guide, and execution commands.

### Files

- `README.md`

### Acceptance Criteria

- [ ] New developer following `README.md` instructions can bootstrap local environment and run app within 15 minutes.

### Definition of Done

`README.md` published in root directory.

---

## 5. BUG & INCIDENT TRACKING MATRIX

### Bug-Task Mapping Structure

When bugs are discovered during development, log them using the following format and attach them to corresponding backlog tasks:

```markdown
## BUG-001 — Yjs Document Selection Highlight Out of Bounds

Status: OPEN  
Severity: High  
Related Task: TASK-020 (Monaco Yjs CRDT Binding)

### Description

When a remote user selects lines past the current document line count, Monaco editor throws a DOM rendering exception.

### Reproduction Steps

1. Client A opens file with 50 lines.
2. Client B opens same file, deletes 20 lines.
3. Client A selects lines 40-50.
4. Monaco throws `IndexOutOfBoundsException`.

### Resolution Task

Create follow-up task TASK-020B to clamp awareness selection range bounds to `model.getLineCount()`.
```

---

## 6. EXECUTABLE FINAL MVP ACCEPTANCE CHECKLIST

This checklist directly verifies compliance with the Technical Requirements Document (TRD) acceptance criteria before release.

### 1. Control & Infrastructure

- [ ] **CF-01:** Cloudflare Worker responds to HTTP requests at `/api/v1/health` with `200 OK`.
- [ ] **CF-02:** Cloudflare Durable Object `WorkspaceRoom` maintains persistent state across worker restarts.
- [ ] **DB-01:** Supabase PostgreSQL database enforces strict foreign keys and unique constraints across all 6 migration files.

### 2. Authentication & Authorization

- [ ] **AUTH-01:** Unauthenticated access to `/api/v1/*` routes returns `401 Unauthorized`.
- [ ] **AUTH-02:** Non-project member attempting to access `/api/v1/projects/:id` receives `403 Forbidden`.
- [ ] **AUTH-03:** GitHub OAuth tokens are encrypted server-side and never returned in API payloads.

### 3. Local Runtime & Docker Execution

- [ ] **RT-01:** Local runtime daemon pairs with Worker API using 6-digit one-time code.
- [ ] **RT-02:** Sandbox Docker containers launch with `--cap-drop=ALL --security-opt=no-new-privileges` and non-root UID `10001`.
- [ ] **RT-03:** Host Docker socket (`/var/run/docker.sock`) is NOT accessible inside sandbox containers.
- [ ] **RT-04:** Process execution exceeding 60 seconds is automatically terminated with `SIGKILL`.

### 4. Real-time Collaboration & Monaco Editor

- [ ] **COL-01:** Monaco Editor initializes with VS-Dark theme, syntax highlighting, and virtual tab manager.
- [ ] **COL-02:** Concurrent edits from two browser clients converge to identical Yjs `Y.Text` document state.
- [ ] **COL-03:** Remote user cursors render with distinct assigned colors and user label flags.

### 5. Autonomous AI Agent & Context Engine

- [ ] **AI-01:** Local Ollama model streams token responses to agent orchestrator over provider interface.
- [ ] **AI-02:** Context engine constructs deterministic prompt context (lexical + AST + stack trace) within 500ms under 40% token budget.
- [ ] **AI-03:** Agent edits remain completely isolated inside Git worktrees during task execution.
- [ ] **AI-04:** Automated test failure triggers agent `needs_fix` state repair loop up to 3 retry attempts.

### 6. Change Sets & Git Operations

- [ ] **CS-01:** Agent modifications render as side-by-side diffs in DiffViewer UI.
- [ ] **CS-02:** Accepting a change set executes three-way patch application (`git apply --3way`) against shared workspace branch.
- [ ] **CS-03:** Conflicting patch application is safely rejected without corrupting workspace files.

### 7. Security Hardening

- [ ] **SEC-01:** Path traversal attempt `../../etc/passwd` throws `PATH_NOT_ALLOWED` error.
- [ ] **SEC-02:** Arbitrary shell execution `sh -c` is blocked by command policy validator.
- [ ] **SEC-03:** GitHub tokens and JWT secrets are redacted from stdout/stderr terminal streams.
