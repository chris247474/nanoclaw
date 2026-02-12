# NanoClaw Distribution & Multi-Machine Architecture

## Context

NanoClaw is currently a single-user, single-machine personal assistant (Node.js + Apple Container on macOS). The goal is to package it as a distributable B2B product where:

- A business owner downloads an installer from a website
- Installs on multiple machines: one **admin** (central hub), others **workers** (run agents)
- Supports **on-prem** (customer's hardware) and **hosted** (our VPS, fully managed)
- Works on **macOS, Linux, and Windows** (via Docker as the universal runtime)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                 ADMIN MACHINE                     │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │         Docker Compose Stack                │  │
│  │                                             │  │
│  │  ┌───────────┐  ┌────────────────────────┐  │  │
│  │  │  Web UI   │  │   NanoClaw Core        │  │  │
│  │  │  (SPA)    │←→│   - WhatsApp bridge    │  │  │
│  │  │  :3000    │  │   - Message router     │  │  │
│  │  └───────────┘  │   - Task scheduler     │  │  │
│  │                 │   - API server (:4000)  │  │  │
│  │                 │   - Worker manager      │  │  │
│  │                 │   - Local agent runner  │  │  │
│  │                 └────────┬───────────────┘  │  │
│  │                          │                  │  │
│  │                 ┌────────┴───────────────┐  │  │
│  │                 │  SQLite (data volume)  │  │  │
│  │                 └────────────────────────┘  │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────┬────────────────────────────┘
                       │ WebSocket (wss://)
                       ▼
┌──────────────────────────────────────────────────┐
│              WORKER MACHINE(S)                    │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │         Docker Compose Stack                │  │
│  │                                             │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │  NanoClaw Worker                       │ │  │
│  │  │  - Connects to admin via WebSocket     │ │  │
│  │  │  - Receives agent tasks                │ │  │
│  │  │  - Spawns agent containers (Docker)    │ │  │
│  │  │  - Relays IPC back to admin            │ │  │
│  │  │  - Reports health/status               │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Standalone mode**: Admin with no workers = current single-machine behavior. The admin runs agents locally via Docker-in-Docker (or Docker socket mount).

---

## Implementation Phases

### Phase 1: Dockerize + Web Dashboard (MVP-a)
> Goal: NanoClaw runs entirely in Docker with a web UI for setup. Single machine, no workers yet.

#### 1a. Main App Dockerfile
Create `Dockerfile` (root) to containerize the host process:
- Base: `node:22-slim`
- Installs `better-sqlite3` natively during build
- Mounts Docker socket (`/var/run/docker.sock`) so it can spawn agent containers
- Volumes: `store/`, `groups/`, `data/`, `logs/`, `config/`
- Entrypoint: `node dist/index.js`

#### 1b. Docker Compose (standalone mode)
Create `docker-compose.yml`:
```yaml
services:
  nanoclaw:
    build: .
    ports:
      - "3000:3000"   # Web dashboard
      - "4000:4000"   # API (internal, future worker use)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Docker-in-Docker
      - nanoclaw-data:/app/data
      - nanoclaw-store:/app/store
      - nanoclaw-groups:/app/groups
      - nanoclaw-config:/app/config
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ASSISTANT_NAME=${ASSISTANT_NAME:-Andy}
      - CONTAINER_RUNTIME=docker
    restart: unless-stopped

volumes:
  nanoclaw-data:
  nanoclaw-store:
  nanoclaw-groups:
  nanoclaw-config:
```

#### 1c. Container Runtime Abstraction
Refactor `src/container-runner.ts`:
- Extract `ContainerRuntime` interface with `spawn(image, args, mounts, input): Promise<ContainerOutput>`
- `DockerRuntime` implementation: uses `docker run` instead of `container run`
- `AppleContainerRuntime`: existing behavior (for dev use on macOS)
- Select runtime based on `CONTAINER_RUNTIME` env var (default: auto-detect)
- Key difference: Docker uses `-v host:container:ro` syntax; Apple Container uses `--mount type=bind,...,readonly`

**Files to modify:**
- `src/container-runner.ts` — extract runtime interface, add DockerRuntime
- `src/config.ts` — add `CONTAINER_RUNTIME` config
- `src/index.ts` — replace `ensureContainerSystemRunning()` with runtime-aware check

#### 1d. API Server
Add an HTTP API server to `src/index.ts` (or extract to `src/api.ts`):
- Framework: Fastify (lightweight, TypeScript-native) or plain `http` module
- New dependency: `fastify` (or stick with Node `http` + manual routing to avoid deps)
- Endpoints:
  - `GET /api/status` — connection state, uptime, active agents
  - `GET /api/qr` — current QR code as base64 (for web UI auth)
  - `POST /api/qr/retry` — force new QR code
  - `GET /api/groups` — registered groups
  - `POST /api/groups` — register a group
  - `GET /api/tasks` — scheduled tasks
  - `GET /api/config` — current org config
  - `PUT /api/config` — update org config
  - `WS /ws` — WebSocket for real-time updates (QR changes, message events, agent status)

#### 1e. Web Dashboard
Minimal web UI served by the API server:
- **Tech**: Preact + HTM (no build step needed, serves from `public/` dir) OR server-rendered HTML. Keep it dead simple — no React/Next.js/Vite build pipeline.
- **Pages**:
  - **Setup Wizard** (first-run): QR code display → scan → connected
  - **Dashboard**: connection status, recent messages, active agents
  - **Groups**: list registered groups, register new ones
  - **Teams**: org config editor (if org mode)
  - **Settings**: assistant name, model, API keys
- Ship as static files in `public/` bundled into the Docker image

#### 1f. Replace QR Terminal with Web QR
Currently QR code prints to terminal via `qrcode-terminal`. In Docker, there's no terminal.
- Emit QR code data over the WebSocket API
- Web dashboard renders QR code in browser
- Keep terminal fallback for `npm run dev` mode

---

### Phase 2: Admin/Worker Split (MVP-b)
> Goal: Non-admin machines can connect to admin and run agent containers remotely.

#### 2a. Worker Manager (admin side)
New module `src/worker-manager.ts`:
- Accepts WebSocket connections from workers at `WS /ws/worker`
- Worker auth: API key generated during admin setup (shown in dashboard, copy-paste to worker)
- Tracks connected workers: id, name, status, capacity, last heartbeat
- Task dispatch: when a message triggers an agent, admin decides where to run it:
  - If workers connected → dispatch to least-loaded worker
  - If no workers → run locally (standalone mode)
- Receives agent results from workers, processes IPC (send_message, schedule_task, etc.)

#### 2b. Worker Service
New entry point `src/worker.ts`:
- Connects to admin WebSocket URL with API key
- Receives task assignments: `{ type: 'run_agent', input: ContainerInput, mounts: [...] }`
- Spawns agent container locally via Docker
- Streams agent output back to admin
- Relays IPC file writes: instead of writing to local filesystem, sends IPC JSON over WebSocket to admin
- Reports health metrics (CPU, memory, active containers)

#### 2c. IPC Relay
The biggest architectural change. Currently IPC is filesystem-based (agent writes JSON to `/workspace/ipc/`). On a worker, the admin can't read those files.

**Solution**: Worker watches the IPC directories (same polling as current `processIpcMessages`) and relays each IPC message over WebSocket to the admin. The admin processes them as if they were local.

- Worker mounts a temp dir as `/workspace/ipc/` for the container
- Worker polls that dir (same 1s interval)
- Worker sends IPC messages to admin: `{ type: 'ipc', groupFolder, ipcMessage }`
- Admin processes as normal (sends WhatsApp messages, schedules tasks, etc.)

#### 2d. Worker Docker Compose
Create `docker-compose.worker.yml`:
```yaml
services:
  worker:
    image: nanoclaw/worker:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - worker-data:/app/data
    environment:
      - ADMIN_URL=wss://admin-ip:4000/ws/worker
      - WORKER_API_KEY=${WORKER_API_KEY}
      - WORKER_NAME=${WORKER_NAME:-worker-1}
    restart: unless-stopped

volumes:
  worker-data:
```

#### 2e. Dashboard Updates
- **Workers page**: list connected workers, status, capacity
- **Worker setup**: generate API key, show connection instructions
- **Agent runs**: show which worker executed each agent run

---

### Phase 3: Installer & Distribution
> Goal: One-command install experience for business owners.

#### 3a. Install Script
`install.sh` (hosted at `https://get.nanoclaw.com/install`):
```bash
curl -fsSL https://get.nanoclaw.com/install | bash
```

The script:
1. Detects OS (macOS, Linux, Windows/WSL)
2. Checks Docker is installed (offers to install via official script)
3. Asks role: **Admin** or **Worker**
4. If Admin:
   - Pulls `nanoclaw/core:latest` and `nanoclaw/agent:latest` images
   - Creates `~/nanoclaw/` directory with docker-compose.yml and .env template
   - Prompts for ANTHROPIC_API_KEY and ASSISTANT_NAME
   - Runs `docker compose up -d`
   - Opens browser to `http://localhost:3000` for setup wizard
5. If Worker:
   - Prompts for admin URL and API key
   - Pulls `nanoclaw/worker:latest` and `nanoclaw/agent:latest` images
   - Creates `~/nanoclaw/` directory with docker-compose.worker.yml
   - Runs `docker compose up -d`
   - Shows "Connected to admin" confirmation

#### 3b. Docker Hub Images
Publish pre-built images:
- `nanoclaw/core:latest` — main app (admin/standalone)
- `nanoclaw/worker:latest` — worker service
- `nanoclaw/agent:latest` — agent container (Claude SDK + browser)
- Multi-arch: `linux/amd64` + `linux/arm64` (for Apple Silicon + AWS Graviton)

#### 3c. Landing Page
Static website at `nanoclaw.com`:
- Product description and screenshots
- "Get Started" button → install instructions
- Pricing (if applicable)
- Docs: setup guide, team configuration, troubleshooting

---

### Phase 4: Hosted Version (Future)
> Goal: Fully managed — customer scans QR, we run everything.

#### 4a. Multi-Tenant Admin
- Single admin instance serves multiple customers
- Each customer = isolated org with own WhatsApp connection, groups, DB
- Customer data isolation via separate Docker volumes or namespaced storage
- Customer onboarding: sign up → scan QR → configure teams → done

#### 4b. VPS Infrastructure
- Docker Compose on a VPS (DigitalOcean, Hetzner, etc.)
- Reverse proxy (Caddy/Traefik) for HTTPS + customer subdomain routing
- Monitoring: health checks, uptime, resource usage
- Backup: automated SQLite/volume snapshots

#### 4c. Billing
- Usage-based: per agent invocation or per team/month
- Stripe integration for payment
- Usage tracking in DB

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Container runtime | Docker everywhere | Cross-platform, well-known, business owners already have it or can install it |
| Admin/Worker comm | WebSocket | Real-time bidirectional (agent streaming, IPC relay, health checks) |
| Worker auth | API key (admin-generated) | Simple, no PKI needed for on-prem |
| Web dashboard | Preact + HTM (no build step) | Ships as static files, no JS build pipeline, keeps the project minimal |
| API framework | Fastify | Lightweight, fast, good TypeScript support, WebSocket built-in |
| Distribution | Docker Compose + shell installer | Works on all platforms, no native packaging (.pkg/.deb/.exe) needed |
| Database | SQLite (on-prem), PostgreSQL (hosted) | SQLite is zero-config for on-prem; Postgres for multi-tenant hosted |

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `Dockerfile` (root) | Containerize the main NanoClaw app |
| `docker-compose.yml` | Admin/standalone stack |
| `docker-compose.worker.yml` | Worker stack |
| `src/api.ts` | HTTP API server + WebSocket |
| `src/worker.ts` | Worker entry point (connects to admin) |
| `src/worker-manager.ts` | Admin-side worker coordination |
| `src/runtime/docker.ts` | Docker container runtime implementation |
| `src/runtime/interface.ts` | ContainerRuntime interface |
| `public/index.html` | Web dashboard SPA |
| `public/app.js` | Dashboard JS (Preact + HTM, no build) |
| `install.sh` | Cross-platform installer script |

### Modified Files
| File | Changes |
|------|---------|
| `src/container-runner.ts` | Extract runtime interface, use runtime abstraction |
| `src/config.ts` | Add CONTAINER_RUNTIME, API_PORT, ROLE configs |
| `src/index.ts` | Start API server, connect worker manager, runtime-aware startup |
| `package.json` | Add fastify dependency |
| `container/Dockerfile` | No changes (already Docker-compatible) |
| `container/build.sh` | Add `docker build` path alongside `container build` |

---

## Verification Plan

### Phase 1 Testing
1. `docker compose up` starts NanoClaw, accessible at localhost:3000
2. Web dashboard shows QR code, scans successfully
3. Agent containers spawn via Docker (not Apple Container)
4. Messages route and agents respond as before
5. Test on macOS (Docker Desktop) and Linux (Docker Engine)

### Phase 2 Testing
1. Start admin on machine A, worker on machine B (same network)
2. Worker connects to admin, shows in dashboard
3. Trigger a message — admin dispatches to worker
4. Worker runs agent, IPC relays back, WhatsApp message sent
5. Test worker disconnect/reconnect behavior
6. Test standalone mode (admin with no workers, runs agents locally)

### Phase 3 Testing
1. Run `curl -fsSL .../install | bash` on fresh macOS, Linux, Windows/WSL machines
2. Installer detects OS, installs Docker if needed, sets up role
3. Admin setup wizard completes end-to-end
4. Worker connects to admin successfully
