

## Update Business Case PDF & Explainability Polish

### Overview
Three updates: (A) rewrite the Business Case PDF with hackathon-aligned content emphasizing quantified ROI, (B) improve AI explainability labels in tooltips and detail panels, (C) confirm multi-pass chunk duration is already set to 7200s (done in prior fix).

### A. Business Case PDF Rewrite
**File: `src/components/results/BusinessCasePDF.tsx`**

Replace the current generic content with hackathon-specific messaging:

- **Problem Statement section**: "Manual segmentation costs $50–$100/hr in editor time. Poorly placed ad breaks reduce viewer engagement by 15–30%."
- **Solution section**: "StoryBreak AI automates semantic segmentation and highlight reel generation, reducing asset research and editing time by 70–90%."
- **Quantified Impact metrics** (replace current illustrative ones):
  - "8 hrs → 12 min" (asset research time)
  - "~$400 saved per request"
  - "70–90% time reduction"
- **Dynamic data**: Use actual `segmentCount`, `breakpointCount`, `highlightCount` from the analysis (already passed as props)
- **Keep**: Project metadata table, compliance table, technology stack, styled dark theme
- **Remove**: The "illustrative estimates" disclaimer — frame metrics as industry benchmarks with source attribution

### B. UI Explainability Polish
**File: `src/pages/Results.tsx`**

Update copy in these locations:

1. **Timeline segment tooltips** (~line 453-457): Change generic "Story Unit" label to include the AI summary. Already shows `seg.summary` but the title just says the type — prepend with a human-readable explanation like "Story transition" or "Narrative beat" based on segment type.

2. **Breakpoint tooltips** (~line 494-499): Already shows `bp.reason` and `bp.valley_type` — enhance the tooltip title from just "Breakpoint" to contextual text like "Recommended pause — {valley_type label}".

3. **Highlight tooltips** (~line 517-522): Add `hl.reason` to the tooltip (currently only shows score/rank). Show why the highlight was selected.

4. **Detail panel headers** (~line 729): Change "What We Found" to "Why We Chose This" — more explainable framing.

5. **Breakpoint storyboard cards** (~line 655): Change "Narrative Valley" subtitle to something more descriptive: "Natural pause for ad placement".

6. **ReasonBox titles** (~line 837-838): Already uses "Why This Break" and "Why This Highlight" — these are good. Keep as-is.

### C. Multi-Pass Confirmation
The `CHUNK_DURATION` constant was already raised to 7200s in a prior fix. No changes needed. The 5-minute overlap logic in `calculateChunks` is already implemented.

### Technical Detail

All changes are in two files:
- `src/components/results/BusinessCasePDF.tsx` — full rewrite of the HTML template string with hackathon-aligned content
- `src/pages/Results.tsx` — ~6 small string/copy changes in tooltip content and detail panel labels

No database, edge function, or structural changes required.

