

## NLE Integration: Add FCP XML and AAF-Compatible XML Exports

### What Changes
Expand the existing export system to include two additional industry-standard NLE formats alongside the current CMX 3600 EDL:
- **Final Cut Pro XML (FCPXML)** — native import for FCP and DaVinci Resolve
- **Adobe Premiere XML** — compatible with Premiere Pro, Avid via AAF-equivalent XML interchange

The "Get EDL + OTT Package" button becomes a dropdown/expanded export section offering all formats.

### Implementation

**File: `src/pages/Results.tsx`**

1. **Add two generator functions** next to existing `generateEDL` and `generateOTTManifest`:
   - `generateFCPXML(breakpoints, segments, title, durationSec)` — produces FCPXML v1.9 with markers at each breakpoint timecode, segment clips as storyline items, and proper `<fcpxml>` root structure
   - `generatePremiereXML(breakpoints, segments, title, durationSec)` — produces Premiere-compatible XML (xmeml format) with a sequence containing markers at breakpoint positions

2. **Update the `handleDownloadMasterPackage` callback** to download all four files (EDL, OTT JSON, FCPXML, Premiere XML) sequentially with 300ms delays between each.

3. **Update the DetailPanel export section**:
   - Rename button label from "Get EDL + OTT Package" to "Download NLE Package"
   - Add individual export buttons for each format: EDL, FCP XML, Premiere XML, OTT JSON
   - Group under a collapsible "Individual Formats" sub-section so the UI stays clean

4. **Update `ReadinessInfo`** to add an `fcpxml` readiness state (same logic as `edl` — ready when breakpoints exist).

5. **Update readiness indicator list** to show "FCP XML" and "Premiere XML" alongside existing EDL/OTT entries.

### Technical Detail
- FCPXML uses DTD v1.9 with `<asset-clip>` and `<marker>` elements; timecodes expressed as rational frames (e.g., `"86400/24s"`)
- Premiere XML uses the `xmeml` format with `<sequence>` containing `<marker>` nodes — this is the standard interchange format that both Premiere and Avid can import
- No new dependencies, files, or database changes needed — pure client-side string generation
- All formats use the same breakpoint/segment data already fetched

