# NanoClaw Multi-Team B2B Architecture

## Context

NanoClaw is currently a personal AI assistant: one WhatsApp number, one set of Google credentials (Gmail/Calendar/Drive) mounted only for the main (self-chat) group. The goal is to transform it into an on-premises B2B product where:

- **Each team** gets an isolated WhatsApp group + dedicated Google Workspace account (email, calendar, drive)
- **Teams cannot** access other teams' resources (enforced at the container mount level, not app-level permissions)
- **Admin group** has full CRUD across ALL teams' resources
- **Backward compatible**: no org config = current personal mode, unchanged

The existing architecture already provides 80% of what's needed: per-group containers, filesystem isolation, IPC namespacing, and a main/non-main privilege split. The changes are surgical, not a rewrite.

### Decisions

- **Google auth**: Per-team OAuth (run OAuth flow per team during setup, works with existing MCP servers)
- **Admin group**: WhatsApp group from org config (not self-chat DM). Self-chat still works in personal mode.

---

## Architecture: What Changes

```
BEFORE (Personal Mode)                    AFTER (Org Mode)
─────────────────────                     ────────────────
Main (self-chat) → Gmail/Cal/Drive        Admin Group (WhatsApp group) → ALL teams' Gmail/Cal/Drive
Group A → no Google access                Team CS → support@ Gmail/Cal/Drive only
Group B → no Google access                Team Ops → ops@ Gmail/Cal/Drive only
                                          Team Acct → accounting@ Gmail/Cal/Drive only
```

**Key insight**: Team isolation is already enforced by container mounts. Today, only main gets Google credentials mounted. The change is: **every team gets their own credentials mounted, and admin gets all of them.**

---

## Phase 1: Organization Config Schema

**Goal**: Declarative YAML config that maps teams → WhatsApp groups + credential paths + Drive scopes.

### New dependency
- `yaml` npm package (parse YAML config files)

### Files to create

**`src/org-config.ts`** (~120 lines)
- Zod schema for org config validation
- `loadOrgConfig(path?)` — loads and validates YAML, returns typed config or null
- Config path: `ORG_CONFIG_PATH` env var, default `config/organization.yaml`
- If file doesn't exist, returns null (personal mode, no behavior change)

**`config/organization.example.yaml`** — documented template

### Types to add to `src/types.ts`

```typescript
interface OrgConfig {
  organization: { id: string; name: string };
  admin: {
    whatsapp_jid?: string;        // WhatsApp group JID (or auto-detect from group name)
    whatsapp_group_name?: string;  // Match by name if JID unknown
    model?: string;                // Default: primary CLAUDE_MODEL
  };
  teams: TeamConfig[];
}

interface TeamConfig {
  id: string;                      // e.g., "customer-service"
  name: string;                    // e.g., "Customer Service"
  whatsapp_jid?: string;
  whatsapp_group_name?: string;
  email?: string;                  // e.g., "support@acme.com"
  credentials: {
    gmail?: string;                // Host path to gmail-mcp credentials dir
    calendar?: string;             // Host path to calendar-mcp tokens dir
    drive?: string;                // Host path to drive-mcp tokens dir
  };
  drive_folders?: Array<{
    id: string;
    name: string;
    access: 'read-write' | 'read-only';
  }>;
  model?: string;                  // Override model for this team
}
```

### Example config

```yaml
organization:
  id: acme-corp
  name: Acme Corporation

admin:
  whatsapp_group_name: "Acme Management"
  model: claude-opus-4-6

teams:
  - id: customer-service
    name: Customer Service
    whatsapp_group_name: "Acme CS Team"
    email: support@acme.com
    credentials:
      gmail: /etc/nanoclaw/acme/cs/gmail-mcp
      calendar: /etc/nanoclaw/acme/cs/calendar-mcp
      drive: /etc/nanoclaw/acme/cs/drive-mcp
    drive_folders:
      - id: "1a2b3c4d"
        name: Customer Support
        access: read-write
      - id: "3c4d5e6f"
        name: Company Policies
        access: read-only

  - id: operations
    name: Operations
    whatsapp_group_name: "Acme Ops Team"
    email: ops@acme.com
    credentials:
      gmail: /etc/nanoclaw/acme/ops/gmail-mcp
      calendar: /etc/nanoclaw/acme/ops/calendar-mcp
      drive: /etc/nanoclaw/acme/ops/drive-mcp
```

### Tests (`src/__tests__/org-config.test.ts`)
- Load valid org config → returns typed OrgConfig
- Missing file → returns null (personal mode)
- Invalid config (missing org.id, duplicate team IDs, empty teams) → throws with clear error
- Team lookup by JID and by group name
- Admin detection by JID and by group name

---

## Phase 2: Per-Team Credential Mounting & MCP Loading

**Goal**: Each team's container gets its own Google credentials. Admin container gets ALL teams' credentials. Agent runner loads MCP servers dynamically based on what's mounted.

### Host side: `src/container-runner.ts`

**Modify `buildVolumeMounts()`** — currently takes `(group, isMain)`. Change to also accept org config context:

```
buildVolumeMounts(group, isMain, orgContext?: { teamConfig?: TeamConfig; isAdmin?: boolean; allTeams?: TeamConfig[] })
```

**For team containers** (when `orgContext.teamConfig` exists):
- Mount team's `credentials.gmail` → `/home/node/.gmail-mcp` (rw)
- Mount team's `credentials.calendar` → `/home/node/.config/google-calendar-mcp` (rw)
- Mount team's `credentials.drive` → `/home/node/.config/google-drive-mcp` (rw)
- Only mount if the credential path exists on host

**For admin container** (when `orgContext.isAdmin`):
- Mount each team's credentials at namespaced paths:
  - `team.credentials.gmail` → `/home/node/.gmail-mcp-{team.id}` (rw)
  - `team.credentials.calendar` → `/home/node/.config/google-calendar-mcp-{team.id}` (rw)
  - `team.credentials.drive` → `/home/node/.config/google-drive-mcp-{team.id}` (rw)
- Also mount admin's own credentials at the default paths (if admin has its own email)

**Extend `ContainerInput`**:
```typescript
interface ContainerInput {
  // ... existing fields
  isAdmin?: boolean;              // Org mode: this is the admin group
  teamId?: string;                // Org mode: team identifier
  orgTeamIds?: string[];          // Org mode (admin only): all team IDs for multi-MCP loading
  teamEmail?: string;             // Org mode: team's email address (for CLAUDE.md context)
}
```

**Modify admin detection in `src/index.ts`**:
- Load org config on startup
- When processing a message, check if the chat JID matches admin group from config
- Set `isAdmin: true` on ContainerInput (replaces `isMain` for privilege escalation)
- For backward compatibility: `isMain || isAdmin` grants elevated access
- Map JIDs → team IDs using org config

### Container side: `container/agent-runner/src/index.ts`

**Modify `buildQueryOptions()`**:

For **team containers** (non-admin): Remove the `input.isMain` guard on MCP loading. Instead, check if credentials exist at the standard paths:
```typescript
// Before: if (input.isMain && fs.existsSync(gmailCredsPath))
// After:  if (fs.existsSync(gmailCredsPath))
```
This works because the host only mounts credentials if the team has them configured.

For **admin containers** (`input.isAdmin`): Discover and load multiple MCP instances:
```typescript
if (input.isAdmin && input.orgTeamIds) {
  for (const teamId of input.orgTeamIds) {
    const teamGmailCreds = `/home/node/.gmail-mcp-${teamId}/credentials.json`;
    if (fs.existsSync(teamGmailCreds)) {
      mcpServers[`gmail-${teamId}`] = {
        command: 'npx',
        args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
        env: { /* credential path overrides */ }
      };
    }
    // Same pattern for calendar, drive
  }
}
```

**Update `allowedTools`** to include dynamic team-scoped MCP patterns:
```typescript
allowedTools: [
  // ... existing tools
  'mcp__gmail__*',           // Team's own Gmail
  'mcp__gmail-*__*',         // Admin: per-team Gmail (gmail-cs, gmail-ops, etc.)
  'mcp__google-calendar__*',
  'mcp__google-calendar-*__*',
  'mcp__gdrive__*',
  'mcp__gdrive-*__*',
]
```

### Key detail: MCP credential path configuration

The Gmail MCP server (`@gongrzhe/server-gmail-autoauth-mcp`) reads credentials from `~/.gmail-mcp/` by default. Need to verify if it supports overriding via env var. If not, two options:
1. Symlink per-team credential dirs to `~/.gmail-mcp/` before launching each MCP instance
2. Fork/wrap the MCP server to accept a configurable path

**Action**: During implementation, test the MCP server's configurability. If env-based config isn't supported, use a small wrapper script that sets up the expected paths before launching.

### Tests
- `src/__tests__/container-runner.test.ts` (new or extend existing):
  - Team container gets only its own credentials mounted
  - Admin container gets all teams' credentials at namespaced paths
  - No org config = current behavior unchanged
  - Missing credential paths are skipped gracefully
- `container/agent-runner/src/__tests__/mcp-loading.test.ts`:
  - Team loads MCP when credentials exist at standard path
  - Team does NOT load MCP when no credentials mounted
  - Admin loads multiple MCP instances for all teams
  - Tool allowlist includes team-scoped patterns

---

## Phase 3: Admin CLAUDE.md & Team Context

**Goal**: Admin and team containers get context about the org structure so the agent knows what teams exist and what it can do.

### Admin container context

Before running the admin container, write org context to `/workspace/ipc/org_context.json`:
```json
{
  "organization": "Acme Corporation",
  "role": "admin",
  "teams": [
    { "id": "customer-service", "name": "Customer Service", "email": "support@acme.com" },
    { "id": "operations", "name": "Operations", "email": "ops@acme.com" },
    { "id": "accounting", "name": "Accounting", "email": "accounting@acme.com" }
  ],
  "capabilities": [
    "Read/send email as any team (use mcp__gmail-{teamId}__* tools)",
    "Search Drive across all teams (use mcp__gdrive-{teamId}__* tools)",
    "Manage calendars for all teams (use mcp__google-calendar-{teamId}__* tools)"
  ]
}
```

### Team container context

Write team-specific context to `/workspace/ipc/org_context.json`:
```json
{
  "organization": "Acme Corporation",
  "role": "team",
  "team": { "id": "customer-service", "name": "Customer Service", "email": "support@acme.com" },
  "capabilities": [
    "Read/send email for support@acme.com (use mcp__gmail__* tools)",
    "Access team Drive folders (use mcp__gdrive__* tools)"
  ]
}
```

### Agent runner reads context

In `container/agent-runner/src/index.ts`, read `/workspace/ipc/org_context.json` if it exists and prepend it to the system prompt (via the `systemPrompt` option or by prepending to the user prompt).

---

## Phase 4: Admin Cross-Team IPC Tools (Future)

**Goal**: Admin can route work between teams, override actions, view audit logs.

This phase is **not required for MVP** but listed for completeness:

- **`route_to_team`** IPC tool: Admin sends a message/task to a specific team's WhatsApp group
- **`query_all_teams`** IPC tool: Admin queries a resource across all teams (aggregated results)
- **Action approval workflow**: Team actions above a threshold get queued for admin approval before execution
- **Audit logging**: Record all MCP tool invocations per team to SQLite `audit_log` table

---

## Phase 5: Setup Skill (Future)

Extend `/setup` or create `/setup-org` skill:
1. Interactive org config creation (prompts for team names, emails, group names)
2. Per-team OAuth flow (runs Gmail/Calendar/Drive OAuth for each team, stores credentials)
3. Generates `config/organization.yaml`
4. Validates all credentials work

---

## Implementation Order

| # | Phase | Scope | Approach |
|---|-------|-------|----------|
| 1 | Org Config Schema | `src/org-config.ts`, `src/types.ts`, tests | Solo, TDD |
| 2 | Credential Mounting + MCP Loading | `src/container-runner.ts`, `container/agent-runner/src/index.ts`, `src/index.ts`, tests | Solo, TDD |
| 3 | Admin & Team Context | `src/container-runner.ts`, `container/agent-runner/src/index.ts` | Solo, small |
| 4 | Admin Cross-Team IPC | Future phase | TBD |
| 5 | Setup Skill | Future phase | TBD |

Phases 1-3 are the MVP. ~400-500 lines of new/modified code across 5-6 files.

---

## Files Modified (MVP)

| File | Change |
|------|--------|
| `src/types.ts` | Add `OrgConfig`, `TeamConfig` interfaces |
| `src/org-config.ts` | **NEW** — Zod schema, YAML loading, validation |
| `src/config.ts` | Add `ORG_CONFIG_PATH` constant |
| `src/container-runner.ts` | Per-team credential mounting, admin multi-mount, extend `ContainerInput` |
| `src/index.ts` | Load org config, admin detection from config, pass team context to container |
| `container/agent-runner/src/index.ts` | Remove `isMain` guard on MCP, admin multi-MCP loading, org context injection |
| `config/organization.example.yaml` | **NEW** — documented template |
| `src/__tests__/org-config.test.ts` | **NEW** — config validation tests |
| `src/__tests__/container-runner-org.test.ts` | **NEW** — per-team mount tests |
| `package.json` | Add `yaml` dependency |

---

## Verification

### Unit tests
```bash
npm test  # All existing + new tests pass
```

### Manual integration test
1. Create `config/organization.yaml` with 2 teams (can use existing groups)
2. Set up Gmail OAuth for each team's email (store creds at configured paths)
3. Start NanoClaw: `npm run dev`
4. Send message in Team A's WhatsApp group → verify it can read Team A's email, NOT Team B's
5. Send message in Admin group → verify it can read BOTH teams' email
6. Verify personal mode still works (rename/remove org config, restart)

### Container build
```bash
./container/build.sh  # Rebuild after agent-runner changes
```
