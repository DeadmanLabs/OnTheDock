# Project Overview — TypeScript Docker Management Library + Realtime Demo App (No Code)

## 0) Purpose & Outcomes

* **Goal:** Build a TypeScript library that gives **full lifecycle control** of Docker containers (create, delete, start/stop, configure resources/env, stream logs, exec shell, browse/modify files) with **realtime** capabilities.
* **Deliverables:**

  1. **`@org/docker-control`** TS library (Node.js) exposing a clean, typed API.
  2. **Test app** (`/test`) demonstrating the library:

     * **Backend:** Express.js + Socket.IO server using the library.
     * **Frontend:** Vite + Tailwind web UI using Socket.IO to manage containers in real time.
* **Non-Goals:** No Kubernetes; no multi-host orchestration; no advanced scheduling. Keep scope to **single host Docker Engine** (local or remote via socket/TCP).

---

## 1) High-Level Architecture

### 1.1 Components

* **Library Core (Node-side only):**

  * Wraps Docker Engine API (via socket or TCP).
  * Modules for images, containers, exec, files (archive), logs, events, system info.
  * Realtime: emits Node EventEmitter events; integrates easily with Socket.IO or any pub/sub.
* **Test Backend (Express + Socket.IO):**

  * Thin HTTP+WS façade over the library.
  * Auth-less in test mode (but pluggable for production).
* **Test Frontend (Vite + Tailwind):**

  * UI to create/manage containers, edit env/config, view logs, run shell, inspect files, stop/remove, etc.
  * Realtime updates via Socket.IO.

### 1.2 Data Flow

* **Frontend** issues REST/WS actions → **Express backend** invokes **library** → library talks to **Docker Engine**.
* **Library events** (logs, status, stats) → backend → **Socket.IO** → frontend UI streams.

### 1.3 Runtime Environments

* **Supported OS:** Linux, macOS, Windows (Docker Desktop).
* **Docker Access:**

  * Unix socket (`/var/run/docker.sock`) on Linux/macOS.
  * Named pipe on Windows or TCP (`DOCKER_HOST=...`).
* **Remote Engines:** Support TCP endpoint, optional TLS certs.

---

## 2) Library Design (Packages & Modules)

> Package name example: `@org/docker-control` (adjust naming to your org).

### 2.1 Public API (Conceptual)

* **Engine Client**: configuration and connection to Docker Engine.

  * Host/socket selection; TLS options; timeouts; retries; request tracing.
* **Images**:

  * Pull from registry (public/private, with creds).
  * List, inspect, tag, remove.
* **Containers**:

  * Create with:

    * Image, command/entrypoint, **env**, **mounts/volumes**, **ports**, **networks**, **capabilities**, **restart policy**, **labels**.
    * **Resource limits**: CPU shares/quota, cpuset, memory limit/swap, pids limit.
  * Start/stop/restart/pause/unpause/kill.
  * Update (env-like labels where possible, resources, restart policy).
  * Inspect + prune.
* **Logs & Stats**:

  * Stream stdout/stderr with timestamps.
  * Get historical logs (tail, since, until).
  * Realtime **stats** (CPU%, memory, IO, network).
* **Exec (Shell & Commands)**:

  * Create exec session (e.g., `/bin/bash`).
  * Attach STDIN/STDOUT/STDERR (interactive) + TTY support.
  * Resize TTY.
* **Files**:

  * Get/put files in container (archive Tar stream semantics).
  * List/inspect directory metadata.
  * Delete/rename/mkdir when feasible via an exec helper or archive approach.
* **Events**:

  * Subscribe to Docker events (start, stop, die, pull, destroy).
  * Normalized event model for consumer code.
* **System**:

  * Info (engine, resources), version, df (disk usage).
* **Realtime Layer**:

  * Node events per container/log/exec/stats.
  * Consumer can bridge to Socket.IO easily.

### 2.2 Internal Modules (Suggested)

* `engine/Client` — low-level HTTP/stream multiplexer to Docker Engine.
* `images/ImagesService`
* `containers/ContainersService`
* `exec/ExecService`
* `files/FilesService` (archives + helpers)
* `logs/LogsService`
* `events/EventsService`
* `stats/StatsService`
* `models/` — TypeScript types for requests/responses, validation schemas.
* `errors/` — normalized error taxonomy.
* `utils/` — tar helpers, stream utilities, backoff/retry, timeouts, cancellation tokens.

### 2.3 Configuration & Injection

* **ClientOptions**:

  * `transport`: unix socket path | TCP host\:port | named pipe.
  * `tls`: ca/cert/key paths + passphrase.
  * `auth`: registry credentials management.
  * `request`: timeouts, retries, user-agent, logging hooks.
* **Dependency Injection**:

  * Accept a configured client in services; avoid global singletons to ease testing.

### 2.4 Type System & Validation

* **Types:** Strong TS types for all inputs/outputs.
* **Validation:** Runtime validation (e.g., Zod) on public methods to prevent malformed requests.
* **Enums & Literals:** For restart policies, network modes, log drivers, etc.

---

## 3) Container Capabilities (Detailed Requirements)

### 3.1 Creation & Resource Specs

* **Env vars:** key=value with secure handling (masking logs).
* **CPU:** shares, period/quota, cpuset.
* **Memory:** limit, reservation, swap limit.
* **PIDs limit**, **ulimits** (if needed).
* **GPU (optional v1):** detect and opt-in support where available (NVIDIA runtime).
* **Capabilities & security opts:** add/drop capabilities, seccomp profile path (optional).

### 3.2 Networking & Ports

* **Port mappings** host\:container with protocol.
* **Network mode** selection (bridge/host/none/custom).
* **Attaching to existing networks**.
* **DNS & Hosts overrides**.

### 3.3 Volumes & Files

* **Anonymous/bind volumes**, named volumes.
* **File push/pull** with archive tools.
* **File management operations** via archive + exec fallback.

### 3.4 Lifecycle & State

* Start, stop (with timeout), restart (with policy).
* Pause/unpause, kill (signal selection).
* Remove container (options: force, volumes).
* Prune stopped containers (age filters).

### 3.5 Observability

* **Logs streaming**: line framing, timestamps, multiplexed stdout/stderr, follow, tail, since/until.
* **Stats streaming**: CPU%, memory usage/limit, IO, network Rx/Tx.
* **Events streaming**: container lifecycle, image pulls, errors.

### 3.6 Exec/Shell

* Create session with TTY and attach; interactive I/O with control over resize.
* Support non-interactive command execution with exit code capture.
* Cancellation support (abort controller).

---

## 4) Security & Safety

### 4.1 Host Security

* Gate any privileged flags by explicit option; default to **non-privileged**.
* Restrict bind mounts to an allowlist (configurable).
* Mask sensitive env vars in logs and events.
* Avoid arbitrary host file reads/writes outside configured roots.

### 4.2 Engine Access

* Support TLS for remote engines.
* Encourage least-privilege when Docker is remote (role separation).

### 4.3 Rate Limits & Quotas

* Optional per-user/per-container quotas in the backend demo (CPU time, memory limits, max containers).
* Request throttling to prevent abuse.

### 4.4 Auditing

* Structured audit logs for create/update/delete/exec/file ops.
* Correlate with request IDs (traceability).

---

## 5) Error Handling & Reliability

### 5.1 Error Taxonomy

* **ConfigurationError** (bad engine host, missing TLS files).
* **AuthError** (registry, engine).
* **NotFound** (image/container).
* **Conflict** (name in use, existing port binding).
* **ResourceError** (limits exceeded).
* **TimeoutError** (pull/start/stop).
* **IOError/StreamError** (socket, archive).

### 5.2 Retries & Backoff

* Image pulls and transient engine calls do **exponential backoff** with caps.
* Idempotency keys for risky operations where appropriate.

### 5.3 Cancellation & Timeouts

* All long-running calls accept a cancellation token and have sensible default timeouts.

---

## 6) Realtime Design

### 6.1 Library-Level Events

* **Event channels** per container ID:

  * `container.status` (created|starting|running|stopped|removed|error)
  * `container.logs` (chunked lines, source=stdout|stderr)
  * `container.stats` (periodic metrics)
  * `container.exec` (session started, output data, exit code)
  * `container.files` (upload/download progress)
  * `image.pull` (status/progress per layer)
* Provide a **subscription API** (subscribe/unsubscribe) with backpressure buffering.

### 6.2 Bridging to Socket.IO (Test App)

* Backend subscribes to the library’s events and **re-emits** to rooms keyed by container ID.
* Frontend **joins rooms** per selected container; updates views in real time.

---

## 7) Configuration & Persistence

### 7.1 Config Objects

* Serializable **ContainerSpec**:

  * Identity: name, labels.
  * Image: name, tag, registry credentials reference.
  * Cmd/Entrypoint.
  * Env: array or map.
  * Resources: cpu/mem/gpu/pids/ulimits.
  * Networking: ports, network mode, networks, dns, hosts.
  * Storage: volumes/binds.
  * Restart policy.
  * Healthcheck (optional v1).

### 7.2 Persistence (Library)

* Library stays stateless; **caller persists** specs if desired.
* Provide **serialization helpers** for saving/loading specs.

---

## 8) Test App — Backend (Express + Socket.IO)

### 8.1 API Endpoints (No Code, Just Scope)

* **Engine Info:** GET engine version/info/df.
* **Images:**

  * List; Pull (with auth); Remove.
* **Containers:**

  * List (filters by status), Inspect.
  * Create (accepts ContainerSpec), Start/Stop/Restart/Pause/Unpause/Kill.
  * Update resources; Rename (optional); Remove; Prune.
* **Logs/Stats:**

  * Start log stream; Stop log stream (or use WS only).
  * Start/stop stats stream.
* **Exec:**

  * Create session; Attach via WS; Resize; Send input; Close; Retrieve exit code.
* **Files:**

  * Upload (archive stream); Download (archive stream); List path; Delete; Mkdir.
* **Registries:**

  * Add/update credentials (saved in-memory for the test app).

### 8.2 Socket.IO Channels

* **Namespace:** `/containers`
* **Rooms:** `container:{id}`
* **Events (server→client):**

  * `status`, `logs`, `stats`, `exec:data`, `exec:exit`, `image:pull`, `files:progress`, `error`
* **Events (client→server):**

  * `subscribe`, `unsubscribe`, `exec:start`, `exec:stdin`, `exec:resize`, `exec:stop`, `logs:follow`, `logs:stop`, `stats:start`, `stats:stop`

### 8.3 Policies

* **Resource limits** enforced server-side from request payload.
* **Basic input validation** on all endpoints.
* **No persistent secrets** (test mode only); redact in logs.

---

## 9) Test App — Frontend (Vite + Tailwind)

### 9.1 Pages/Views

* **Dashboard:**

  * Engine info, disk usage, running/stopped counts.
* **Images:**

  * Pull image (registry optional), pull progress, list/remove.
* **Containers:**

  * **Create wizard**:

    * Image & tag (with optional prior pull).
    * Env editor (key/value, secure flag for masking display).
    * Ports (host↔container), network mode, volumes/binds.
    * Resources (CPU, memory, restart policy).
    * Command/entrypoint.
    * Summary → Deploy.
  * **List/Details**:

    * Status, uptime, ports, mounts, labels.
    * Actions: start/stop/restart/pause/unpause/remove/update resources.
    * **Logs** panel (follow, search, tail size, timestamps).
    * **Stats** panel (live metrics charts).
    * **Terminal** panel (interactive shell via Socket.IO).
    * **Files** browser (upload/download/delete; progress UI).
* **Settings:**

  * Engine connection info (read-only for test), default log tail, default resource presets.

### 9.2 UX Notes

* **Realtime indicators** for container state transitions.
* **Confirmation modals** for destructive actions.
* **Error toasts** with details; copyable request IDs.
* **Accessibility**: keyboard navigation and focus states.
* **Responsive**: panels collapse on smaller screens.

---

## 10) Build, Test, and Quality

### 10.1 Repository Layout (Top-Level)

* `/packages/docker-control` — the library.
* `/test/backend` — Express + Socket.IO server.
* `/test/frontend` — Vite + Tailwind client.
* Shared tooling configs at repo root.

### 10.2 Tooling & Standards

* TypeScript strict mode.
* ESLint + Prettier with consistent rules.
* Commit hooks (lint, typecheck).
* Conventional commits + semantic versioning.

### 10.3 Testing Strategy

* **Unit tests** for specs validation, options parsing, event normalization.
* **Integration tests** (requires Docker):

  * Spin ephemeral containers (e.g., alpine, nginx) to validate create/start/stop, logs, exec, files.
  * Verify stats and events.
* **E2E test** (optional): drive the test app against a local Docker engine.

### 10.4 CI

* Matrix on Linux/macOS/Windows (where possible).
* Job stages: install → lint → typecheck → unit → integration (gated by docker availability).
* Publish dry-run for library on tags.

---

## 11) Performance & Scalability Considerations

* **Streaming**: use backpressure-aware streams for logs/stats/exec; drop strategy for UI if overwhelmed.
* **Batching**: list endpoints support pagination; avoid heavy all-at-once inspection.
* **Resource Presets**: predefined “Small/Medium/Large” container templates for quick provisioning.
* **Cleanup**: scheduled prune for exited containers/images (opt-in in test backend).
* **Timeouts**: sensible defaults for pulls and start/stop.

---

## 12) Observability & Diagnostics

* **Structured logs** with correlation IDs across request → library → engine.
* **Debug hooks** to capture raw Docker API payloads (redacted).
* **Metrics** (optional): operation latency, error rates, bytes streamed.

---

## 13) Documentation Plan

* **README (Library):**

  * What it is, supported Node versions, OS, Docker requirements.
  * How to connect to Engine (socket/TCP/TLS).
  * High-level API sections with option tables (no code).
  * Events and realtime model.
  * Common recipes (pull + run with ports/env/resources; exec shell; stream logs; file upload/download).
  * Error taxonomy and troubleshooting.
* **Test App README:**

  * How to run backend & frontend.
  * .env variables and Docker access requirements.
  * Feature tour: deploy, logs, exec, files, stats.
* **Security Notes:** safe defaults and pitfalls.

---

## 14) Acceptance Criteria

* Library can:

  * Connect to Docker via socket and TCP (optionally TLS).
  * Pull images (with progress), create containers with custom env/resources/ports/volumes, start/stop/restart, remove.
  * Stream logs (follow), stream stats, subscribe to engine events.
  * Perform exec with interactive TTY via streams; support resize and stdin.
  * Upload/download files reliably; report progress.
  * Emit normalized events for all above operations.
* Test app can:

  * Deploy and manage containers end-to-end from UI with realtime feedback.
  * Show live logs and stats.
  * Provide an interactive terminal session to a running container.
  * Browse and transfer files to/from the container.
* Robust error handling with meaningful messages; no silent failures.
* Works on at least one developer machine per OS family (Linux/macOS/Windows with Docker Desktop).

---

## 15) Implementation Notes & Choices (Guidance Only)

* **Engine API Access:** Prefer a mature Docker API client for Node **or** implement a minimal HTTP/stream adapter directly to the Engine API. Ensure full stream support (multiplexed logs, hijacked connections for exec/attach).
* **Validation:** Use a schema validator (e.g., Zod) at the library boundary to protect the Engine from invalid inputs.
* **Tar Handling:** Choose a reliable tar lib for archive streams; consider large file support and path normalization.
* **Sockets:** Ensure proper keep-alive and idle timeouts; handle reconnects for event streams.
* **Windows Support:** Include named pipe connection fallback or recommend TCP for Windows users.
* **Security Defaults:** Non-privileged containers, no host networking by default, mount allowlist off by default in the test app.

---

## 16) Project Plan (Milestones)

1. **M0 – Scaffolding**
   Repo setup, TS config, linting, CI, package workspaces, empty app skeletons.
2. **M1 – Engine Client & Images**
   Connect to engine, image listing/pull with progress events.
3. **M2 – Containers Core**
   Create/start/stop/remove; basic env/ports/volumes/resources; inspect.
4. **M3 – Logs & Events**
   Follow logs streaming; engine events; normalized event bus.
5. **M4 – Exec & Terminal**
   Interactive exec sessions with resize & stdin/out.
6. **M5 – Files**
   Archive upload/download; basic file ops; progress reporting.
7. **M6 – Stats**
   Live container stats; library events.
8. **M7 – Test Backend**
   Express endpoints + Socket.IO bridging all features.
9. **M8 – Test Frontend**
   Vite + Tailwind UI to exercise all flows; polish UX.
10. **M9 – Docs & Stabilization**
    README, examples (descriptive only), error messages, performance tuning.
11. **M10 – Release**
    Versioning, changelog, publish library package.

---

## 17) Risks & Mitigations

* **Engine API differences across versions:** Detect and warn; document minimum required Docker version.
* **Windows stream quirks:** Prefer TCP for reliability; document named pipe limitations.
* **Large log/file streams:** Add size/time limits and UI truncation with download option.
* **Security concerns with exec & mounts:** Default-safe configs; visible warnings for risky settings.
* **Private registry complexity:** Support credential store; surface clear errors.

---

## 18) Future Extensions (Out of Scope v1)

* Multi-host or Docker Context switching UI.
* Networks management (create/remove custom networks).
* Healthcheck authoring and status propagation.
* Image build (Dockerfile) pipelines.
* Auth & RBAC for a multi-user backend.
* Persistent DB for container specs/history.

---

This outline gives the software engineer a **clear, high-level blueprint** to implement the TypeScript library and the realtime demo app without prescribing code. It defines capabilities, API surface, events, security, testing, and delivery milestones to complete the task efficiently.
