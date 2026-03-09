# Unified Creation Modal — User Guide

## Quick Start

### Opening the Modal

Three ways to create items:

1. Press `Cmd+K` (Mac) or `Ctrl+K` (Windows) anywhere in the app
2. Click the **[+ Create]** floating button (bottom-right corner)
3. Press `Enter` while the name field is focused to submit

### Creating Your First Item

1. **Choose Type** — click one of the four tabs:
   - **Focus** — top-level life area (e.g. Building, Health)
   - **Sub-Focus** — domain within a focus (e.g. Authentication)
   - **Epic** — large initiative (e.g. Login System)
   - **Story** — individual task (e.g. Add password reset)

2. **Enter a Name** — keep it short and action-oriented

3. **Select Hierarchy** — choose where the item belongs:
   - Stories require: Focus → Sub-Focus → Epic
   - Epics require: Focus → Sub-Focus
   - Sub-Focuses require: Focus
   - Focuses have no parent

4. **Click Create**:
   - **Create & Close** — saves and closes the modal
   - **Create & Add Another** — saves and stays open (rapid-fire mode)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open modal |
| `Escape` | Close modal |
| `Enter` | Submit (when name field is focused) |
| `Cmd+Enter` / `Ctrl+Enter` | Create & Add Another |
| `Tab` / `Shift+Tab` | Navigate between fields |

---

## Rapid-Fire Creation

For creating many stories quickly:

1. Open modal (`Cmd+K`)
2. Select Focus → Sub-Focus → Epic once
3. Type story name
4. Press `Cmd+Enter` — saves and clears the name field
5. Type next story name, repeat

The hierarchy selection is preserved between entries so you only set it once.

---

## Smart Defaults

The modal remembers your last-used hierarchy and pre-fills dropdowns when you reopen it. If you're viewing a particular epic or sub-focus, those selections are filled in automatically.

---

## Undo

After creating an item you have **5 seconds** to undo:

1. A success toast appears with an **[Undo]** button
2. Click **[Undo]**
3. The item is deleted and the cache refreshes

---

## Validation & Errors

### Required Fields

| Item | Required |
|------|----------|
| All | Name (max 200 chars) |
| Story | Epic |
| Epic | Sub-Focus |
| Sub-Focus | Focus |

### Error Display

If something is wrong you'll see:
- A **red banner** at the top of the form with a specific message
- The **problematic field highlighted** in red with a shake animation
- The field is focused automatically so you can fix it immediately

The banner disappears as soon as you start editing the highlighted field.

---

## Form Recovery

If you fill out the form and the browser closes or the page refreshes before you submit, the form state is saved automatically for **5 minutes**. The next time you open the modal you'll see a toast saying "Form recovered from last session" and all fields will be restored.

---

## Mobile Usage

On phones and tablets:
- The modal is full-screen
- Swipe down from the top to close
- Input text is 16px (prevents iOS zoom)
- All touch targets are finger-friendly

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Epic not found" | Epic was deleted | Select a different epic |
| "A story named X already exists" | Duplicate name in same epic | Use a more specific name |
| Dropdown is disabled | Parent not selected | Select the parent first |
| Changes not appearing | Stale cache in another tab | Close and reopen the modal |
| Undo button gone | 5-second window expired | Change manually if needed |
