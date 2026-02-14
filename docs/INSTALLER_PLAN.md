# NanoClaw Installer - Implementation Plan

## Overview

Build a **standalone desktop application** (Electron) that provides a guided setup wizard like AtomicBot. This document covers the full implementation including packaging for macOS (.dmg) and Windows (.exe).

## Packaging Approach: Electron App

### Why Electron?

- **Cross-platform**: Builds to DMG (macOS) and EXE (Windows) from one codebase
- **Native feel**: Standard window, menus, dialogs
- **Bundled runtime**: Includes Node.js - users don't need to install it
- **Rich UI**: React-based wizard with progress indicators

### Build Tools

- **electron**: Core framework
- **electron-builder**: Creates .dmg and .exe installers
- **electron-packager**: Alternative for simple builds

---

## How the Installer Works

### Internal Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NanoClaw Installer                        │
├─────────────────────────────────────────────────────────────┤
│  React UI (Renderer)                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │Prereqs  │  │WhatsApp │  │Groups   │  │Google   │       │
│  │  Step   │→ │  Step   │→ │  Step   │→ │  Step   │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │ Docker   │  │ Baileys  │  │ OAuth    │                │
│  │ Checker  │  │ Wrapper  │  │ Server   │                │
│  └──────────┘  └──────────┘  └──────────┘                │
├─────────────────────────────────────────────────────────────┤
│  Embedded Resources                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ nanoclaw-source/  (cloned or bundled repo)       │     │
│  │ docker/            (Dockerfile for agent)         │     │
│  │ configs/           (default configs, templates)   │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Setup Flow (What Actually Happens)

1. **Prerequisites Check**
   - Detect Docker Desktop installation
   - Detect if Docker is running
   - Offer to install Docker if missing

2. **Extract Resources**
   - Extract embedded nanoclaw source to user-selected directory
   - Extract Docker agent image build context

3. **Build Dependencies**
   - Run `npm install` in the extracted project
   - Build TypeScript (`npm run build`)
   - Build Docker agent image (`docker build`)

4. **WhatsApp Authentication**
   - Start temporary baileys connection
   - Show QR code in window (or terminal)
   - Wait for user to scan with phone
   - Save credentials to project

5. **Admin Selection**
   - List user's chats from WhatsApp
   - User selects personal chat or group as "main" admin

6. **Group Creation** (Optional)
   - User selects departments: Accounting, Sales, Support, Custom
   - For each: create folder, CLAUDE.md, register in JSON

7. **Google OAuth** (Optional)
   - For each group needing Google:
     - Start local OAuth server (port 3456)
     - Open system browser for Google login
     - Handle callback
     - Save tokens to group's `.credentials/`

8. **Service Registration**
   - Generate launchd plist (macOS) or systemd service (Linux)
   - Or just offer to start manually

---

## Project Structure

```
installer/
├── package.json              # Electron + electron-builder config
├── electron/
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # IPC bridge
│   └── logger.ts            # File logging
├── src/
│   ├── App.tsx              # React root component
│   ├── steps/
│   │   ├── Prerequisites.tsx # Docker/Node check
│   │   ├── WhatsApp.tsx     # QR code display
│   │   ├── Admin.tsx        # Select admin chat
│   │   ├── Groups.tsx       # Department selection
│   │   ├── Google.tsx       # OAuth flow
│   │   └── Summary.tsx      # Final summary
│   ├── components/
│   │   ├── Wizard.tsx       # Step wizard container
│   │   ├── QRDisplay.tsx    # WhatsApp QR renderer
│   │   └── Progress.tsx     # Progress bar
│   └── lib/
│       ├── docker.ts        # Docker detection/installation
│       ├── whatsapp.ts      # Baileys wrapper
│       ├── oauth.ts         # Google OAuth flow
│       ├── config.ts        # Config file generation
│       └── groups.ts        # Group folder creation
├── resources/
│   ├── nanoclaw/           # Bundled nanoclaw source
│   │   ├── package.json
│   │   ├── src/
│   │   ├── container/
│   │   └── groups/
│   └── icons/              # App icons (.icns, .ico)
├── build/
│   ├── macos.yml           # electron-builder config
│   └── windows.yml         # electron-builder config
└── dist/                   # Build output
    ├── mac/
    │   └── NanoClaw-Setup.dmg
    └── win/
        └── NanoClaw-Setup.exe
```

---

## electron-builder Configuration

```json
{
  "appId": "com.nanoclaw.installer",
  "productName": "NanoClaw",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "resources/**/*"
  ],
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg"],
    "icon": "resources/icons/icon.icns"
  },
  "win": {
    "target": ["nsis"],
    "icon": "resources/icons/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true
  }
}
```

### Building

```bash
# macOS (requires macOS)
npm run build:mac    # → NanoClaw-Setup.dmg

# Windows (can cross-compile with wine)
npm run build:win    # → NanoClaw-Setup.exe

# Both
npm run build:all
```

---

## Background

### Current State

- **Setup**: Manual via `/setup` skill in Claude Code (455 lines of instructions)
- **Groups**: Registered in `data/registered_groups.json`
- **Google Auth**: OAuth flow via `npm run auth` for WhatsApp + separate Google OAuth via in-app prompts
- **Org Config**: YAML-based multi-team support exists in `config/organization.yaml`

### Reference: AtomicBot Approach

- "Download a regular app"
- "Guided setup"
- "Skills pre-installed"
- "User friendly interface"
- "One-click Google sign-in"

## Requirements

### Phase 1: Core Installer

1. **Download & Run**: Simple executable that bootstraps the entire setup
2. **Prerequisites Check**: Verify Docker, Node.js installed
3. **WhatsApp Auth**: QR code scanning flow
4. **Admin Selection**: Choose personal chat or group as admin
5. **Trigger Word**: Configure assistant name

### Phase 2: Group Creation (Optional)

1. **Department Groups**: Pre-defined templates for:
   - Accounting
   - Sales
   - Customer Support
   - Custom groups (user-defined)
2. **Google Auth per Group**: Either:
   - Shared admin Google account, OR
   - Individual Google accounts per department (OAuth flow)

### Phase 3: Admin Group (Optional)

1. Separate admin control group with elevated privileges
2. Can see all group activity (org mode)

## Architecture

### New Files

```
installer/
├── installer.ts          # Main CLI entry point
├── steps/
│   ├── prerequisites.ts # Docker, Node version check
│   ├── whatsapp.ts     # WhatsApp authentication
│   ├── admin.ts        # Admin user/group selection
│   ├── groups.ts      # Department group creation
│   └── google.ts      # Google OAuth flow
├── config/
│   └── templates.ts    # Default group configs
└── ui/
    └── wizard.ts       # CLI UI (Ink or Bling)
```

### Key Integration Points

1. **WhatsApp Auth**: Use existing `npm run auth` or wrap baileys directly
2. **Google OAuth**: Use existing `oauth-server.ts` with web server for callbacks
3. **Group Registration**: Write to `data/registered_groups.json`
4. **Org Config**: Generate `config/organization.yaml` for multi-team setups
5. **Credentials**: Create per-group credential directories

## Implementation Steps

### Step 1: CLI Framework
- Choose: Ink (React-based), Bling, or pure blessed
- Create basic wizard structure with steps
- Add --unattended mode for automation

### Step 2: Prerequisites Check
- Detect Docker installation and version
- Detect Node.js version (20+)
- Offer to install if missing

### Step 3: WhatsApp Auth Flow
- Start temporary WhatsApp connection
- Display QR code in terminal
- Wait for authentication confirmation
- Store credentials

### Step 4: Admin Selection
- Scan for personal chat vs groups
- Let user select which becomes "main" admin
- Configure trigger word

### Step 5: Department Group Creation
- Prompt: "Which departments do you want to create?"
- Options: Accounting, Sales, Customer Support, Custom
- For each: create folder, CLAUDE.md, register in JSON

### Step 6: Google OAuth (Per Group)
- For each group needing Google access:
  - Start local OAuth server
  - Open browser for Google login
  - Handle callback
  - Store tokens in group's .credentials/

### Step 7: Service Setup
- Generate launchd/systemd service file
- Start service
- Verify connectivity

## Configuration Schema

### Organization YAML (Generated)

```yaml
organization:
  id: acme-corp
  name: Acme Corporation
admin:
  whatsapp_jid: "1234567890@g.us"
  whatsapp_group_name: "Admin"
teams:
  - id: accounting
    name: Accounting
    whatsapp_group_name: "Accounting"
    email: accounting@acme.com
    credentials:
      gmail: .credentials/accounting/gmail-mcp
      calendar: .credentials/accounting/google-calendar-mcp
      drive: .credentials/accounting/google-drive-mcp
    drive_folders:
      - id: "folder-id-1"
        name: "Accounting Docs"
        access: read-write
  - id: sales
    name: Sales
    whatsapp_group_name: "Sales"
    # ...
```

### Registered Groups JSON (Generated)

```json
{
  "1234567890@g.us": {
    "name": "Admin",
    "folder": "admin",
    "trigger": "@Assistant",
    "added_at": "2026-02-14T12:00:00Z",
    "isAdmin": true
  },
  "accounting@g.us": {
    "name": "Accounting",
    "folder": "accounting",
    "trigger": "@Assistant",
    "added_at": "2026-02-14T12:00:00Z",
    "teamId": "accounting"
  }
}
```

## Group Folder Structure

```
groups/
├── admin/           # Admin group (if created)
│   ├── CLAUDE.md
│   ├── .credentials/
│   │   └── google-*/
│   └── logs/
├── accounting/      # Department group
│   ├── CLAUDE.md
│   ├── .credentials/
│   │   └── google-*/
│   └── logs/
├── sales/
│   └── ...
└── support/
    └── ...
```

## Per-Group CLAUDE.md Templates

### Department Group Template

```markdown
# Department Group

You are a departmental assistant for [DEPARTMENT NAME].

## Context
- Organization: [ORG NAME]
- Department: [DEPARTMENT]
- This group has access to [DEPARTMENT]'s Google Workspace

## Capabilities
- Read/write Google Sheets for [DEPARTMENT] data
- Access department Drive folder
- Read/send emails from [DEPARTMENT] inbox
- Manage [DEPARTMENT] calendar

## Guidelines
- Be helpful and professional
- Use WhatsApp-friendly formatting
- Escalate security concerns to Admin group
```

## UI/UX Design

### Installer Flow

```
╔═══════════════════════════════════════╗
║     NanoClaw Setup Wizard            ║
╠═══════════════════════════════════════╣
║ 1. Prerequisites      [✓ Complete]   ║
║ 2. WhatsApp Auth      [In Progress]   ║
║ 3. Admin Setup        [Pending]       ║
║ 4. Department Groups  [Pending]       ║
║ 5. Google Auth        [Pending]       ║
║ 6. Start Service     [Pending]       ║
╚═══════════════════════════════════════╝
```

### Interactive Prompts

1. **"Which departments do you want?"**
   - [x] Accounting
   - [x] Sales
   - [x] Customer Support
   - [ ] Custom (specify)

2. **"How should each department access Google?"**
   - Shared admin Google account (all departments share)
   - Individual Google accounts (each department has own OAuth)

3. **"Create an Admin group?"**
   - Yes (sees all group activity)
   - No (use personal chat as admin)

## Testing Plan

1. **Fresh Install**: Run installer on clean system
2. **Existing Setup**: Test upgrading existing installation
3. **Multi-Team**: Test with 3+ department groups
4. **Google Auth**: Test OAuth flow per group
5. **Service**: Verify service starts and responds

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WhatsApp rate limits | Add delays, handle errors gracefully |
| OAuth timeout | Increase callback timeout, retry |
| Docker not installed | Provide clear install instructions |
| Token refresh | Implement background refresh |
| Group permissions | Validate WhatsApp group access |

## Future Enhancements

- **Web UI**: Browser-based installer (Electron)
- **Remote Install**: Install on remote server via SSH
- **Migration Tool**: Import from existing OpenClaw setup
- **Auto-Update**: Installer updates itself

## Comparison: Current vs Installer

| Aspect | Current (/setup) | Installer |
|--------|------------------|-----------|
| UX | Claude Code prompts | Dedicated CLI wizard |
| Prerequisites | Manual check | Auto-detect + install |
| WhatsApp Auth | npm run auth (separate) | Integrated flow |
| Group Creation | Manual JSON editing | Interactive wizard |
| Google Auth | In-app prompts | OAuth in browser |
| Service Setup | Copy-paste commands | Auto-generate |

## Implementation Priority

### Phase 1: Electron Shell (Week 1)
1. Set up Electron project with React
2. Create wizard UI framework
3. Add prerequisites check step
4. Test building to .dmg/.exe

### Phase 2: Core Setup (Week 2)
1. Integrate nanoclaw source extraction
2. Build TypeScript + Docker image steps
3. WhatsApp QR code flow
4. Admin selection step

### Phase 3: Groups & Google (Week 3)
1. Department group selection UI
2. Group folder creation
3. Google OAuth per group
4. Config file generation

### Phase 4: Polish (Week 4)
1. Service setup (launchd/systemd)
2. Error handling & edge cases
3. Icons and branding
4. Test on Windows + macOS

---

## Technical Notes

### Bundling nanoclaw Source

Option 1: **Clone at build time**
- Installer runs `git clone https://github.com/gavrielc/nanoclaw.git`
- Pro: Smaller installer size (~50MB vs ~200MB)
- Con: Requires internet during install

Option 2: **Embed source**
- Include nanoclaw source in installer
- Pro: Works offline
- Con: Larger installer (~200MB)

**Recommendation**: Option 1 for v1 (simpler), Option 2 for production

### Docker in Electron

The installer needs Docker to:
1. Build the agent image (`docker build`)
2. Optionally verify installation

**Challenges**:
- Docker Desktop must be installed separately
- Show clear instructions if not found
- Can't run Docker inside the Electron app itself

### OAuth Callback

Google OAuth requires a callback URL. The installer:
1. Starts local server on `http://localhost:3456/oauth/callback`
2. Opens system browser for Google login
3. Google redirects to localhost after auth
4. Installer captures code, exchanges for tokens

### WhatsApp QR Code

Using baileys library:
1. Create temporary WhatsApp connection
2. Generate QR code as base64
3. Display in Electron window
4. Poll for successful scan
5. Save credentials to project directory
