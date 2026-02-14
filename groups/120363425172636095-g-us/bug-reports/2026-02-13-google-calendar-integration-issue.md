# 🐛 BUG REPORT - Google Calendar Integration Issue

**Reporter:** Verch (Personal Assistant for Agam)
**Date:** February 13, 2026 @ 10:46 AM
**Severity:** High - User unable to add calendar events

---

## Issue Description

User requested adding 3 dinner events to Google Calendar. Attempted to use Google Calendar API to create events programmatically, but received "No such tool available" error.

### Details

- **User Request:** Add 3 calendar events with reminders (Valentine's Day dinner Feb 14 @ 5:30 PM, and two additional dinners in March)
- **Expected Behavior:** Calendar events should be created directly in user's Google Calendar
- **Actual Behavior:** API call fails with error "No such tool available: mcp__gcalendar__create_event"

### Technical Information

- Attempted tool: `mcp__gcalendar__create_event`
- Error message: "Error: No such tool available: mcp__gcalendar__create_event"
- Available MCP servers detected: gdrive, google-calendar, gmail, figma, nanoclaw
- Note: Server "google-calendar" exists but has no accessible resources/tools listed

### Reproduction Steps

1. User requests calendar event creation
2. Assistant attempts to call mcp__gcalendar__create_event
3. Tool call fails - tool not available in system

## Impact

- Users cannot add calendar events programmatically
- Workaround requires manual calendar entry (poor UX)
- Affects basic personal assistant functionality

## Requested Action

Please check:
1. Is the Google Calendar tool properly configured/registered?
2. What is the correct tool name for calendar event creation?
3. Are proper OAuth credentials configured for Google Calendar access?

---

**Status:** Pending Investigation
**Assigned to:** @Chris
