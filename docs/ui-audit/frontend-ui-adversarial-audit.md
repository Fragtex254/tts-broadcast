# Frontend UI Adversarial Audit

Date: 2026-07-01
Branch: `codex/frontend-ui-adversarial-audit`

## Audit Scope

This audit reviews the current React frontend from screenshots and source code. The product goal is not a marketing site; it is an operational tool for collecting AI news, editing broadcast scripts, generating TTS audio, transcribing media, reviewing history, and configuring API providers.

Evidence captured in this run:

| Step | Screenshot | Health |
| --- | --- | --- |
| 1 | `output/frontend-ui-audit/01-source-collection-desktop.png` | Functional but spatially under-composed |
| 2 | `output/frontend-ui-audit/02-script-editor-desktop.png` | Best workflow density, but left rail dominates |
| 3 | `output/frontend-ui-audit/03-transcribe-desktop.png` | Functional, clearer than source screen, but form hierarchy is weak |
| 4 | `output/frontend-ui-audit/04-history-desktop.png` | Data-dense enough, but row actions and status language are visually noisy |
| 5 | `output/frontend-ui-audit/05-settings-desktop.png` | Most complete screen, but small text contrast and section navigation are weak |
| 6 | `output/frontend-ui-audit/06-source-collection-mobile.png` | Usable, but navigation identity is too abstract |
| 7 | `output/frontend-ui-audit/07-transcribe-mobile.png` | Usable, but vertical density and repeated controls create fatigue |
| 8 | `output/frontend-ui-audit/08-settings-mobile.png` | Technically responsive, but long-form settings need stronger structure |

## First-Principles Standard

For this product, the interface should optimize for repeated work, confidence, and state clarity. The user is not browsing; they are moving assets through a pipeline. That implies:

1. The main flow should be visible: collect source material, rewrite, edit, split, generate audio, save or export.
2. Every screen should spend its pixels on current task state, not on decorative emptiness.
3. Color should encode action, state, and risk consistently.
4. Settings and transcription should privilege scanability, because mistakes are expensive.
5. Mobile does not need to be feature-poor; it needs clear navigation and progressive disclosure.

## Summary Judgment

The current UI has a coherent soft editorial direction, but it applies that direction too literally. The result is pleasant at first glance and inefficient under scrutiny. It uses warm paper, translucent cards, large radius, and pastel accents everywhere; because almost every surface is soft, the interface lacks enough contrast between "what I can do now", "what already happened", "what is selected", and "what is risky".

The strongest existing decision is the overall restrained palette. The weakest decision is treating a production workflow app as a centered card composition on many screens.

## Color Findings

### 1. The dominant paper palette is overextended

`frontend/src/index.css` defines `paper`, `paper-2`, translucent card fill, and very low-opacity borders in one warm family. In screenshots, the sidebar, page background, cards, inputs, and empty areas are too close in temperature and luminance. This makes the app feel calm, but it also makes task boundaries mushy.

Source: `frontend/src/index.css:6`, `frontend/src/index.css:15`, `frontend/src/index.css:16`.

Recommendation: keep `paper` as the page base, but introduce a stronger operational surface token for working panels. Do not make every panel translucent. Use translucent treatment only for secondary grouping, not primary forms.

### 2. Low-opacity secondary text is below a serious readability bar

Measured contrast against the current paper/card approximations:

| Pair | Approx contrast |
| --- | ---: |
| `text-ink` on `paper` | 13.22 |
| `text-ink-soft` on `paper` | 6.50 |
| `text-ink-soft/60` on `paper` | 2.69 |
| `text-ink-soft/45` on `paper` | 2.03 |
| `text-ink-soft/40` on `paper` | 1.86 |

The base colors are fine; the opacity usage is not. Many labels and helper texts use `/40`, `/45`, `/50`, or `/60`, especially in settings and transcription. These are not just aesthetic choices; they make labels, help text, and state details disappear for users with lower contrast sensitivity or bright displays.

Recommendation: reserve opacity below `/60` for decorative metadata only. Form labels, helper text, status copy, and operational instructions should use at least `text-ink-soft` or a dedicated `text-muted` token that passes contrast on `paper` and card surfaces.

### 3. Lemon is doing too many jobs

`lemon` is used for primary action, selected tabs, active ASR provider, progress-adjacent controls, and category color. It has good contrast with ink, but semantically it becomes overloaded. In screenshots, selected state and "go" action look almost identical.

Source examples: `frontend/src/components/Dashboard/QuickGenerate.tsx:100`, `frontend/src/pages/Transcribe.tsx:448`, `frontend/src/pages/Settings.tsx:255`.

Recommendation: split primary action and selection. Keep `lemon` for primary calls to action, move selected segmented controls to a lower-chroma token or bordered active state.

### 4. Pink is too soft for destructive risk, and one current use is objectively wrong

The design system says pink is danger/emphasis, but pastel pink reads like editorial emphasis, not destructive risk. Worse, `white` text on the current pink is only about 2.04 contrast, while ink on pink is about 7.53. History multi-delete uses `bg-pink text-white`, which is both weak danger signaling and low contrast.

Source: `frontend/src/pages/History.tsx:207`.

Recommendation: destructive actions need a deeper semantic danger token, or continue using pink only as a background with ink text. Do not use white text on current `pink`.

### 5. Lilac works visually but is too often a generic secondary action

Lilac is used for secondary actions, selection, status dots, modal-like actions, and some card headings. It is attractive, but in the current system it becomes the "anything that is not primary" color.

Recommendation: give lilac a narrower semantic role, such as "transform/format/edit", and make passive secondary actions mostly neutral.

## UX And Interaction Findings

### 1. The source collection screen wastes the first viewport

The page wraps a single small `QuickGenerate` card in `max-w-3xl mx-auto`, leaving most of the desktop canvas empty. The user sees a huge blank field, not the broadcast pipeline. This is the largest first-impression problem.

Source: `frontend/src/pages/SourceCollection.tsx:17`.

Recommendation: turn the first screen into a functional pipeline overview. At minimum, show recent source status, loaded items, rewrite readiness, and next-step affordance alongside the fetch card. A centered single card is too thin for an operational app.

### 2. The app's workflow is hidden behind navigation

The user must infer that source collection leads to editor, editor leads to audio generation, and history is a later review surface. The sidebar lists pages, but does not express process.

Recommendation: add a compact workflow indicator or contextual next action within the main content. For example, after collecting news, the screen should visually reveal "rewrite script" as the next major step rather than burying it inside the card after data loads.

### 3. Mobile navigation becomes anonymous dots

On mobile, the sidebar hides labels and uses the same open-circle glyph for almost every nav item. This makes the app depend on memorized position rather than recognition.

Source: `frontend/src/components/Layout/Sidebar.tsx:4`, `frontend/src/components/Layout/Sidebar.tsx:42`.

Recommendation: replace text glyphs with real icons plus accessible labels. Consider bottom navigation on mobile if the app is expected to be used on phones.

### 4. Header actions compete with titles on narrow screens

`Header` uses `flex items-end justify-between` without wrapping. On mobile, the title, subtitle, and "系统在线" pill fight for one row. The pill is not important enough to occupy prime header space on every screen.

Source: `frontend/src/components/Layout/Header.tsx:11`, `frontend/src/components/Layout/Header.tsx:23`.

Recommendation: let header content wrap, demote system status to sidebar/footer or a small global indicator, and keep page title/subtitle dominant.

### 5. Settings has strong content but weak wayfinding

The settings screen has high functional value, but it is one long stack inside `max-w-3xl`. API, ASR, voice, broadcast scripts, save status, and schedules all compete in one vertical stream. On mobile this becomes especially fatiguing.

Source: `frontend/src/pages/Settings.tsx:224`.

Recommendation: add settings section navigation or sticky internal tabs. Group by user intent: "LLM", "TTS/ASR", "Voice", "Broadcast copy", "Schedules". The current card sequence is visually tidy but operationally slow.

### 6. Script editor is the best screen, but its default state is still too empty

The split layout is appropriate for editing, and the left voice panel gives the screen real workflow density. However, when no script is loaded, the right area is mostly empty cards. The empty state tells the user what to do, but it does not offer a direct route back to source collection.

Source: `frontend/src/pages/ScriptEditor.tsx:88`, `frontend/src/pages/ScriptEditor.tsx:111`.

Recommendation: empty states should include explicit recovery actions, such as "获取资讯" or "导入转录稿", not only explanatory text.

### 7. Upload controls look clickable but are not fully accessible

The upload areas are clickable `div`s with hidden file inputs. They are visually clear with a mouse, but they are not exposed as buttons and need keyboard behavior.

Source: `frontend/src/pages/Transcribe.tsx:468`.

Recommendation: make the visible upload surface a `button` or label associated with the file input, with focus-visible styling and keyboard activation.

### 8. Rounded cards are overused for dense tools

The project design system uses `rounded-card` at 24px. This is acceptable for soft editorial cards, but in this app it is applied to dense settings panels, upload forms, history containers, and nested areas. The softness reduces precision.

Source: `frontend/src/index.css:20`.

Recommendation: keep 24px only for large top-level panels. Use 12px or 16px for dense controls and inner panels. This will make the interface feel more like a tool and less like a moodboard.

### 9. Some button content uses symbols or emoji-like markers as functional text

Examples include circular nav glyphs, "✦ 一键改写口播稿", "✓ 多选", and delete/edit symbols. These create visual noise and can be ambiguous for assistive tech.

Source: `frontend/src/components/Dashboard/QuickGenerate.tsx:121`, `frontend/src/pages/History.tsx:218`.

Recommendation: use an icon library with accessible names, or plain text for commands. Symbols should not carry the only meaning.

## Recommended Redesign Priorities

### P0: Fix readability and destructive contrast

1. Remove `text-white` from pink danger actions.
2. Create a readable muted text token and stop using `text-ink-soft/40` through `/50` for operational text.
3. Add visible focus states to buttons, selects, file upload surfaces, and segmented controls.

### P1: Recompose the main workflow surfaces

1. Replace the source collection single centered card with a two-column or pipeline layout on desktop.
2. Give empty states direct action buttons.
3. Make history rows more table-like: title, age, duration, status, actions should align consistently.

### P2: Improve mobile navigation and settings structure

1. Replace mobile sidebar dots with icons and labels, or use bottom navigation.
2. Add internal settings navigation or collapsible groups.
3. Let `Header` wrap and demote "系统在线".

### P3: Tighten the visual language

1. Reduce card radius in dense tool surfaces.
2. Use solid surfaces for primary working areas and translucent cards for secondary grouping.
3. Narrow semantic color roles: lemon for primary action, sage for success/saved, pink or a new stronger token for danger, lilac for transform/edit.

## Evidence Limits

This audit used screenshots, DOM snapshots, and source inspection. It did not run a full keyboard-only pass, screen-reader pass, color-blind simulation, or end-to-end task with real external API data. Those should be done before claiming accessibility compliance.

