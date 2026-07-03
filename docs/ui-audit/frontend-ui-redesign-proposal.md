# Frontend UI Redesign Proposal

Date: 2026-07-01
Status: Draft for review
Related audit: `docs/ui-audit/frontend-ui-adversarial-audit.md`

## One-Line Direction

Keep the existing Soft Editorial warmth, but shift the product from "soft centered cards" to a "warm workbench": denser, clearer, more operational, and less decorative.

## Decision To Review

I recommend an incremental redesign, not a visual reset. The current palette and MiSans typography are worth keeping. The main correction is hierarchy: stronger work surfaces, clearer state colors, less anonymous navigation, and screen layouts that expose the broadcast pipeline.

This proposal intentionally avoids a wholesale brand redesign. It keeps the project recognizable while fixing the parts that make repeated use slower.

## Design Principles

1. Workflow first: every page should show where the user is in the source-to-audio pipeline.
2. Pastel as semantic signal, not decoration: color means action, status, or risk.
3. Operational density over empty calm: blank space is useful only when it improves scanning.
4. Labels must be readable: helper text and settings copy are not ornamental.
5. Mobile should preserve orientation: compact UI is acceptable; anonymous UI is not.

## Proposed Visual System Adjustments

### Surfaces

Keep:

- `paper` as the global background.
- `paper-2` as the app chrome/sidebar background.
- translucent cards for secondary grouping.

Change:

- Primary work panels should become more solid, for example `bg-white/75` or `bg-white/80` using existing Tailwind opacity classes.
- Use `rounded-card` only on top-level panels.
- Use `rounded-xl` or `rounded-2xl` for inner controls and dense rows.
- Increase border visibility on dense surfaces from barely visible to intentional: avoid relying on `border-card-border` alone when the panel is critical.

Review question: do we want the app to remain magazine-soft, or become visibly more "tool-like"? I recommend tool-like, but still warm.

### Text Contrast

Current issue: `text-ink-soft/40` to `/60` appears throughout operational copy, and the audit measured these ranges below a serious readability bar.

Proposal:

- `text-ink`: primary text, field values, button text.
- `text-ink-soft`: labels, helper text, timestamps, status details.
- `text-ink-soft/70`: secondary metadata only.
- `text-ink-soft/50` and below: decorative version labels or empty-state embellishment only.

Implementation policy:

- Replace helper text like "用于资讯改写..." and "将提交到..." with at least `text-ink-soft`.
- Keep tiny decorative labels only when they are not needed to complete a task.

### Color Semantics

| Role | Proposed use | Notes |
| --- | --- | --- |
| `lemon` | Primary action only | Fetch, start, save, generate |
| `sage` | Success / saved / safe confirmation | Saved, completed, connection ok |
| `lilac` | Transform/edit action | Format, rewrite, split, re-edit |
| `pink` | Error and warning surfaces with ink text | Do not use white text on current pink |
| Neutral white/paper | Passive selection and secondary controls | Avoid making every selected tab lemon |

Specific changes:

- Stop using `lemon` for selected tabs when the same screen also has a primary action.
- Change dangerous buttons from `bg-pink text-white` to `bg-pink text-ink`, or add a stronger danger token later if allowed.
- Use `lilac` for "rewrite", "format", "split", and "re-edit" because those transform content.

Review question: should we introduce one new deeper danger token? If strict adherence to current tokens matters, do not add it; if clarity matters more, add it deliberately and update `frontend-styling`.

## Layout Proposal By Screen

### 1. Global App Shell

Current problem:

- Desktop sidebar is acceptable, but mobile becomes "AI + dots".
- Header always shows "系统在线", even when it competes with the page title.

Proposal:

- Desktop sidebar remains 256px.
- Replace circle glyphs with real icons from an icon library if one is added, or use simple text labels until icons are approved.
- Mobile should use either:
  - Option A: bottom tab bar with icons + short labels.
  - Option B: compact left rail with icons and visible active label.
- Move "系统在线" out of the mobile header. On desktop it can stay in the top-right; on mobile it can become a small status dot in the sidebar/header.
- Header becomes wrapping and content-aware:
  - title/subtitle on the left,
  - important page actions on the right,
  - system status demoted.

Recommended choice: Option B for smallest implementation diff. Option A is better ergonomically but touches the app shell more.

### 2. Source Collection

Current problem:

- A single centered card wastes the first viewport and hides the pipeline.

Proposed desktop layout:

```text
Header

Pipeline strip: Source -> Rewrite -> Edit -> Generate -> Save

Left column, 65%:
  Source controls
  Loaded news list

Right column, 35%:
  Today summary
  Rewrite readiness
  Recent broadcast / next action
```

Behavior:

- Before fetching: right column explains the next step and shows recent broadcast if available.
- After fetching: loaded news list takes the main column; rewrite action becomes prominent and sticky within the card header.
- After rewrite: show a clear "Go to editor" action rather than relying only on navigation.

Review decision:

- Should source collection become the true dashboard/home screen? I recommend yes. It is the natural entry point for the product.

### 3. Script Editor

Current problem:

- This is the best screen structurally, but empty states are passive.
- The voice panel is useful but may dominate at narrow desktop widths.

Proposal:

- Keep the split editor layout.
- Empty script state should include direct actions:
  - "获取资讯"
  - "导入转录稿"
  - "从历史继续编辑"
- Make the left voice panel collapsible on laptop widths.
- Add a small workflow summary above the preview:
  - script length,
  - split status,
  - generated segments,
  - audio saved state.

Do not:

- Do not move voice generation below the editor on desktop; that would weaken the workflow.

### 4. Transcribe

Current problem:

- The form works, but upload controls are clickable `div`s and parameter hierarchy is flat.
- Batch and single mode share a lot of structure but do not clearly explain task state.

Proposal:

- Make upload surfaces semantic labels/buttons with focus-visible states.
- Separate the page into:
  - mode switch,
  - upload,
  - recognition settings,
  - progress/result.
- Put advanced WSL context fields behind an "Advanced" disclosure unless WSL is selected.
- Result actions should use consistent priority:
  - primary: "导入稿件"
  - transform: "查看 / 排版"
  - secondary: "复制", "下载 TXT"

Mobile:

- Keep a single column.
- Make result action buttons wrap into two rows with fixed minimum hit targets.

### 5. History

Current problem:

- The row data is useful, but status, duration, action, saved marker, and re-edit compete.
- Delete uses weak danger contrast.

Proposal:

- Convert rows to a more table-like layout on desktop:
  - title/content preview,
  - created time,
  - duration,
  - status,
  - actions.
- Use a small saved pill instead of a star glyph if saved state matters.
- In multi-select mode, move destructive action into a sticky selection toolbar.
- Use `bg-pink text-ink` or a future stronger danger token for delete.

### 6. Settings

Current problem:

- The content is valuable but too long and weakly navigable.

Proposal:

- Add internal settings navigation:
  - LLM
  - TTS / ASR
  - Voice
  - Broadcast copy
  - Schedule
- Desktop: two-column layout with sticky section nav on the left and forms on the right.
- Mobile: accordion sections or sticky horizontal tabs.
- Split API settings into smaller sections rather than one large "API 配置" card.
- Keep autosave behavior, but show a clearer save state:
  - "Saved"
  - "Saving"
  - "Unsaved changes"
  - field-level errors when available.

Recommended layout:

```text
Settings header

Left rail:
  LLM
  TTS / ASR
  Voice
  Broadcast copy
  Schedule

Right content:
  One focused section at a time, or stacked sections with anchor navigation.
```

Review decision:

- For a developer/operator tool, I recommend stacked sections with a sticky side nav, not tabbed hidden content. Users may need to compare settings across sections.

## Component-Level Proposal

### Create shared style helpers before touching pages

This is optional but recommended. The code currently repeats long Tailwind class strings. The redesign will be easier and more consistent if we introduce local constants or small components:

- `Panel`
- `SectionTitle`
- `PrimaryButton`
- `SecondaryButton`
- `DangerButton`
- `MutedText`
- `SegmentedControl`
- `UploadDropzone`

Constraint:

- Keep these as project-local components, not a new design system package.
- Do not introduce a UI library.

### Button priority

| Priority | Style | Use |
| --- | --- | --- |
| Primary | `bg-lemon text-ink` | Continue/start/save/fetch |
| Safe confirm | `bg-sage text-ink` | Save completed, connection ok |
| Transform | `bg-lilac text-ink` | Rewrite, format, split |
| Danger | `bg-pink text-ink` | Delete, destructive confirmation |
| Passive | neutral background, ink-soft text | Cancel, copy, download |

### Empty states

Every empty state should include one recovery action when possible:

- No script: fetch news, import transcription, open history.
- No history: go to source collection.
- No transcription result: upload media.
- No schedules: add schedule.

## Implementation Plan

### Phase 1: Safety and readability

Scope:

- Fix low-contrast operational text.
- Fix pink danger text contrast.
- Add focus-visible treatment.
- Replace mobile anonymous nav glyphs with clearer labels/icons.

Acceptance criteria:

- No destructive button uses `text-white` on current `pink`.
- Operational helper text avoids `text-ink-soft/40` and `/45`.
- Keyboard focus is visible on nav, buttons, selects, inputs, upload areas.
- Mobile navigation can be understood without memorizing item order.

Risk: low. Mostly styling and component markup.

### Phase 2: Source collection as workflow home

Scope:

- Recompose source collection into dashboard-like two-column workbench.
- Add pipeline strip.
- Add next action and recent state.
- Improve post-fetch and post-rewrite hierarchy.

Acceptance criteria:

- Desktop first viewport no longer looks empty.
- Fetch and rewrite states are visibly connected.
- User has a direct action to continue to editor after rewrite.

Risk: medium. Requires page layout and possibly store selectors for recent state.

### Phase 3: Settings restructuring

Scope:

- Add settings section nav.
- Split API settings into LLM and TTS/ASR sections.
- Improve mobile accordion or sticky section behavior.
- Clarify autosave state.

Acceptance criteria:

- User can jump to ASR settings without scrolling through all LLM fields.
- Mobile settings page does not feel like one endless unstructured form.
- Field labels and helper text remain readable.

Risk: medium. Settings has more state and autosave behavior; test carefully.

### Phase 4: Transcribe and history polish

Scope:

- Make upload areas semantic and keyboard accessible.
- Add advanced disclosure for WSL fields.
- Align history rows into a cleaner table-like structure.
- Add sticky selection toolbar in multi-select mode.

Acceptance criteria:

- Upload can be activated with keyboard.
- Result actions have clear priority.
- History rows scan consistently across title, time, duration, status, and action.

Risk: medium-low.

## What I Would Not Do Yet

1. Do not change the brand name, typography, or overall warm paper identity.
2. Do not add heavy illustration or hero imagery; this is an operational app.
3. Do not introduce a large component library.
4. Do not convert the whole app to a dark theme.
5. Do not redesign backend/API flows as part of this UI pass.

## Review Checklist

Please review these decisions before implementation:

1. Keep Soft Editorial, but make it more tool-like: approve or reject?
2. Source collection becomes dashboard/home: approve or reject?
3. Mobile nav: compact left rail vs bottom tab bar?
4. Add a stronger danger token, or stay strictly within current token set?
5. Settings: sticky side nav with stacked sections vs tabbed single-section view?
6. Introduce small shared UI primitives before page changes: approve or reject?

## Recommended Default Decisions

If no preference is given, I would implement:

1. Keep Soft Editorial but increase density and contrast.
2. Make source collection the workflow home.
3. Use compact left rail first to minimize layout churn.
4. Stay within current token set for phase 1; use `bg-pink text-ink` for danger.
5. Use sticky side nav for settings on desktop and accordion sections on mobile.
6. Add small shared UI primitives only where they reduce repeated Tailwind strings.

