# Transcript Conversation View — Design QA

- Source visual truth: `/Users/jinghao/.codex/generated_images/019f63f4-bb6f-7853-89cf-c0fcdc842d00/exec-a5e7373a-44e8-4152-905f-a2e6d1620ca3.png`
- Implementation screenshot: `/private/tmp/tts-broadcast-design-qa/.codex-transcript-modal-final-latest.png`
- Desktop viewport: `1440 × 1024`
- Mobile evidence: `/private/tmp/tts-broadcast-design-qa/.codex-transcript-modal-mobile-latest.png` at `390 × 844`
- State: transcript secondary dialog open; turn 4 (`说话人 2`, `0:29–1:07`) active; speaker rail and current-location panel synchronized.
- Full-view comparison: `/private/tmp/tts-broadcast-design-qa/.codex-transcript-design-comparison-latest.png`
- Focused active-turn comparison: `/private/tmp/tts-broadcast-design-qa/.codex-transcript-design-focus-comparison-latest.png`

## Findings

- No actionable P0, P1, or P2 differences remain.
- The implementation intentionally uses the project's blue-toned `lilac` semantic token instead of the mock's more purple lavender. This preserves the existing Warm Workbench design system while keeping the selected-speaker linkage clear.
- Speaker labels and transcript copy are dynamic production data. The implementation therefore shows the saved labels (`说话人 1` / `说话人 2`) and factual ASR text rather than hard-coding the mock's `主持人` / `Zara` labels or rewriting its paragraph structure. Users can still rename speakers through the existing speaker panel.

## Required Fidelity Surfaces

- Fonts and typography: MiSans App is used for both display and body roles, with 15px transcript text and 1.85 line height. Speaker labels, timestamps, body copy, and metadata maintain the hierarchy of the source without clipping at desktop or mobile widths.
- Spacing and layout rhythm: the near-fullscreen dialog, sticky speaker rail, constrained central reading column, quiet current-location panel, and full-region active treatment match the selected three-zone composition. Long turns retain readable measure and vertical rhythm.
- Colors and visual tokens: all surfaces use existing `paper`, `ink`, `blush`, `lilac`, `sage`, and `lemon` Tailwind tokens. No hard-coded colors or gradients were introduced. Active, muted, focus, and selected states remain distinguishable with sufficient text contrast.
- Image quality and asset fidelity: the source contains no raster imagery, brand art, or custom illustrations to reproduce. UI icons use the Phosphor icon library; no custom SVG, CSS icon drawing, emoji, or placeholder asset is used.
- Copy and content: app-specific controls are concise and functional (`搜索逐字稿`, `只看此人`, `校对文字`, `清除筛选`). Dynamic ASR copy remains unmodified.
- Responsiveness: at 390 × 844 the search control moves below the header, speaker cards become a horizontal rail, the reading column stays single-column, and no primary control or transcript text is clipped horizontally.
- Accessibility: the dialog inherits Escape close behavior from `ModalShell`; search controls are labelled; speaker filters expose pressed state; turns are keyboard-focusable with descriptive accessible names; hover state has a keyboard-focus equivalent.

## Interaction Verification

- Opened the secondary dialog from `打开对话视图`.
- Searched the real 460-turn transcript and verified the result set narrowed to 11 matching turns for `活人感`.
- Combined search with a speaker filter, then cleared both states.
- Activated a transcript region and verified the turn, speaker card, and current-location panel updated together.
- Verified the mobile layout at 390 × 844.
- Checked the browser console after a clean dev-server restart: no warnings or errors.

## Comparison History

### Iteration 1 — blocked by P2 findings

- P2, mobile header: desktop search consumed the mobile header and truncated the title to a few characters.
  - Fix: moved search into the mobile content rail while keeping the desktop field in the header.
  - Post-fix evidence: `/private/tmp/tts-broadcast-design-qa/.codex-transcript-modal-mobile-latest.png` shows the full title, close control, search field, and speaker rail without collision.
- P2, transcript density: row monograms made the central reading stream busier than the selected editorial mock.
  - Fix: retained monograms in the stable speaker rail and removed them from individual turns, leaving speaker label, timestamp, and color rail close to the text.
  - Post-fix evidence: focused comparison shows the selected turn following the mock's magazine-interview hierarchy.
- P2, icon fidelity: search, filter, visibility, and correction actions initially relied on text alone.
  - Fix: added consistent Phosphor icons while preserving visible text labels and accessible names.
  - Post-fix evidence: latest desktop and mobile captures show consistent lightweight line icons.
- P2, whitespace-only query: a spaces-only query could display an empty quoted filter label.
  - Fix: query state now uses trimmed content for filter visibility and summary copy.

### Iteration 2 — passed

- Re-captured desktop and mobile states after fixes.
- Full-view and focused comparisons show no remaining P0/P1/P2 mismatch.
- No additional visual fixes were required after the final comparison.

## Follow-up Polish

- P3: the active-turn outline is slightly stronger than the mock. It is retained because the user explicitly prioritized unmistakable hover-region emphasis.

## Implementation Checklist

- [x] Secondary interface uses shared `ModalShell`.
- [x] Speaker identity repeats next to every turn.
- [x] Hover/focus synchronizes three visual regions on desktop.
- [x] Search, speaker filtering, pagination, close, and correction controls work.
- [x] Desktop and mobile layouts are visually verified.
- [x] Browser console is clean after a fresh server start.

final result: passed
