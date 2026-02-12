# Figma Integration Planning Document

**Version:** 1.0
**Date:** February 11, 2026
**Status:** Planning Phase

---

## Executive Summary

This document outlines the technical approach for integrating Figma and Figma Make capabilities into Claude Code. The integration will enable users to interact with Figma designs, manage files, retrieve design data, and potentially leverage Figma Make for AI-powered website generation.

Based on research of the Figma REST API, Figma Make, and Model Context Protocol (MCP) best practices, this document recommends a **dual implementation strategy**: developing both an MCP server for broad ecosystem compatibility and a custom skill for Claude Code-specific optimizations.

---

## Table of Contents

1. [Research Findings](#research-findings)
2. [API Capabilities Overview](#api-capabilities-overview)
3. [Implementation Options](#implementation-options)
4. [Recommended Architecture](#recommended-architecture)
5. [Technical Specifications](#technical-specifications)
6. [Authentication Strategy](#authentication-strategy)
7. [Available Endpoints](#available-endpoints)
8. [Integration Possibilities](#integration-possibilities)
9. [Development Roadmap](#development-roadmap)
10. [Risk Assessment](#risk-assessment)
11. [References](#references)

---

## Research Findings

### Figma REST API (2026)

The Figma REST API provides comprehensive read access to Figma files, with recent updates including:

- **Base URL**: `https://api.figma.com`
- **OpenAPI Specification**: Beta release available at [figma/rest-api-spec](https://github.com/figma/rest-api-spec)
- **Rate Limiting**: Published limits went into effect November 17, 2025
- **Scoped Authentication**: New scope-based token system replacing legacy `files:read` with granular permissions like `file_content:read`, `file_comments:read`, `file_metadata:read`

**Key Recent Updates (2025-2026):**
- TABLE and TABLE_CELL node types added
- Payments REST API and GET payments endpoint introduced
- Markdown support for comments via `as_md` parameter
- Enterprise beta endpoints for Library Analytics
- New OAuth app publishing flow (mandatory by November 17, 2025)

### Figma Make

Figma Make is an AI-powered website builder that allows users to generate responsive, interactive websites from prompts.

**Key Features:**
- Prompt-to-website generation
- Supabase integration for backend/auth
- API and backend connectivity
- Embed support in Figma Design, FigJam, and Slides (added January 22, 2026)

**API Status**: No dedicated Figma Make REST API found in public documentation. Figma Make appears to be primarily a UI-based tool without programmatic access as of February 2026.

### Model Context Protocol (MCP)

MCP has matured significantly with clear authentication patterns and ecosystem growth:

- **Official TypeScript SDK**: Stable v1.x available, v2 anticipated Q1 2026
- **Authentication**: OAuth 2.1 with PKCE for HTTP/SSE transport; environment-based for STDIO transport
- **Frameworks**: FastMCP and MCP-Framework provide higher-level abstractions
- **MCP Apps**: Extension allowing interactive UI components (January 2026)
- **Stateless Protocol**: Next release (June 2026) aims to support stateful applications

### Claude Skills

Skills provide domain-specific expertise for using MCP tools effectively:

- **Structure**: YAML frontmatter + markdown instructions in SKILL.md
- **Purpose**: Bridge between raw MCP tool access and reliable workflow outcomes
- **Relationship to MCP**: MCP handles connectivity; Skills handle expertise and workflow logic
- **Skills + MCP Apps**: Convergence enables skills to trigger rich interactive UIs

---

## API Capabilities Overview

### Figma Plugin API vs REST API

| Capability | Plugin API | REST API |
|------------|-----------|----------|
| **Read Access** | Current file only | Multiple files, cross-team |
| **Write Access** | Full editing capabilities | Read-only (no write operations) |
| **Real-time** | Yes, with multiplayer | No |
| **Comments** | No access | Full access |
| **Availability** | Only when Figma app is open | Always available, external access |
| **Use Case** | Interactive canvas extensions | Automation, integrations, bulk operations |
| **Authentication** | Plugin context | OAuth 2.0 or Personal Access Token |

**Implication for Claude Code Integration**: REST API is the appropriate choice for an external integration, as it enables automation and external tool access without requiring the Figma app to be open.

### Figma Webhooks V2

Real-time event notifications for:
- File updates
- Comments
- Library publishing
- Dev mode status changes

**Contexts**: Can attach to teams, projects, or individual files
**Setup**: POST webhook endpoint returns PING event on success
**Event Delivery**: HTTP POST to configured endpoint

---

## Implementation Options

### Option 1: MCP Server Only

**Pros:**
- Ecosystem compatibility (works with any MCP client: Claude Desktop, Cursor, VS Code, ChatGPT)
- Standardized protocol for tool discovery and invocation
- Community can contribute and extend
- OAuth 2.1 authentication built into spec
- Reusable across different AI assistants

**Cons:**
- Generic interface may not leverage Claude Code-specific features
- More overhead for simple operations
- Requires MCP client configuration by users
- No workflow-specific optimizations

### Option 2: Custom Skill Only

**Pros:**
- Tailored specifically for Claude Code workflows
- Can provide domain-specific expertise and best practices
- Simpler for end users (no MCP server setup)
- Direct integration with Claude Code's environment
- Faster development for Claude Code-specific use cases

**Cons:**
- Only works with Claude Code
- Limited ecosystem reach
- Harder for community contributions
- May duplicate functionality if MCP servers exist

### Option 3: MCP Server + Custom Skill (Recommended)

**Pros:**
- Best of both worlds: broad compatibility + optimized workflows
- MCP server provides raw tool access
- Skill provides expertise on when and how to use tools
- Community can use MCP server independently
- Claude Code users get optimized experience
- Separation of concerns (connectivity vs. expertise)

**Cons:**
- Higher initial development effort
- Requires maintaining two components
- Potential version sync challenges

**Recommendation**: **Option 3** - Implement both for maximum value and ecosystem reach.

---

## Recommended Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Figma Skill (SKILL.md)                   │  │
│  │  - Workflow expertise                                 │  │
│  │  - Design pattern recognition                         │  │
│  │  - Best practices for Figma operations                │  │
│  │  - Context-aware tool selection                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         MCP Client (Claude Code Runtime)              │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ MCP Protocol
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Figma MCP Server (TypeScript)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Tools:                                                │  │
│  │  - get_file                                           │  │
│  │  - get_file_nodes                                     │  │
│  │  - get_comments                                       │  │
│  │  - post_comment                                       │  │
│  │  - get_team_projects                                  │  │
│  │  - search_files                                       │  │
│  │  - get_component_sets                                 │  │
│  │  - get_file_versions                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Authentication Layer                          │  │
│  │  - OAuth 2.1 + PKCE (HTTP transport)                  │  │
│  │  - PAT via environment (STDIO transport)              │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Figma REST API                             │
│              https://api.figma.com                          │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

1. **Figma MCP Server** (TypeScript)
   - Implements MCP protocol using official TypeScript SDK
   - Provides tools for Figma API operations
   - Handles authentication and token management
   - Manages rate limiting and error handling
   - Supports both STDIO and HTTP/SSE transports

2. **Figma Skill** (SKILL.md)
   - Teaches Claude when to use which Figma tools
   - Provides design-specific domain knowledge
   - Offers workflow patterns (e.g., "export design system components")
   - Handles edge cases and error recovery
   - Guides multi-step operations

---

## Technical Specifications

### MCP Server Implementation

**Technology Stack:**
- **Language**: TypeScript
- **SDK**: @modelcontextprotocol/sdk (v1.x)
- **Framework**: FastMCP (for rapid development) or official SDK (for maximum control)
- **Runtime**: Node.js 18+
- **Package Manager**: npm or pnpm

**Project Structure:**
```
figma-mcp-server/
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── tools/
│   │   ├── files.ts            # File-related tools
│   │   ├── comments.ts         # Comment tools
│   │   ├── components.ts       # Component tools
│   │   ├── projects.ts         # Project/team tools
│   │   └── versions.ts         # Version history tools
│   ├── auth/
│   │   ├── oauth.ts            # OAuth 2.1 implementation
│   │   ├── pat.ts              # Personal Access Token handling
│   │   └── token-manager.ts   # Token refresh and storage
│   ├── api/
│   │   ├── client.ts           # Figma API client wrapper
│   │   ├── rate-limiter.ts     # Rate limiting logic
│   │   └── error-handler.ts   # Error mapping and recovery
│   ├── types/
│   │   └── figma.ts            # TypeScript types for Figma API
│   └── utils/
│       ├── logger.ts           # Logging utilities
│       └── validators.ts       # Input validation
├── tests/
│   └── ...                     # Unit and integration tests
├── package.json
├── tsconfig.json
└── README.md
```

**Key Dependencies:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

### Skill Implementation

**File Structure:**
```
figma-skill/
├── SKILL.md                    # Main skill definition
├── examples/
│   ├── export-design-tokens.md
│   ├── component-library-sync.md
│   └── design-review-workflow.md
└── README.md
```

**SKILL.md Format:**
```markdown
---
name: figma
description: Expert guidance for working with Figma designs and files
version: 1.0.0
author: [Your Name]
mcp_servers:
  - figma
---

# Figma Design Expert

You are an expert at working with Figma files through the Figma MCP server...

## Core Capabilities
[Detailed instructions]

## Workflow Patterns
[Common multi-step operations]

## Best Practices
[Domain expertise]

## Error Handling
[Recovery strategies]
```

---

## Authentication Strategy

### Transport-Based Authentication

#### STDIO Transport (Recommended for Local Use)

**Method**: Personal Access Token via environment variable

**Setup**:
1. User generates PAT in Figma Settings
2. Stores in environment: `FIGMA_ACCESS_TOKEN=figd_...`
3. MCP server reads from `process.env.FIGMA_ACCESS_TOKEN`
4. Uses `X-Figma-Token` header for API requests

**Pros**:
- Simple setup for local use
- No OAuth flow complexity
- Works with Claude Desktop, Cursor, etc.

**Cons**:
- Tokens don't support all endpoints (Activity Logs, Discovery API)
- User-specific only (can't act on behalf of others)
- Manual token rotation

**Security Considerations**:
- Store PAT in `.env` file (never commit to git)
- Use scoped tokens (e.g., `file_content:read`, `file_comments:read`)
- Set token expiration

#### HTTP/SSE Transport (For Remote/Production)

**Method**: OAuth 2.1 with PKCE

**Flow**:
1. Client initiates OAuth flow
2. User authorizes app in Figma
3. Server receives authorization code
4. Exchanges code for access token (with refresh token)
5. Stores tokens securely
6. Refreshes access token as needed

**Scopes Required**:
- `file_content:read` - Read file structure and content
- `file_metadata:read` - Read file metadata
- `file_comments:read` - Read comments
- `file_comments:write` - Post comments
- `file_variables:read` - Read variables and design tokens

**Pros**:
- Works for all API endpoints
- Supports multi-user scenarios
- Automatic token refresh
- More secure for production

**Cons**:
- Complex setup
- Requires OAuth app registration
- Callback URL infrastructure

### Implementation Recommendation

**Phase 1**: Implement STDIO transport with PAT for MVP
**Phase 2**: Add HTTP/SSE transport with OAuth for production use

---

## Available Endpoints

### Core File Operations

#### 1. Get File
**Tool**: `get_file`
**Endpoint**: `GET /v1/files/:key`
**Scope**: `file_content:read`
**Tier**: 1 (higher rate limits)

**Description**: Retrieve full file structure as JSON

**Parameters**:
- `file_key` (required): File identifier from URL
- `version` (optional): Specific version ID
- `geometry` (optional): Include absolute bounding boxes
- `depth` (optional): Limit tree depth

**Use Cases**:
- Inspect design structure
- Extract component hierarchy
- Analyze layout properties

**Example Response**:
```json
{
  "document": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [...]
  },
  "components": {...},
  "componentSets": {...},
  "styles": {...}
}
```

#### 2. Get File Nodes
**Tool**: `get_file_nodes`
**Endpoint**: `GET /v1/files/:key/nodes`
**Scope**: `file_content:read`

**Description**: Retrieve specific nodes by ID

**Parameters**:
- `file_key` (required)
- `ids` (required): Comma-separated node IDs

**Use Cases**:
- Fetch specific components
- Update changed nodes only
- Targeted extraction

#### 3. Get File Metadata
**Tool**: `get_file_metadata`
**Endpoint**: `GET /v1/files/:key/metadata`
**Scope**: `file_metadata:read`
**Tier**: 3

**Description**: Get file metadata without full content

**Use Cases**:
- Quick file info lookup
- Check last modified time
- List editors and viewers

#### 4. Get File Versions
**Tool**: `get_file_versions`
**Endpoint**: `GET /v1/files/:key/versions`
**Scope**: `file_metadata:read`

**Description**: Retrieve version history

**Use Cases**:
- Track design changes
- Compare versions
- Restore previous state (via version parameter)

### Images and Assets

#### 5. Get Image Fills
**Tool**: `get_image_fills`
**Endpoint**: `GET /v1/files/:key/images`
**Scope**: `file_content:read`

**Description**: Get download URLs for all images

**Parameters**:
- `file_key` (required)

**Note**: URLs expire after max 14 days

#### 6. Render Node as Image
**Tool**: `render_image`
**Endpoint**: `GET /v1/images/:key`
**Scope**: `file_content:read`

**Description**: Export node as PNG, JPG, SVG, or PDF

**Parameters**:
- `ids`: Node IDs to render
- `scale`: 0.01 to 4
- `format`: png, jpg, svg, pdf
- `use_absolute_bounds`: boolean

**Use Cases**:
- Export components as images
- Generate thumbnails
- Create design documentation

### Comments

#### 7. Get Comments
**Tool**: `get_comments`
**Endpoint**: `GET /v1/files/:key/comments`
**Scope**: `file_comments:read`

**Description**: Retrieve all comments on a file

**Parameters**:
- `as_md`: Return rich-text as markdown (new 2025)

**Use Cases**:
- Review feedback
- Extract design decisions
- Track discussion threads

#### 8. Post Comment
**Tool**: `post_comment`
**Endpoint**: `POST /v1/files/:key/comments`
**Scope**: `file_comments:write`

**Description**: Add a comment to a file

**Parameters**:
- `message`: Comment text
- `client_meta`: Position/target info

**Use Cases**:
- Automated design reviews
- Add AI-generated suggestions
- Document changes

### Components and Design Systems

#### 9. Get Team Components
**Tool**: `get_team_components`
**Endpoint**: `GET /v1/teams/:team_id/components`
**Scope**: `file_content:read`

**Description**: List all components in a team

**Use Cases**:
- Design system audits
- Component inventory
- Cross-file component search

#### 10. Get Component Sets
**Tool**: `get_component_sets`
**Endpoint**: `GET /v1/files/:key/component_sets`
**Scope**: `file_content:read`

**Description**: Get variant component sets

**Use Cases**:
- Extract variant systems
- Document component props
- Generate design tokens

#### 11. Get File Components
**Tool**: `get_file_components`
**Endpoint**: `GET /v1/files/:key/components`
**Scope**: `file_content:read`

**Description**: Get all components in a specific file

### Projects and Organization

#### 12. Get Team Projects
**Tool**: `get_team_projects`
**Endpoint**: `GET /v1/teams/:team_id/projects`
**Scope**: `file_metadata:read`

**Description**: List all projects in a team

#### 13. Get Project Files
**Tool**: `get_project_files`
**Endpoint**: `GET /v1/projects/:project_id/files`
**Scope**: `file_metadata:read`

**Description**: List files in a project

**Use Cases**:
- Project inventory
- Batch file operations
- Organization structure mapping

### Variables and Design Tokens

#### 14. Get Local Variables
**Tool**: `get_local_variables`
**Endpoint**: `GET /v1/files/:key/variables/local`
**Scope**: `file_variables:read`

**Description**: Get all local variables (design tokens)

**Use Cases**:
- Export design tokens
- Sync with code
- Document design system

#### 15. Get Published Variables
**Tool**: `get_published_variables`
**Endpoint**: `GET /v1/files/:key/variables/published`
**Scope**: `file_variables:read`

**Description**: Get published library variables

### Webhooks (For Advanced Integration)

#### 16. Create Webhook
**Tool**: `create_webhook`
**Endpoint**: `POST /v2/webhooks`
**Scope**: OAuth only

**Description**: Subscribe to file events

**Event Types**:
- FILE_UPDATE
- COMMENT
- LIBRARY_PUBLISH
- DEV_MODE_STATUS_UPDATE

**Use Cases**:
- Real-time design sync
- Automated notifications
- CI/CD integration

---

## Integration Possibilities

### Use Case 1: Design System Documentation

**Workflow**:
1. User: "Document the button component variants from our design system"
2. Skill identifies this as a component documentation task
3. Tool calls:
   - `get_team_components` to find button components
   - `get_component_sets` to get variant structure
   - `get_file` to extract component properties
   - `render_image` to generate visual examples
4. Skill assembles documentation in markdown
5. Output: Comprehensive component documentation with images

**Value**: Automates tedious documentation work

### Use Case 2: Design Token Extraction

**Workflow**:
1. User: "Export color tokens from the design system file"
2. Skill recognizes token extraction pattern
3. Tool calls:
   - `get_local_variables` for color variables
   - `get_file` for color styles
4. Skill transforms to CSS custom properties or design token JSON
5. Output: Ready-to-use token files for developers

**Value**: Bridges design-development gap

### Use Case 3: Design Review Automation

**Workflow**:
1. User: "Review the new homepage design for accessibility issues"
2. Skill initiates design review workflow
3. Tool calls:
   - `get_file` to fetch design structure
   - Analyze contrast ratios, text sizes, interactive states
4. Skill generates review with specific findings
5. Tool calls:
   - `post_comment` to add findings directly in Figma
6. Output: Accessibility report + in-file comments

**Value**: Automated design QA

### Use Case 4: Component Inventory Audit

**Workflow**:
1. User: "Show me all button components across our team and their usage"
2. Skill initiates cross-file audit
3. Tool calls:
   - `get_team_components` filtered by "button"
   - `get_file` for each file with button instances
4. Skill analyzes usage, variants, inconsistencies
5. Output: Component audit report with recommendations

**Value**: Design system governance

### Use Case 5: Version Comparison

**Workflow**:
1. User: "What changed in the design file since yesterday?"
2. Skill identifies version comparison task
3. Tool calls:
   - `get_file_versions` to find yesterday's version
   - `get_file` for current version
   - `get_file` for historical version
4. Skill compares structures and identifies changes
5. Output: Change summary with specific modifications

**Value**: Design change tracking

### Use Case 6: Export for Development

**Workflow**:
1. User: "Export all icon components as SVG"
2. Skill recognizes batch export pattern
3. Tool calls:
   - `get_file_components` filtered by "icon"
   - `render_image` with format=svg for each icon
4. Skill downloads and organizes SVG files
5. Output: Folder of optimized SVG icons

**Value**: Developer handoff automation

### Use Case 7: Real-time Collaboration

**Workflow** (with webhook integration):
1. Setup: Webhook monitors design system file
2. Event: Designer publishes component update
3. Trigger: Webhook fires LIBRARY_PUBLISH event
4. Skill workflow:
   - Fetch updated component
   - Compare with previous version
   - Generate changelog
   - Post to team Slack/Discord
5. Output: Automated component update notifications

**Value**: Team synchronization

---

## Development Roadmap

### Phase 1: MVP (Weeks 1-2)

**Goal**: Basic read-only functionality with PAT authentication

**MCP Server Tasks**:
- [ ] Project setup with TypeScript + MCP SDK
- [ ] Implement PAT authentication via environment variable
- [ ] Core tools implementation:
  - [ ] `get_file`
  - [ ] `get_comments`
  - [ ] `get_file_metadata`
- [ ] Rate limiting and error handling
- [ ] Basic tests
- [ ] README with setup instructions

**Skill Tasks**:
- [ ] Create SKILL.md with core workflows
- [ ] Document file inspection patterns
- [ ] Add comment retrieval examples
- [ ] Test with Claude Code

**Deliverable**: Working MCP server + skill for reading Figma files

### Phase 2: Component Operations (Weeks 3-4)

**Goal**: Component and design system capabilities

**MCP Server Tasks**:
- [ ] Component tools:
  - [ ] `get_team_components`
  - [ ] `get_component_sets`
  - [ ] `get_file_components`
- [ ] Variable tools:
  - [ ] `get_local_variables`
  - [ ] `get_published_variables`
- [ ] Image rendering:
  - [ ] `render_image`

**Skill Tasks**:
- [ ] Component documentation workflow
- [ ] Design token extraction patterns
- [ ] Component audit examples

**Deliverable**: Full component and token support

### Phase 3: Write Operations (Week 5)

**Goal**: Comment posting and basic write capabilities

**MCP Server Tasks**:
- [ ] `post_comment` tool
- [ ] Comment formatting utilities
- [ ] Write operation error handling

**Skill Tasks**:
- [ ] Design review workflow
- [ ] Automated feedback patterns
- [ ] Comment best practices

**Deliverable**: Bidirectional Figma interaction

### Phase 4: Project/Team Operations (Week 6)

**Goal**: Multi-file and organizational capabilities

**MCP Server Tasks**:
- [ ] `get_team_projects`
- [ ] `get_project_files`
- [ ] Batch operation utilities

**Skill Tasks**:
- [ ] Cross-file workflows
- [ ] Team-wide audits
- [ ] Project management patterns

**Deliverable**: Organization-scale operations

### Phase 5: OAuth and Production (Weeks 7-8)

**Goal**: Production-ready with OAuth support

**MCP Server Tasks**:
- [ ] OAuth 2.1 + PKCE implementation
- [ ] HTTP/SSE transport support
- [ ] Token refresh logic
- [ ] Secure token storage
- [ ] Production error handling and logging

**Skill Tasks**:
- [ ] Multi-user workflow patterns
- [ ] Production best practices

**Deliverable**: Production-ready release

### Phase 6: Advanced Features (Weeks 9-10)

**Goal**: Webhooks and advanced integrations

**MCP Server Tasks**:
- [ ] Webhook management tools
- [ ] Event processing
- [ ] Version comparison utilities
- [ ] Performance optimizations

**Skill Tasks**:
- [ ] Real-time collaboration workflows
- [ ] CI/CD integration patterns
- [ ] Advanced use case examples

**Deliverable**: Enterprise-grade capabilities

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Rate limiting issues** | Medium | Medium | Implement intelligent caching, batch operations, rate limit monitoring |
| **OAuth implementation complexity** | Medium | Low | Start with PAT, defer OAuth to Phase 5, use proven libraries |
| **API changes/deprecation** | Low | High | Monitor Figma changelog, use OpenAPI spec for types, version SDK |
| **Large file performance** | High | Medium | Implement pagination, selective node fetching, stream processing |
| **Token security** | Medium | High | Never log tokens, use environment variables, implement token rotation |
| **MCP SDK version incompatibility** | Low | Medium | Pin SDK version, test before upgrading, monitor SDK releases |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Limited Figma Make API access** | High | Medium | Focus on REST API for MVP, monitor Make API developments |
| **Low user adoption** | Medium | High | Gather early feedback, focus on high-value use cases, clear docs |
| **Skill complexity** | Medium | Medium | Provide clear examples, progressive disclosure, workflow templates |
| **Competing solutions emerge** | Medium | Low | Focus on Claude Code optimization, maintain quality, community engagement |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Maintenance burden** | Medium | Medium | Automated tests, clear documentation, community contributions |
| **Support requests** | High | Low | Comprehensive README, troubleshooting guide, example workflows |
| **Breaking changes in Figma API** | Low | High | Monitor changelog, versioned releases, migration guides |

---

## Open Questions and Future Research

### Figma Make Integration

**Question**: When will Figma Make have a public API?

**Current Status**: No public API found as of February 2026. Figma Make is UI-based.

**Recommendation**:
- Monitor Figma Developer Docs for Make API announcements
- Consider browser automation (Playwright/Puppeteer) as interim solution if urgent
- Engage with Figma through developer forums to request Make API

**Future Actions**:
- Check Figma changelog quarterly
- Join Figma developer community
- Test alpha/beta API access if offered

### MCP Apps Integration

**Question**: How can we leverage MCP Apps for rich UI experiences?

**Status**: MCP Apps launched January 2026, enabling interactive UI components in conversations.

**Opportunities**:
- Render Figma design previews inline
- Interactive component property editors
- Visual diff for version comparisons
- Design system component browsers

**Future Actions**:
- Research MCP Apps SDK (June 2026 release)
- Prototype interactive Figma components
- Integrate with Skill for rich experiences

### Plugin API Bridge

**Question**: Could a hybrid approach use both Plugin API and REST API?

**Scenario**: MCP server orchestrates a Figma plugin for write operations.

**Feasibility**: Technically possible but complex:
- Requires plugin development
- Plugin must be installed by user
- MCP server communicates with plugin via Figma API
- Adds significant complexity

**Recommendation**: Defer until clear use case emerges that requires write capabilities beyond comments.

---

## Success Metrics

### Technical Metrics
- **Response Time**: <2s for 95th percentile of tool calls
- **Error Rate**: <1% for valid requests
- **Rate Limit Compliance**: Zero rate limit violations
- **Test Coverage**: >80% for MCP server

### User Metrics
- **Adoption**: 50+ Claude Code users within 3 months
- **Engagement**: Average 10+ tool calls per active user per week
- **Satisfaction**: >4.5/5 user rating
- **Retention**: >70% monthly active users return

### Ecosystem Metrics
- **MCP Server Stars**: 100+ GitHub stars in 6 months
- **Community Contributions**: 5+ external contributors
- **Skill Usage**: Featured in Claude Code skill library
- **Documentation Quality**: <5% support questions about setup

---

## References

### Figma API Documentation

- [Figma REST API Introduction](https://developers.figma.com/docs/rest-api/)
- [Figma API Endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/)
- [Figma REST API Changelog](https://developers.figma.com/docs/rest-api/changelog/)
- [Figma REST API OpenAPI Specification](https://github.com/figma/rest-api-spec)
- [Figma API Authentication](https://developers.figma.com/docs/rest-api/authentication/)
- [Figma Webhooks V2](https://developers.figma.com/docs/rest-api/webhooks/)
- [Compare Figma APIs](https://developers.figma.com/compare-apis/)

### Figma Make

- [Figma Make: AI Website Builder](https://www.figma.com/make/)
- [AI Website Builder - Figma Solutions](https://www.figma.com/solutions/ai-website-builder/)
- [How To Use AI To Create a Website](https://www.figma.com/resource-library/how-to-use-ai-to-create-a-website/)

### Model Context Protocol

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Server Examples](https://modelcontextprotocol.io/examples)
- [MCP Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [Authentication and Authorization in MCP - Stack Overflow](https://stackoverflow.blog/2026/01/21/is-that-allowed-authentication-and-authorization-in-model-context-protocol/)
- [MCP Authentication Guide - Stytch](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [MCP Spec Updates June 2025 - Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/)

### MCP Server Development

- [FastMCP Framework](https://github.com/punkpeye/fastmcp)
- [MCP Framework](https://github.com/QuantGeekDev/mcp-framework)
- [MCP Server Starter Template](https://github.com/alexanderop/mcp-server-starter-ts)
- [MCP Server Development Guide](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md)

### Claude Skills

- [Extending Claude with Skills and MCP](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers)
- [Skills Explained - Claude Blog](https://claude.com/blog/skills-explained)
- [Claude Skills vs MCP - IntuitionLabs](https://intuitionlabs.ai/articles/claude-skills-vs-mcp)
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)
- [The Complete Claude Code Guide Part 2](https://mrzacsmith.medium.com/the-complete-claude-code-guide-skills-mcp-tool-integration-part-2-20dcf2fb8877)

### Additional Resources

- [Figma API Essentials - Rollout](https://rollout.com/integration-guides/figma/api-essentials)
- [Getting Started with Figma Webhooks](https://souporserious.com/getting-started-with-figma-webhooks/)
- [Manage Personal Access Tokens - Figma Help](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)

---

## Appendix A: Example Skill Workflows

### Workflow 1: Component Documentation

```markdown
## Documenting a Component

When a user asks to document a Figma component:

1. **Identify the component**:
   - Use `get_team_components` or `get_file_components`
   - Search by name or let user specify file + component ID

2. **Fetch component details**:
   - Use `get_component_sets` if it's a variant component
   - Use `get_file` to get full node structure
   - Extract properties, variants, constraints

3. **Generate visuals**:
   - Use `render_image` for each variant
   - Export at 2x scale for retina displays
   - Use PNG format for components with transparency

4. **Structure documentation**:
   - Component name and description
   - Properties table (variants, boolean props, etc.)
   - Usage guidelines
   - Visual examples with images
   - Code snippet (if applicable)

5. **Output format**: Markdown with embedded images
```

### Workflow 2: Design Token Export

```markdown
## Exporting Design Tokens

When a user requests design token export:

1. **Fetch variables**:
   - Use `get_local_variables` for local tokens
   - Use `get_published_variables` for library tokens

2. **Categorize tokens**:
   - Group by type: colors, spacing, typography, etc.
   - Maintain Figma's variable collections structure

3. **Transform to target format**:
   - **CSS Custom Properties**:
     ```css
     :root {
       --color-primary: #0066FF;
       --spacing-sm: 8px;
     }
     ```
   - **Design Token JSON** (W3C format):
     ```json
     {
       "color": {
         "primary": {
           "$value": "#0066FF",
           "$type": "color"
         }
       }
     }
     ```
   - **JavaScript/TypeScript**: Export as const objects

4. **Handle references**:
   - Resolve alias tokens (tokens referencing other tokens)
   - Maintain semantic naming

5. **Output**: File(s) ready for developer use
```

### Workflow 3: Accessibility Review

```markdown
## Automated Accessibility Review

When reviewing a design for accessibility:

1. **Fetch design structure**:
   - Use `get_file` with full node tree
   - Focus on text, buttons, interactive elements

2. **Analyze contrast**:
   - Extract text colors and background colors
   - Calculate WCAG contrast ratios
   - Flag failures: <4.5:1 for normal text, <3:1 for large text

3. **Check text sizes**:
   - Identify text nodes below minimum (16px for body)
   - Check heading hierarchy

4. **Review interactive states**:
   - Verify hover, focus, active variants exist
   - Check touch target sizes (min 44x44px)

5. **Generate report**:
   - List issues with severity (critical, warning, suggestion)
   - Provide specific node IDs and locations
   - Include remediation steps

6. **Post findings**:
   - Use `post_comment` to add comments directly on problem nodes
   - Tag relevant team members
```

---

## Appendix B: Rate Limiting Strategy

### Figma API Rate Limits (as of 2026)

Figma uses a tiered system:
- **Tier 1** (high-frequency): e.g., GET /v1/files/:key - Higher limits
- **Tier 3** (metadata): e.g., GET /v1/files/:key/metadata - Lower limits

**Limits** (exact numbers not public, but enforcement is strict)

### MCP Server Rate Limiting Implementation

```typescript
class RateLimiter {
  private buckets: Map<string, TokenBucket>;

  async checkLimit(endpoint: string): Promise<void> {
    const bucket = this.buckets.get(endpoint);
    if (!bucket.tryConsume()) {
      const retryAfter = bucket.getRetryAfter();
      throw new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter}ms`);
    }
  }
}
```

**Strategies**:
1. **Request coalescing**: Batch multiple tool calls into single API request where possible
2. **Caching**: Cache file structure for 5 minutes (configurable)
3. **Backoff**: Exponential backoff on rate limit errors
4. **User feedback**: Inform user of rate limit status via MCP progress notifications

---

## Appendix C: Error Handling Patterns

### Common Figma API Errors

| Error Code | Meaning | Handling Strategy |
|------------|---------|-------------------|
| 401 | Unauthorized | Check token validity, prompt re-auth |
| 403 | Forbidden | Check token scopes, inform user |
| 404 | Not Found | Validate file key, check permissions |
| 429 | Rate Limited | Apply backoff, inform user of delay |
| 500 | Server Error | Retry with backoff, log for monitoring |

### MCP Server Error Responses

```typescript
{
  "error": {
    "code": "FIGMA_API_ERROR",
    "message": "Failed to fetch file: Invalid file key",
    "details": {
      "statusCode": 404,
      "figmaMessage": "File not found"
    }
  }
}
```

**User-Friendly Messages**:
- Technical: "Failed to fetch file: Invalid file key"
- User-Facing: "I couldn't find that Figma file. Please check the file URL and make sure you have access to it."

---

## Next Steps

1. **Validate approach**: Review this document with stakeholders
2. **Create GitHub repositories**:
   - `figma-mcp-server`
   - `claude-figma-skill`
3. **Set up development environment**: TypeScript, MCP SDK, testing framework
4. **Begin Phase 1 implementation**: PAT auth + core tools
5. **Establish feedback loop**: Early user testing with Claude Code

---

**Document Status**: Ready for review and approval
**Last Updated**: February 11, 2026
**Next Review**: After Phase 1 completion

