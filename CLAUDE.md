# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in Apple Container (Linux VMs). Each group has isolated filesystem and memory.

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

## Agent Team Pattern (with Model Strategy)

When a task requires multiple agents working on interdependent code, use the **Orchestrated Agent Team** pattern instead of isolated sub-agents. The key difference: an orchestrator coordinates the team, enforces shared contracts, and feeds completed outputs as context to downstream agents.

### When to Use Agent Teams vs Solo Agents

**Use a solo agent when:**
- The task is self-contained (single module, no cross-module interfaces)
- No other agent's output will affect this agent's implementation
- The task is pure research, exploration, or a single-file change

**Use an agent team when:**
- 3+ agents will produce code that must interoperate
- Agents define types/interfaces consumed by other agents
- There's a dependency graph between tasks (A's output feeds B's input)
- Integration risk is high (merge conflicts, type mismatches, interface drift)

### Agent Team Structure

```
ORCHESTRATOR (you, the main Claude Code session)
│
├── Phase 0: Shared Contracts Agent
│   └── Defines interfaces, types, protocols/ABCs that all agents import
│   └── OUTPUT: committed shared code on develop branch
│
├── Phase 1: Independent Agents (parallel, each in own git worktree)
│   ├── Agent A (no deps on other agents)
│   ├── Agent B (no deps on other agents)
│   └── Agent C (no deps on other agents)
│   └── GATE: Orchestrator reviews each output, runs tests, merges to develop
│
├── Phase 2: Dependent Agents (parallel where possible, each in own git worktree)
│   ├── Agent D (depends on A's merged output — gets it as context)
│   └── Agent E (depends on B's merged output — gets it as context)
│   └── GATE: Orchestrator reviews, tests, merges
│
└── Phase 3: Integration Agent
    └── Wires everything together, has full merged codebase as context
    └── GATE: Orchestrator runs full test suite, e2e tests
```

### Git Branching & Worktree Strategy

Each sub-agent works on its own **feature branch** off `develop`. Use the naming convention:

```
claude/feat-<phase#><agent-letter>-<description>
```

Examples: `claude/feat-1a-postgres-store`, `claude/feat-2b-strategy-routes`

#### Worktree Isolation (REQUIRED for parallel agents)

Sub-agents share the host filesystem. If one agent checks out a branch, it moves the working tree for all others. **Every parallel agent MUST work in its own git worktree and corrresponding feature branch.**

**Orchestrator creates branches AND worktrees before launching agents:**

```bash
# From the main repo directory, for each parallel agent:
git branch claude/feat-1a-description develop
git branch claude/feat-1b-description develop
git branch claude/feat-1c-description develop

git worktree add ../nado-arb-bot-feat-1a claude/feat-1a-description
git worktree add ../nado-arb-bot-feat-1b claude/feat-1b-description
git worktree add ../nado-arb-bot-feat-1c claude/feat-1c-description
```

**Worktree naming convention:**
```
../<repo-name>-feat-<phase><letter>
```
Worktrees live as **siblings of the main repo directory** (one level up), not inside the repo.

**Each agent's prompt MUST include the worktree absolute path.** The agent works exclusively in that directory — all file reads, writes, test runs, and git commits happen there.

**Worktree cleanup (orchestrator does this AFTER merging each phase):**
```bash
git worktree remove ../nado-arb-bot-feat-1a
git worktree remove ../nado-arb-bot-feat-1b
git worktree remove ../nado-arb-bot-feat-1c
```

#### Merge Protocol

The orchestrator merges agent branches into develop in a deliberate order (least → most conflict-prone). For each merge:

1. Merge the agent's branch into `develop`
2. Resolve any merge conflicts
3. Run the full test suite and build — must pass before proceeding
4. If tests fail after merge: **adjust implementation logic to fit the tests**, not the other way around. If a test itself needs changing, ask the user for approval first — explain what the test verifies and why you want to change it
5. Repeat for the next branch

After all branches for a phase are merged, create a PR to `develop` from the merge branch if working on a long-lived integration branch (e.g., `claude/merge-phase-2`).

### Model Strategy: Opus Orchestrator, Sonnet Sub-Agents

All sub-agents MUST use `model: "sonnet"` in Task tool calls. The orchestrator (main session) runs on Opus.

| Role | Model | Why |
|------|-------|-----|
| **Orchestrator** | Opus | Reviews agent output, fixes integration bugs, makes architectural decisions |
| **All sub-agents** | Sonnet | Well-scoped tasks with clear contracts — Sonnet handles these well at ~5x less quota |
| **Trivial sub-agents** (optional) | Haiku | Simple scaffolding, boilerplate, notifications — if the task is mechanical |

**Why not Opus for everything?** Opus burns quota ~5x faster than Sonnet. A 7-agent project on all-Opus can consume 40-70% of a $100 Max weekly budget. With Sonnet sub-agents, the same project uses ~15-30%.

**When to use Task tool model parameter:**
```
Task(
    description="Build client wrapper",
    prompt="...",
    subagent_type="general-purpose",
    model="sonnet"          # <-- always set this for sub-agents
)
```

### Orchestrator Responsibilities

The orchestrator (your main session) MUST:

1. **Define shared contracts first (Phase 0)**
   - Identify all cross-module interfaces before any agent starts
   - Create a `src/<project>/contracts/` or `src/<project>/types.py` with:
     - Abstract base classes (ABCs/Protocols) for module interfaces
     - Shared data models (Pydantic/dataclasses) used across modules
     - Shared enums and constants
   - Commit this to the base branch so all agents inherit it

2. **Set up worktrees for parallel agents**
   - Before launching any phase's parallel agents, create a git worktree per agent (see "Git Branching & Worktree Strategy" above)
   - Verify each worktree is on the correct branch: `git -C <worktree-path> branch --show-current`
   - Pass the worktree **absolute path** in each agent's prompt
   - After merging all agents in a phase, remove their worktrees before proceeding to the next phase

3. **Build the dependency graph**
   - Map which tasks produce interfaces and which consume them
   - Group into phases: Phase 1 = no inter-agent deps, Phase 2 = deps on Phase 1, etc.
   - Within each phase, maximize parallelism

4. **Gate between phases** (follows the merge protocol in Git Branching & Worktree Strategy)
   - Plan the merge order before merging — least conflict-prone branches first
   - After each agent completes: review output on its feature branch, then merge to develop
   - Run the full test suite after each individual merge, not just at the end
   - Fix any interface violations or test failures before merging the next branch
   - Feed the actual merged code (not just the spec) as context to downstream agents
   - **Remove worktrees** for the completed phase before proceeding

5. **Feed context forward**
   - When starting a Phase 2+ agent, include in its prompt:
     - The actual implementation of modules it depends on (read the merged files)
     - Any deviations from the original spec discovered during Phase 1
     - Test results from merged code

6. **Incremental integration**
   - Merge and test after EACH agent, not in a big bang at the end
   - Run the full test suite after each merge, not just the new agent's tests
   - Fix integration issues immediately while context is fresh

### Template: Agent Prompt for Team Members

```
You are building [MODULE_NAME] for [PROJECT_NAME].

## Working Directory
Your working directory is: `<WORKTREE_ABSOLUTE_PATH>`
ALL file operations (reads, writes, edits) and ALL commands (tests, git) MUST use this directory.
Do NOT cd to or operate on the main repo directory.

## Git Branch
You are working on branch: `claude/feat-[PHASE][LETTER]-[description]`
This branch is already checked out in your worktree. Commit your work to this branch.
Do NOT merge into develop — the orchestrator handles merges.

## Shared Contracts
You MUST import and implement against these shared interfaces:
[paste the actual contracts code or reference the file path]

## Dependencies Available
The following modules are already implemented and merged. You may import from them:
[paste relevant code or file paths from already-completed agents]

## Your Task
[specific task description]

## Interface Compliance
- Your public API MUST match the Protocol/ABC defined in the shared contracts
- Use the shared data models for all cross-module data (do NOT define your own versions)
- If you need a type not in the shared contracts, define it locally but flag it in
  a comment: # TODO: promote to shared contracts if other modules need this

## Testing
[TDD test specs — tests should verify interface compliance as well as logic]
- Run your tests before your final commit to ensure they pass on your branch
```

### Template: Phase 0 Shared Contracts

When starting a multi-agent project, create this file structure:

```python
# src/<project>/contracts.py (or contracts/ package for larger projects)

from abc import ABC, abstractmethod
from decimal import Decimal
from enum import Enum
from dataclasses import dataclass
from typing import Protocol, Optional
from datetime import datetime

# --- Shared Enums ---
class OrderSide(str, Enum): ...
class OrderStatus(str, Enum): ...

# --- Shared Data Models ---
@dataclass(frozen=True)
class OrderInstruction: ...

@dataclass
class Fill: ...

# --- Module Protocols (what each module must expose) ---
class ExchangeClient(Protocol):
    """Interface that the client module must implement."""
    async def place_limit_order(...) -> str: ...
    async def cancel_order(...) -> bool: ...

class StateStore(Protocol):
    """Interface that the persistence module must implement."""
    async def save_order(...) -> int: ...
    async def get_active_orders(...) -> list: ...

class Notifier(Protocol):
    """Interface that the notification module must implement."""
    async def notify_fill(...) -> None: ...
```

### Anti-Patterns to Avoid

- **No shared contracts**: Agents independently define overlapping types → merge hell
- **Big bang merge**: All agents merge at end → conflicts compound, context is stale
- **No orchestrator review**: Agent output goes straight to dependent agents without verification
- **Copy-paste context**: Describing interfaces in prose instead of giving agents the actual code
- **Parallel everything**: Running dependent agents in parallel with stubs instead of waiting for real implementations
- **All-Opus sub-agents**: Burns quota ~5x faster for tasks that Sonnet handles equally well — always set `model: "sonnet"` on Task tool calls
- **All agents on one branch**: Agents writing to the same branch causes race conditions and merge chaos — give each agent its own feature branch
- **Parallel agents in same working directory**: Sub-agents share the host filesystem — if one checks out a branch, it moves the working tree for all others. Always use **git worktrees** so each parallel agent has an isolated directory with its own branch already checked out
- **Changing tests to fix merge failures**: When merging causes test failures, fix the implementation to match the tests. Tests encode the intended behavior — only change them with user approval

# Task-Specific Modes


## MODE: Feature Requests

**When I ask for a new feature or capability:**

1. **Validate the Why**
   - Is this solving a real problem or feature creep?
   - What's the opportunity cost vs other priorities?
   - Does this fit agent-led growth strategy?

2. **Planning Phase (TDD)**
   - Write test cases FIRST (what success looks like)
   - write tests that match the intended logic, make sure the tests fail on current logic that is non compliant, then write or revise the current logic to match the test. if it is a large task or epic level feature request, break down the task into subtasks and mark which of these sub tasks needs manual testing vs what can be built following TDD by a sub agent or agents in parallel.
   - API contract/interface design
   - Edge cases and failure modes
   - Dependencies and breaking changes
   

3. **Implementation**
   - Minimal viable version first
   - Clear documentation (machine-readable)
   - Migration path if changing existing behavior

4. **Delivery Format**
   - Priority assessment (high/medium/low with reasoning)
   - Effort estimate (hours/days, not "small/large")
   - Risk analysis (what could go wrong)
   - Code with tests, not just pseudocode

**Red flags to call out:**
- Feature doesn't have clear success metric
- Adds complexity without proportional value
- Conflicts with API-first architecture

---

## MODE: Bug Fixes

**When I report a bug or broken behavior:**

1. **Confirm the Bug**
   - Reproduce the issue from my description
   - Distinguish: actual bug vs expected behavior I don't like
   - Assess: critical (blocks work), major (workaround exists), minor (cosmetic)

2. **Root Cause Analysis**
   - Don't just fix symptoms
   - Show me *why* it broke (what assumption failed)
   - Check if other areas have same vulnerability

3. **Fix Approach (TDD)**
   - Write failing test that captures the bug
   - Minimal change to make test pass
   - Verify no regressions

4. **Delivery Format**
   - Severity classification with reasoning
   - Root cause explanation (1-2 sentences)
   - Fix with before/after test results
   - Prevention: how to avoid this class of bug going forward

5. for bugfixes, there is no need for sub agents. just proceed by following TDD and write both unit, integration and E2E tests (for logic libraries, API requests, UI level interactions respectively) and avoid regressions of the same bug in the future. 

**Red flags to call out:**
- If the "bug" is actually a feature request in disguise
- If fixing properly requires architectural changes (then it's a refactor, not a patch)
- If I'm papering over a deeper system design flaw

---

## MODE: Research Tasks

**When I ask for analysis, strategy, or exploration:**

1. **Clarify the Decision**
   - What am I actually trying to decide?
   - What's the time horizon (next week vs next quarter)?

2. **Research Approach**
   - Primary sources over summaries when possible
   - Quantitative data over anecdotes
   - Recent data (post-2024) for market trends
   - Historical patterns for financial/crypto analysis

3. **Analysis Structure**
   - Key findings (3-5 bullets, no fluff)
   - Opportunity costs of each option
   - Risks I'm underestimating
   - Recommended action with specific next steps

4. **Delivery Format**
   - Executive summary (2-3 sentences)
   - Data-backed insights (cite sources)
   - Prioritized action plan (immediate/24hr/ongoing)
   - What I don't know (gaps in available data)

**Red flags to call out:**
- If I'm researching instead of executing (analysis paralysis)
- If the question is too broad to be actionable
- If I'm looking for validation rather than truth

---

## MODE: Miscellaneous Tasks

**When the task doesn't fit above categories:**

1. **Classify First**
   - Is this actually feature/bug/research in disguise?
   - Is this strategic (affects business direction) or tactical (execution detail)?
   - Is this urgent or am I procrastinating something harder?

2. **Execution Approach**
   - Bias toward action over perfection
   - Deliver usable output, not theoretical frameworks
   - Show working examples, not abstract descriptions

3. **Delivery Format**
   - Depends on task type, but always:
   - Clear next action (what do I do with this output?)
   - Time estimate if it's a multi-step process
   - Dependencies (what else needs to happen first)

**Red flags to call out:**
- If task is actually multiple tasks that should be separated
- If I'm asking you to do something I should delegate to a specialist
- If this is busy work avoiding higher-leverage activities

---