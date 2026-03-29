

## Update Delivery Target Options

**What changes**: Update the delivery target dropdown in `src/pages/Index.tsx` to include OTT as a separate option and add a recommended "Streaming/SVOD" option.

### Current options (line 473-475):
- `broadcast` — Broadcast / Master · Act structures
- `cable_vod` — Cable / VOD · 8-12 min intervals
- `youtube` — YouTube · 3-5 min intervals

### New options:
- `broadcast` — Broadcast · Act-break structures (22/44 min)
- `cable` — Cable · 8-12 min intervals
- `ott` — OTT / Streaming · Flexible mid-rolls ⭐ Recommended
- `youtube` — YouTube · 3-5 min intervals

### Files to edit:
1. **`src/pages/Index.tsx`** — Replace the three `<option>` elements (lines 473-475) with four updated options. Update default state from `"broadcast"` to keep as-is. Update the `SAMPLE_VIDEO` constant's `delivery_target` if desired.

2. **`src/pages/Results.tsx`** — Update the OTT manifest fallback on line 127 from `"broadcast"` to remain `"broadcast"` (no change needed, it's just a fallback).

No database migration needed — `delivery_target` is a free-text column.

