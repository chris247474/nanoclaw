# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in Docker containers. Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main app: WhatsApp connection, message routing, IPC |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Orchestrated Agent Team Pattern

### Overview

This defines the pattern for coordinating multi-agent software development. An **orchestrator agent** manages the entire workflow, delegating work to **parallel agents** that follow Test-Driven Development (TDD). Parallel agents may further delegate isolated, trivial subtasks to **sub-agents**. Every level enforces shared contracts, worktree isolation, and TDD discipline.

---

### 1. Hierarchy & Responsibilities

```
ORCHESTRATOR (Opus 4.6 extended thinking)
│  Owns: planning, contracts, PR review, merge gating, context forwarding
│
├── Parallel Agent A (Sonnet 4.5 extended thinking, own worktree + feature branch)
│   │  Owns: TDD cycle, PR to develop, sub-agent coordination
│   ├── Sub-Agent A1 (Haiku 4.5 extended thinking, commits to Agent A's branch)
│   └── Sub-Agent A2 (Haiku 4.5 extended thinking, commits to Agent A's branch)
│
├── Parallel Agent B (Sonnet 4.5 extended thinking, own worktree + feature branch)
│   └── Sub-Agent B1 (Haiku 4.5 extended thinking, commits to Agent B's branch)
│
└── Parallel Agent C (Sonnet 4.5 extended thinking, own worktree + feature branch)
    └── (no sub-agents — task is small enough)
```

#### 1.1 Orchestrator Agent (Opus 4.6 Extended Thinking)

The orchestrator is the main Claude Code session. It never writes feature code directly (except Phase 0 shared contracts). It:

1. **Plans the scope of work** — produces the Orchestration & Parallelization Matrix (see Section 6)
2. **Defines shared contracts** (Phase 0) — interfaces, types, protocols that all agents import
3. **Creates branches and worktrees** for each parallel agent before launching them
4. **Reviews PRs** from parallel agents — runs full test suite, inspects code quality, verifies requirements adherence
5. **Gates between phases** — only proceeds to the next phase after all current-phase PRs are merged and green
6. **Feeds context forward** — provides actual merged code (not specs) to downstream agents
7. **Cleans up** — removes worktrees after merging each phase

#### 1.2 Parallel Agents (Sonnet 4.5 Extended Thinking)

Each parallel agent works in its own git worktree on its own feature branch. It:

1. **Follows TDD strictly** — investigate → write failing tests → minimal logic to pass → run all tests
2. **Creates a PR to develop** when complete (does NOT merge — orchestrator merges)
3. **May spawn sub-agents** for isolated, parallelizable subtasks (see Section 2 for criteria)
4. **Owns sub-agent coordination** — handles merge conflicts from sub-agents, runs full test suite before PR
5. **Commits are atomic and well-described** — each commit should represent a logical unit of work

#### 1.3 Sub-Agents (Haiku 4.5 Extended Thinking)

Sub-agents are optional. They handle trivial, isolated subtasks delegated by a parallel agent. They:

1. **Commit to the parent agent's branch in the parent agent's worktree** — they do NOT get their own branch or worktree
2. **Follow TDD** — even trivial tasks get a failing test first
3. **Never interact with other sub-agents** — if coordination is needed, it's not a sub-agent task
4. **Return control to the parent agent** — the parent reviews, resolves conflicts, and runs the full suite

---

### 2. When to Use Each Pattern

**Use a Solo Agent (no team) when:**
- The task is self-contained (single module, no cross-module interfaces)
- No other agent's output will affect this agent's implementation
- The task is pure research, exploration, or a single-file change
- Bug fixes (follow TDD directly, no sub-agents needed)

**Use an Agent Team when:**
- 3+ modules will produce code that must interoperate
- Tasks define types/interfaces consumed by other tasks
- There's a dependency graph (A's output feeds B's input)
- Integration risk is high (merge conflicts, type mismatches, interface drift)

**Spawn Sub-Agents only when ALL of these are true:**
- The subtask is **parallelizable** — no dependency on other concurrent work
- The subtask is **isolated** — touches a single module or file set with no cross-cutting concerns
- The subtask is **small** — can be completed in one focused pass (logic libraries, utility functions, minor fixes)
- The subtask requires **no complex investigation** — the problem and solution are well-understood
- The **token savings justify the overhead** — spawning a sub-agent has coordination cost; if the task takes fewer tokens to do inline, do it inline

---

### 3. Test-Driven Development Protocol (Mandatory at Every Level)

Every agent and sub-agent follows the same TDD cycle. No code is written without a failing test first.

#### TDD Cycle

```
1. INVESTIGATE  → Understand the problem, read existing code, identify affected areas
2. WRITE TESTS  → Write tests that describe the expected fixed/new behavior
3. VERIFY FAIL  → Run the tests — they MUST fail (proves the behavior doesn't exist yet)
4. IMPLEMENT    → Write the minimal code to make the failing tests pass
5. VERIFY PASS  → Run the new tests — they MUST pass
6. REGRESSION   → Run the FULL test suite — nothing else should break
7. COMMIT       → Atomic commit with descriptive message
```

#### Test Hierarchy

| Test Type | Scope | When to Write |
|-----------|-------|---------------|
| **Unit tests** | Single function/class, mocked dependencies | Always — every agent writes these |
| **Integration tests** | Module interactions, API endpoints, DB queries | When the task involves cross-module behavior |
| **E2E tests** | Full user-facing workflow | When the task changes user-visible behavior |

#### TDD Rules

- **Tests encode intended behavior.** If tests fail after a merge, fix the implementation to match the tests. Only change tests with explicit user approval — explain what the test verifies and why it should change.
- **Failing tests are a feature.** A test that passes before you write code means it's not testing the new behavior.
- **Minimal implementation.** Don't gold-plate. Write the least code needed to make tests green.
- **No skipping the regression run.** Every commit must have a passing full suite. Broken windows compound.

---

### 4. Git Branching & Worktree Strategy

#### Branch Naming Convention

```
claude/feat-<phase#><agent-letter>-<description>    # features
claude/fix-<description>                             # bug fixes
```

Examples: `claude/feat-1a-auth-service`, `claude/feat-2b-api-routes`, `claude/fix-login-race`

#### Worktree Isolation (REQUIRED for parallel agents)

Parallel agents share the host filesystem. If one agent checks out a branch, it moves the working tree for all others. **Every parallel agent MUST work in its own git worktree.**

**Orchestrator creates branches AND worktrees before launching agents:**

```bash
# From the main repo directory:
git branch claude/feat-1a-description develop
git branch claude/feat-1b-description develop

git worktree add ../<repo-name>-feat-1a claude/feat-1a-description
git worktree add ../<repo-name>-feat-1b claude/feat-1b-description
```

**Worktree naming convention:**
```
../<repo-name>-feat-<phase><letter>
```
Worktrees live as **siblings of the main repo directory** (one level up), not inside the repo.

**Each agent's prompt MUST include the worktree absolute path.** The agent works exclusively in that directory — all file reads, writes, test runs, and git commits happen there.

**Sub-agents do NOT get their own worktrees.** They commit directly to the parent agent's branch in the parent agent's worktree. The parent agent coordinates sequential access if needed.

**Worktree cleanup (orchestrator does this AFTER merging each phase):**
```bash
git worktree remove ../<repo-name>-feat-1a
git worktree remove ../<repo-name>-feat-1b
```

#### PR & Merge Protocol

Each parallel agent's workflow ends with a PR to `develop`:

```
1. Agent completes TDD cycle for all subtasks
2. Agent resolves any sub-agent merge conflicts on its branch
3. Agent pulls latest develop into its branch, resolves conflicts
4. Agent runs the FULL test suite — must pass
5. Agent creates PR to develop (using gh pr create)
6. Orchestrator reviews the PR:
   a. Runs full test suite independently
   b. Reviews code quality and requirements adherence
   c. If issues found → sends agent back with specific feedback
   d. If clean → merges PR to develop
7. Orchestrator removes the agent's worktree
```

**Merge order:** Orchestrator merges PRs in order of least → most conflict-prone. After each merge, the full test suite runs. If tests fail, fix the implementation (not the tests).

---

### 5. Model Strategy & Token Efficiency

#### Model Assignment

| Role | Model | Reasoning |
|------|-------|-----------|
| **Orchestrator** | Opus 4.6 extended thinking | Architectural decisions, PR review, integration debugging, context management |
| **Parallel agents** | Sonnet 4.5 extended thinking | Well-scoped tasks with clear contracts — capable enough at ~5x less cost |
| **Sub-agents** | Haiku 4.5 extended thinking | Trivial, isolated subtasks — mechanical work at ~25x less cost than Opus |

#### Token Efficiency Rules

1. **Don't spawn agents for work you can do faster inline.** If a task takes 500 tokens to describe to a sub-agent and 300 tokens to just do, do it yourself.
2. **Sub-agents are not free.** Each spawn has prompt overhead (context, instructions, contracts). Only spawn when the parallelism or isolation benefit outweighs this cost.
3. **Prefer fewer, larger agents over many small ones.** 3 well-scoped parallel agents beat 8 micro-agents. Each agent needs full context loading.
4. **Feed actual code, not prose descriptions.** Reading a 200-line file into a prompt is cheaper than the agent guessing wrong and needing a retry.
5. **Orchestrator should batch reviews.** Review multiple agent outputs in sequence rather than spawning review sub-agents.
6. **Kill agents that are stuck.** If an agent is spinning (repeated failures, wrong approach), terminate it, adjust the prompt, and relaunch. Don't let it burn tokens.

#### Task Tool Configuration

```
# Parallel agent
Task(
    description="Build auth service",
    prompt="...",
    subagent_type="general-purpose",
    model="sonnet"
)

# Sub-agent (spawned BY a parallel agent)
Task(
    description="Add input validators",
    prompt="...",
    subagent_type="general-purpose",
    model="haiku"
)
```

---

### 6. Orchestration & Parallelization Matrix

Every scope of work MUST begin with a matrix that maps the full task breakdown. This matrix identifies what runs in parallel vs sequentially, and at which level of the hierarchy.

#### Matrix Template

```
SCOPE: [Feature/Epic Name]

PHASE 0 — Shared Contracts (Orchestrator, sequential)
├── [ ] Define interfaces and shared types
├── [ ] Commit to develop
└── Estimated tokens: [low/medium]

PHASE 1 — Independent Work (Parallel Agents)
┌─────────────────────────────────────────────────────────────────┐
│ Agent A: [Task Name]          │ Agent B: [Task Name]            │
│ Branch: claude/feat-1a-xxx    │ Branch: claude/feat-1b-xxx      │
│ Model: Sonnet 4.5 ET          │ Model: Sonnet 4.5 ET            │
│ Deps: Phase 0 contracts       │ Deps: Phase 0 contracts         │
│ Sub-agents:                   │ Sub-agents:                     │
│   └── A1: [subtask] (Haiku)   │   └── (none)                   │
│   └── A2: [subtask] (Haiku)   │                                 │
│ Est. tokens: [medium]         │ Est. tokens: [low]              │
│ Manual testing needed: [Y/N]  │ Manual testing needed: [Y/N]    │
└─────────────────────────────────────────────────────────────────┘
GATE: Orchestrator reviews PRs, merges to develop, runs full suite

PHASE 2 — Dependent Work (Parallel where possible)
┌─────────────────────────────────────────────────────────────────┐
│ Agent C: [Task Name]          │ Agent D: [Task Name]            │
│ Depends on: Agent A's output  │ Depends on: Agent B's output    │
│ Context: [merged files from A]│ Context: [merged files from B]  │
└─────────────────────────────────────────────────────────────────┘
GATE: Orchestrator reviews PRs, merges to develop, runs full suite

PHASE 3 — Integration (Sequential, Orchestrator or single agent)
├── [ ] Wire modules together
├── [ ] Full E2E test suite
├── [ ] Manual testing checklist: [items requiring human verification]
└── GATE: All tests green, user approval for merge to main
```

#### Matrix Rules

- **Every task appears exactly once** in the matrix
- **Dependencies are explicit** — "Depends on: Agent A's output" not "depends on auth"
- **Manual testing is flagged** — tasks requiring human verification are marked, not buried
- **Token estimates drive decisions** — if a sub-agent task estimates higher token cost than inline, don't spawn it
- **The matrix is a living document** — update it as work progresses and reality diverges from plan

---

### 7. Shared Contracts (Phase 0)

Before any agent starts, the orchestrator defines the interfaces that all agents code against. This eliminates type drift, merge conflicts on shared types, and interface mismatches.

#### What Goes in Contracts

Define shared enums, data models, and module interfaces/protocols in a single location that all agents import from. The language and framework will vary by project.

**Language-specific equivalents:**
- **TypeScript**: `interfaces.ts` with exported `interface` and `type` definitions
- **Python**: `contracts.py` with `Protocol` classes and `@dataclass` models
- **Go**: `contracts.go` with exported `interface` types
- **Rust**: `traits.rs` with `pub trait` definitions and shared `struct`/`enum` types

#### Contract Rules

- Contracts are committed to `develop` before any agent branch is created
- All agents import from contracts — they do NOT define their own versions of shared types
- If an agent needs a type not in contracts, define it locally and flag it: `// TODO: promote to shared contracts if other modules need this`
- Contract changes require orchestrator approval and a rebase of all active agent branches

---

### 8. Agent Prompt Templates

#### Parallel Agent Prompt

```
You are building [MODULE_NAME] for [PROJECT_NAME].

## Working Directory
Your working directory is: `<WORKTREE_ABSOLUTE_PATH>`
ALL file operations (reads, writes, edits) and ALL commands (tests, git) MUST use this directory.
Do NOT cd to or operate on the main repo directory.

## Git Branch
You are working on branch: `claude/feat-[PHASE][LETTER]-[description]`
This branch is already checked out in your worktree. Commit your work to this branch.

## Shared Contracts
You MUST import and implement against these shared interfaces:
[paste the actual contracts code or reference the file path in the worktree]

## Dependencies Available
The following modules are already implemented and merged. You may import from them:
[paste relevant code or file paths from already-completed agents]

## Your Task
[specific task description with acceptance criteria]

## TDD Protocol (MANDATORY)
Follow this cycle for every piece of functionality:
1. Investigate the problem — read existing code, understand the current state
2. Write tests that describe the expected behavior — unit tests at minimum,
   integration/E2E if the task involves cross-module behavior
3. Run the tests — they MUST fail (if they pass, your tests aren't testing new behavior)
4. Write minimal code to make the tests pass
5. Run the full test suite — nothing else should break
6. Commit with a descriptive message

## Sub-Agent Policy
You MAY spawn sub-agents (model: haiku) ONLY when ALL of these are true:
- The subtask is parallelizable (no dependency on other concurrent work)
- The subtask is isolated (single module/file, no cross-cutting concerns)
- The subtask is small (completable in one focused pass)
- The subtask requires no complex investigation
- The token savings justify the coordination overhead

Sub-agents commit to YOUR branch in YOUR worktree. You handle their merge conflicts
and run the full test suite before creating your PR.

## Interface Compliance
- Your public API MUST match the Protocol/ABC defined in the shared contracts
- Use the shared data models for all cross-module data
- Do NOT define your own versions of shared types

## Completion Checklist
Before creating your PR:
- [ ] All new code has tests (written BEFORE implementation)
- [ ] All tests pass (unit + integration + E2E as applicable)
- [ ] Full test suite passes (not just your tests)
- [ ] Latest develop is pulled into your branch
- [ ] No merge conflicts remain
- [ ] Code follows project conventions
- [ ] Create PR to develop using: gh pr create --base develop
```

#### Sub-Agent Prompt

```
You are completing a subtask for [PARENT_MODULE_NAME] in [PROJECT_NAME].

## Working Directory
Your working directory is: `<PARENT_WORKTREE_ABSOLUTE_PATH>`
ALL file operations MUST use this directory. You are committing to the parent agent's branch.

## Your Subtask
[specific, narrow task description]

## TDD Protocol (MANDATORY even for trivial tasks)
1. Write a failing test for the expected behavior
2. Write minimal code to make it pass
3. Run the tests relevant to your change
4. Commit with message: "sub-agent: [description of change]"

## Constraints
- Do NOT modify files outside your subtask scope
- Do NOT create new shared types — use what exists in contracts
- Do NOT interact with other sub-agents
- Keep your changes minimal and focused
```

---

### 9. Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do This Instead |
|---|---|---|
| **No shared contracts** | Agents independently define overlapping types → merge hell | Phase 0: define contracts before any agent starts |
| **Big bang merge** | All agents merge at end → conflicts compound, context is stale | Merge and test after EACH agent |
| **No orchestrator review** | Agent output goes straight to dependent agents without verification | Orchestrator reviews every PR before merge |
| **Copy-paste context** | Describing interfaces in prose → agents guess wrong | Feed actual merged code as context |
| **Parallel everything** | Running dependent agents in parallel with stubs → integration failures | Wait for real implementations, then feed forward |
| **All-Opus sub-agents** | Burns quota ~5x faster for tasks Sonnet handles equally well | Sonnet for parallel agents, Haiku for sub-agents |
| **Parallel agents in same directory** | One checkout moves the working tree for all others | Git worktrees: one per parallel agent |
| **Sub-agents on their own branches** | Coordination overhead exceeds benefit | Sub-agents commit to parent agent's branch |
| **Changing tests to fix merge failures** | Tests encode intended behavior — changing them hides bugs | Fix implementation to match tests; only change tests with user approval |
| **Spawning sub-agents for complex tasks** | Haiku can't handle investigation or cross-cutting concerns | Keep complex work in the parallel agent (Sonnet) |
| **No parallelization matrix** | Ad-hoc agent spawning leads to dependency violations and wasted tokens | Always produce the matrix before launching agents |

---

### 10. Checklist: Before Launching Any Agent Team

- [ ] Scope of work is defined with acceptance criteria
- [ ] Orchestration & Parallelization Matrix is complete (Section 6)
- [ ] Shared contracts are written and committed to develop (Section 7)
- [ ] Branches are created for all Phase 1 agents
- [ ] Worktrees are created and verified (`git -C <path> branch --show-current`)
- [ ] Each agent's prompt includes: worktree path, branch name, contracts, task, TDD protocol
- [ ] Token budget is estimated and model assignments are set
- [ ] Manual testing tasks are identified and flagged in the matrix
- [ ] Merge order is planned (least → most conflict-prone)

---

## Task-Specific Modes

### MODE: Feature Requests

**When the user asks for a new feature or capability:**

1. **Validate the Why**
   - Is this solving a real problem or feature creep?
   - What's the opportunity cost vs other priorities?
   - Does it fit the project's architecture and direction?

2. **Planning Phase**
   - Produce the Orchestration & Parallelization Matrix (Section 6)
   - Identify shared contracts needed (Section 7)
   - Flag tasks requiring manual testing
   - Write test cases FIRST (what success looks like)
   - API contract/interface design
   - Edge cases and failure modes
   - Dependencies and breaking changes

3. **Implementation**
   - All agents follow TDD Protocol (Section 3)
   - Minimal viable version first
   - Migration path if changing existing behavior

4. **Delivery Format**
   - Priority assessment (high/medium/low with reasoning)
   - Orchestration matrix with token estimates
   - Risk analysis (what could go wrong)
   - Code with tests, not just pseudocode

**Red flags to call out:**
- Feature doesn't have clear success metric
- Adds complexity without proportional value
- Conflicts with existing architecture

---

### MODE: Bug Fixes

**When the user reports a bug or broken behavior:**

1. **Confirm the Bug**
   - Reproduce the issue from the description
   - Distinguish: actual bug vs expected behavior user doesn't like
   - Assess severity: critical (blocks work), major (workaround exists), minor (cosmetic)

2. **Root Cause Analysis**
   - Don't just fix symptoms
   - Show *why* it broke (what assumption failed)
   - Check if other areas have the same vulnerability

3. **Fix Approach (TDD — no sub-agents for bug fixes)**
   - Checkout from develop, create a bugfix branch and worktree
   - Write failing test that captures the bug
   - Minimal change to make test pass
   - Verify no regressions
   - Pull develop into bugfix branch, resolve conflicts
   - Run entire test suite
   - Create PR to develop

4. **Delivery Format**
   - Severity classification with reasoning
   - Root cause explanation (1-2 sentences)
   - Fix with before/after test results
   - Prevention: how to avoid this class of bug going forward

**Red flags to call out:**
- If the "bug" is actually a feature request in disguise
- If fixing properly requires architectural changes (then it's a refactor, not a patch)
- If the fix is papering over a deeper design flaw

---

### MODE: Research Tasks

**When the user asks for analysis, strategy, or exploration:**

1. **Clarify the Decision**
   - What is the user actually trying to decide?
   - What's the time horizon?

2. **Research Approach**
   - Primary sources over summaries
   - Quantitative data over anecdotes
   - Recent data for evolving domains

3. **Delivery Format**
   - Executive summary (2-3 sentences)
   - Key findings (3-5 bullets, no fluff)
   - Recommended action with specific next steps
   - What is unknown (gaps in available data)

---

### MODE: Miscellaneous

1. **Classify First** — Is this actually a feature/bug/research in disguise?
2. **Bias toward action** — deliver usable output, not theoretical frameworks
3. **Clear next action** — what should the user do with this output?