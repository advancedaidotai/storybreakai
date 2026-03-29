# StoryBreak AI — Technical Documentation
### Twelve Labs Hackathon Submission
**MineYourMedia / AdvancedAI.ai**  
GitHub: https://github.com/advancedaidotai/storybreakai  
Generated: 2026-03-29

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Algorithm Explanation — Semantic Boundary Detection](#3-algorithm-explanation--semantic-boundary-detection)
   - 3.1 [The Semantic Narrative Valley Concept](#31-the-semantic-narrative-valley-concept)
   - 3.2 [Platform-Aware Prompt Engineering](#32-platform-aware-prompt-engineering)
   - 3.3 [Multi-Pass Chunking for Long-Form Content](#33-multi-pass-chunking-for-long-form-content)
   - 3.4 [Merge & Deduplication Pipeline](#34-merge--deduplication-pipeline)
   - 3.5 [Response Parsing & Validation](#35-response-parsing--validation)
   - 3.6 [Segment-Boundary Fallback](#36-segment-boundary-fallback)
4. [Feature Engineering — Multimodal Signals](#4-feature-engineering--multimodal-signals)
   - 4.1 [Visual Signals](#41-visual-signals)
   - 4.2 [Audio Signals](#42-audio-signals)
   - 4.3 [Temporal Signals](#43-temporal-signals)
   - 4.4 [How StoryBreak AI Leverages These Signals](#44-how-storybreak-ai-leverages-these-signals)
5. [Performance Metrics](#5-performance-metrics)
   - 5.1 [Processing Time](#51-processing-time)
   - 5.2 [Scalability Architecture](#52-scalability-architecture)
   - 5.3 [Memory & Resource Usage](#53-memory--resource-usage)
   - 5.4 [API Limits & Throughput](#54-api-limits--throughput)
6. [Database Schema](#6-database-schema)
   - 6.1 [Table Definitions](#61-table-definitions)
   - 6.2 [Enums](#62-enums)
   - 6.3 [Indexes, Foreign Keys & Constraints](#63-indexes-foreign-keys--constraints)
   - 6.4 [Project Status State Machine](#64-project-status-state-machine)
7. [Export Formats](#7-export-formats)
   - 7.1 [EDL (CMX 3600)](#71-edl-cmx-3600)
   - 7.2 [OTT/VMAP JSON](#72-ottvmap-json)
   - 7.3 [Full Analysis JSON](#73-full-analysis-json)
8. [Technology Stack](#8-technology-stack)
9. [Complete Data Flow](#9-complete-data-flow)
10. [Security & Configuration](#10-security--configuration)

---

## 1. Project Overview

**StoryBreak AI** is a video intelligence platform that uses Twelve Labs Pegasus 1.2 via AWS Bedrock to analyze long-form video content and detect optimal ad-break insertion points using Semantic Narrative Valley detection — moments where narrative tension, dialogue density, and musical intensity are simultaneously low, creating organic pauses where advertising feels natural rather than intrusive.

Built by **MineYourMedia / AdvancedAI.ai** for the Twelve Labs Hackathon, StoryBreak AI addresses a real pain point in the media and ad-tech industry: ad breaks that interrupt natural story moments damage viewer experience, drive churn, and devalue ad inventory. Traditional solutions rely on shot detection or fixed intervals. StoryBreak AI uses Pegasus 1.2's deep multimodal video understanding to perform genuine story comprehension — identifying the exact frames where drama subsides, dialogue pauses, and music quiets, delivering break points that feel earned rather than forced.

The platform supports seven delivery targets (YouTube, Social, OTT, Cable, Cable VOD, Broadcast, Streaming), three content types (short-form, TV episode, feature film), dynamically scales expected output counts based on video duration, and handles videos over 60 minutes via an async multi-pass chunking pipeline with automatic merge and deduplication. Export formats include industry-standard EDL (CMX 3600), VMAP-compatible OTT JSON, and full analysis JSON — ready for immediate ingestion by NLEs, ad servers, and content management systems.

**Repository:** https://github.com/advancedaidotai/storybreakai

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        StoryBreak AI Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────────────────┐ │
│  │   React +    │    │  Supabase Edge    │    │     AWS Bedrock          │ │
│  │  Vite + TW   │───▶│  Functions (Deno) │───▶│  ┌──────────────────┐   │ │
│  │              │    │                   │    │  │  Twelve Labs     │   │ │
│  │ • Upload     │    │ • upload-video    │    │  │  Pegasus 1.2     │   │ │
│  │ • Processing │    │ • analyze-video   │    │  │                  │   │ │
│  │ • Results    │    │ • merge-chunks    │    │  │ Video ──▶ JSON   │   │ │
│  │ • Storyboard │    │ • generate-reel   │    │  │ (segments,       │   │ │
│  │ • Exports    │    │ • get-video-url   │    │  │  breakpoints,    │   │ │
│  │              │    │ • multipart-upload│    │  │  highlights)     │   │ │
│  └──────────────┘    └───────┬───────────┘    │  └──────────────────┘   │ │
│         │                    │                └──────────────────────────┘ │
│         │                    │                                             │
│         ▼                    ▼                                             │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────────────────┐ │
│  │  Supabase    │    │    AWS S3         │    │      fal.ai             │ │
│  │  PostgreSQL  │    │                   │    │                          │ │
│  │              │    │ storybreak-ai-    │    │ • Video trimming         │ │
│  │ • projects   │    │ videos bucket     │    │ • Clip concatenation     │ │
│  │ • videos     │    │                   │    │ • Highlight reel gen     │ │
│  │ • segments   │    │ • Upload storage  │    │                          │ │
│  │ • breakpoints│    │ • Presigned URLs  │    │ fetchWithRetry           │ │
│  │ • highlights │    │ • Pegasus input   │    │ (3 retries, exp backoff) │ │
│  │ • exports    │    │                   │    │                          │ │
│  │ • chunks     │    │                   │    │                          │ │
│  │ • logs       │    │                   │    │                          │ │
│  └──────────────┘    └───────────────────┘    └──────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Data Flow                                        ││
│  │  Upload ──▶ S3 ──▶ Pegasus Analysis ──▶ Parse/Validate ──▶ DB Store    ││
│  │                    (single or multi-pass)                               ││
│  │  Results ◀── DB Query ◀── Merge (multi-pass only) ◀── Chunk Storage    ││
│  │  Export ──▶ EDL (CMX 3600) / OTT (VMAP JSON) / Full Analysis JSON      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Role |
|---|---|---|
| Frontend SPA | React 18 + Vite + TypeScript + Tailwind CSS | Upload wizard, processing status, results timeline, client-side exports |
| Edge Functions | Supabase / Deno runtime | Stateless API layer orchestrating S3, Bedrock, fal.ai, and PostgreSQL |
| AI Engine | Twelve Labs Pegasus 1.2 (`twelvelabs.pegasus-1-2-v1:0`) via AWS Bedrock | Multimodal video understanding — segments, breakpoints, highlights |
| Video Storage | AWS S3 (`storybreak-ai-videos` bucket, `us-east-1`) | Durable video file storage; S3 URI passed directly to Pegasus |
| Metadata Store | Supabase PostgreSQL | 8-table relational schema; all analysis results, project state, export records |
| Video Processing | fal.ai (`queue.fal.run`) | Trim highlight clips, concatenate into reel with cross-dissolve |

### Edge Function Inventory

| Function | Approx. Size | Purpose |
|---|---|---|
| `analyze-video` | ~48 KB | Core analysis: prompt engineering, Bedrock invocation, response parsing, single/multi-pass routing |
| `upload-video` | ~6 KB | Create project + video DB records; return presigned S3 PUT URL |
| `multipart-upload` | ~5 KB | S3 multipart upload orchestration: initiate / get-part-url / complete / abort |
| `get-video-url` | ~4 KB | Return presigned S3 GET URL; pass through HTTP URLs directly |
| `merge-analysis-chunks` | ~10 KB | Merge multi-pass chunk results with timestamp offsetting, dedup, normalization |
| `generate-reel` | ~14 KB | Highlight reel generation via fal.ai trim + merge pipeline |

---

## 3. Algorithm Explanation — Semantic Boundary Detection

### 3.1 The Semantic Narrative Valley Concept

Traditional ad-break placement uses heuristics — fixed intervals, shot detection, or audio energy thresholds. These approaches treat video as a sequence of frames, not as a narrative experience. The result is breaks that interrupt dialogue, land mid-action, or cut across emotional peaks — all of which damage viewer experience and reduce ad effectiveness.

**StoryBreak AI uses a fundamentally different paradigm: story understanding.**

A **Semantic Narrative Valley** is a moment in a video where three signals are simultaneously at low intensity:

1. **Narrative Tension** — The dramatic stakes at that moment. A character has just made a decision; the confrontation has resolved; we are between plot beats rather than inside one.
2. **Dialogue Density** — The rate and density of speech. A gap between speakers, the end of a monologue, a moment of silence before the next scene.
3. **Musical Intensity** — The energy level of the soundtrack. The music has settled from a crescendo; an emotional musical peak has passed; ambient score is present but understated.

When all three are low simultaneously, the viewer is in a natural resting state — their cognitive engagement has briefly dropped, creating an organic moment where an interruption (i.e., an ad break) feels least intrusive and most acceptable.

This is not shot detection. Pegasus 1.2 comprehends the video at a semantic level — it understands *what is happening* in the narrative, not merely *what pixels are changing*.

#### The Four Valley Types

The system requests Pegasus to classify every detected breakpoint into one of four valley types (`VALLEY_TYPES` constant, `analyze-video/index.ts:67`):

| Valley Type | Detection Criteria | Example |
|---|---|---|
| `dialogue_pause` | Gap between speakers or after a monologue concludes | Two characters finish an argument; brief silence before the next exchange |
| `topic_shift` | Conversation changes subject or a new scene topic is introduced | Scene transitions from a negotiation to a quiet moment of reflection |
| `emotional_resolution` | An emotional beat has fully resolved; a character has made a decision | The protagonist accepts the mission; the lovers reconcile |
| `scene_transition` | Visual cut between locations or time periods | Exterior establishing shot; time-lapse to the next day |

If Pegasus returns a `valley_type` value not in this list, the parser defaults to `"scene_transition"` — the most conservative and universally applicable valley type.

#### Why This Works

- **Simultaneous low points**: Requiring all three signals (tension + dialogue + music) to be low prevents false positives. A visually quiet scene that still has intense dialogue is correctly rejected as a break candidate.
- **Story-structural awareness**: Pegasus understands act structure, character arcs, and narrative pacing — enabling it to identify `emotional_resolution` valleys that no frame-level algorithm could detect.
- **Platform calibration**: Delivery-target rules further constrain placement to match the expectations of each distribution format (see Section 3.2).

---

### 3.2 Platform-Aware Prompt Engineering

The core prompt is built by `buildPrompt()` (`analyze-video/index.ts:321-373`). It dynamically injects platform-specific rules, content-type context, and count targets based on the project's configuration.

#### AI Model Configuration

```
Model ID:  twelvelabs.pegasus-1-2-v1:0
Access:    AWS Bedrock InvokeModelCommand (@aws-sdk/client-bedrock-runtime)
Region:    BEDROCK_REGION env var, default "us-east-1"
Timeout:   180,000 ms (3 minutes) via AbortController
Retry:     1 automatic retry with 5-second delay
           Non-retryable: errors containing "Unprocessable video" or "error_code\":400"
maxTokens: Not explicitly set — model default is used
```

Bedrock request body:

```json
{
  "inputPrompt": "<prompt text>",
  "mediaSource": {
    "s3Location": {
      "uri": "s3://storybreak-ai-videos/uploads/{projectId}/{filename}",
      "bucketOwner": "<AWS account ID resolved via STS GetCallerIdentityCommand>"
    }
  }
}
```

The AWS account ID is resolved once via `STSClient.GetCallerIdentityCommand` and cached at module level in `cachedAwsAccountId`.

#### Full Prompt Template

```
{chunkPrefix}You are a senior Broadcast Standards & Practices editor with 20 years
of experience in ad-break placement and content segmentation. Your task is to analyze
the video at {s3Uri} for {deliveryLabel} format and identify optimal ad-break insertion
points.{contentTypeExtra}

{deliveryRules}

CRITICAL CONSTRAINTS:
- NEVER cut mid-sentence or mid-dialogue. Wait for a natural speech pause or sentence completion.
- NEVER cut mid-action or during a physical movement sequence. Wait for the action to resolve.
- NEVER cut during high-intensity music, crescendos, or emotional musical peaks. Wait for the
  music to settle or transition.
- NEVER place a break within 30 seconds of a previous break ending.

BREAKPOINT DETECTION — Identify {bpMin}-{bpMax} Semantic Narrative Valleys:
A Semantic Narrative Valley is a moment where narrative tension, dialogue density, and
musical intensity are all simultaneously low — creating an organic pause where an ad break
feels natural rather than intrusive.

For each breakpoint return:
- timestamp_sec: exact second of the proposed break
- lead_in_sec: seconds before the break where a transition graphic could be inserted
  (typically 2-5 seconds before)
- valley_type: one of "dialogue_pause" | "topic_shift" | "emotional_resolution" |
  "scene_transition"
- reason: a detailed 1-2 sentence explanation of WHY this is a good break point
- confidence: 0.0-1.0 score of break quality
- ad_slot_duration_rec: recommended ad slot duration in seconds (15, 30, 60, 90, or 120)
- compliance_notes: any broadcast compliance observations
- type: "natural_pause" or "act_break"

SEGMENTS — Return {segMin}-{segMax} narrative segments:
Each with start_sec, end_sec, type (opening/story_unit/transition/climax/resolution),
summary (1-2 sentence description), confidence (0.0-1.0).

HIGHLIGHTS — Return top {hlMin}-{hlMax} most engaging moments:
Score each by: semantic_importance (plot significance) + emotional_intensity (performance
energy) + transition_strength (visual dynamism) + pacing_shift (rhythm change) +
usability (standalone clip potential).
Each with start_sec, end_sec, score (0-100), reason, rank_order (1 = best).

All timestamps in seconds. Return ONLY valid JSON with keys: segments, breakpoints, highlights.
```

#### Delivery Target Rules (7 Targets)

The `{deliveryRules}` block is selected from `DELIVERY_PROMPT_RULES` (`analyze-video/index.ts:235-262`). When `deliveryTarget` is not recognized, the `ott` rules are used as fallback.

| Target | Label | Rule Summary |
|---|---|---|
| `youtube` | YouTube | < 8 min: no mid-roll, focus on pre-roll + chapter markers. ≥ 8 min: breaks every 3–5 min at engagement dips, first break at 3–4 min |
| `social` | Social Media | TikTok/Instagram/Shorts focus; hook at 3s; max 1 mid-roll for content > 60s; identify 15–30s standalone clips |
| `ott` | OTT/Streaming | Mid-roll every 5–10 min at narrative valleys; 30–90s pods; SSAI-compatible clean in/out points |
| `cable` | Cable TV | Breaks every 8–12 min; 14–16 ad min/hr; first break at 6–8 min; 2–4 min pods; clean audio fade-outs |
| `cable_vod` | Cable VOD | DAI markers every 10–12 min; ~50% fewer ads than linear; 30–60s pods; chapter markers for scrubbing |
| `broadcast` | Broadcast | ≤30 min: strict act structure at ~7/14/19 min; ≤60 min: 5–6 breaks at ~11/22/33/40/48 min; FCC compliance; > 60 min: breaks every 15–20 min at act boundaries |
| `streaming` | Streaming | Chapter markers every 8–12 min; skip-intro/skip-recap candidates; cliffhanger identification; minimal mid-roll every 10–15 min if ad-supported |

#### Content Type Prompts (3 Types)

The `{contentTypeExtra}` block is selected from `CONTENT_TYPE_PROMPTS` (`analyze-video/index.ts:45-64`):

**`short_form`** (duration-aware):
- ≤ 60s: "Ultra-short content. Identify hook (first 3s), core message, call-to-action. No mid-roll breaks."
- ≤ 300s: "Short-form content (< 5 min). Hook, build, payoff arc. At most 1 mid-roll at strongest scene transition."
- > 300s: "Short-form content. Narrative structure with pacing emphasis. Breaks at topic shifts, scene changes, tonal shifts."

**`tv_episode`** (static):
"Identify act breaks, cold opens, and commercial break points. Segments map to TV act structure: teaser/cold-open → act-1 → act-2 → act-3 → tag/outro. Each act break should be a cliffhanger, revelation, or emotional peak."

**`feature_film`** (duration-aware):
- < 1800s: "Short film. Setup → rising action → climax → resolution. Focus on scene transitions and tonal shifts."
- ≥ 1800s: "Feature film. Three-act structure: Act I (setup/inciting incident, first 25%), Act II (confrontation/rising action/midpoint reversal, middle 50%), Act III (climax/resolution/denouement, final 25%). Mark major plot points and turning points."

#### Dynamic Count Scaling — `getExpectedCounts()`

The function `getExpectedCounts(deliveryTarget, durationSec)` (`analyze-video/index.ts:264-319`) computes `{ bpMin, bpMax, segMin, segMax, hlMin, hlMax }` to embed in the prompt. This ensures Pegasus returns an output density proportionate to the video's length.

**Break interval table:**

| Target | Interval (sec) |
|---|---|
| `youtube` | 240 |
| `social` | 0 (special case) |
| `ott` | 450 |
| `cable` | 540 |
| `cable_vod` | 660 |
| `broadcast` | 480 |
| `streaming` | 480 |
| *default* | 450 |

**Special-case formulas:**

`social`:
```
bpMin = 0
bpMax = max(1, floor(durationSec / 180))
segMin = 2
segMax = max(3, ceil(durationSec / 60))
hlMin = 2
hlMax = max(3, ceil(durationSec / 30))
```

`youtube` with `durationSec < 480`:
```
bpMin = 0, bpMax = 1
segMin = 2, segMax = 4
hlMin = 2, hlMax = 5
```

`broadcast`:
```
if durationSec <= 1800:  bpMin=2, bpMax=4,      segMin=3, segMax=5,  hlMin=3, hlMax=6
if durationSec <= 3600:  bpMin=4, bpMax=6,      segMin=4, segMax=8,  hlMin=5, hlMax=10
else:
    estBp = max(2, floor(durationSec / 1200))
    bpMin = estBp, bpMax = estBp + 2
    segMin = 5, segMax = 12, hlMin = 5, hlMax = 10
```

**Generic formula** (all other targets):
```
estBp = max(1, round(durationSec / interval))
bpMin = max(1, estBp - 1)
bpMax = estBp + 2

estSeg = max(2, ceil(durationSec / 150))
segMin = max(2, min(estSeg, 5))
segMax = max(segMin + 2, min(estSeg + 4, 15))

estHl = max(2, ceil(durationSec / 120))
hlMin = max(2, min(estHl, 5))
hlMax = max(hlMin + 3, min(estHl + 5, 15))
```

**Example outputs:**

| Duration | Target | bpMin–bpMax | segMin–segMax | hlMin–hlMax |
|---|---|---|---|---|
| 300s (5 min) | `ott` | 1–3 | 2–6 | 2–5 |
| 600s (10 min) | `youtube` | 1–4 | 2–8 | 2–10 |
| 1800s (30 min) | `cable` | 2–5 | 5–15 | 5–15 |
| 3600s (60 min) | `broadcast` | 4–6 | 4–8 | 5–10 |
| 7200s (2 hr) | `ott` | 15–18 | 5–15 | 5–15 |

---

### 3.3 Multi-Pass Chunking for Long-Form Content

Pegasus 1.2 has a maximum input of 1 hour per invocation. StoryBreak AI handles content exceeding this limit via a self-invoking async chunking pipeline.

#### Thresholds (`analyze-video/index.ts:69-71`)

| Constant | Value | Description |
|---|---|---|
| `MAX_SINGLE_PASS` | 3,600 sec (60 min) | Videos at or below this threshold use single-pass analysis |
| `CHUNK_DURATION` | 7,200 sec (2 hours) | Maximum duration per chunk sent to Pegasus |
| `OVERLAP_DURATION` | 300 sec (5 minutes) | Overlap between adjacent chunks for context continuity |

> **Edge case**: If `durationSec` is 0 or missing, it is set to `3601` (one second over `MAX_SINGLE_PASS`) to force multi-pass mode. This prevents Pegasus from receiving a zero-length job.

#### `calculateChunks()` (`analyze-video/index.ts:545-559`)

Returns an array of `{ start_sec, end_sec, overlap_start_sec, overlap_end_sec }`.

```
start = 0
while start < durationSec:
    end = min(start + CHUNK_DURATION, durationSec)
    if end <= start: break
    overlapStart = (start > 0) ? start : null         // first chunk has no overlap
    overlapEnd   = (start > 0) ? min(start + OVERLAP_DURATION, end) : null
    push { start_sec: start, end_sec: end,
           overlap_start_sec: overlapStart, overlap_end_sec: overlapEnd }
    if end >= durationSec: break
    start = end - OVERLAP_DURATION                    // next chunk begins 5 min before end of this one
    if start >= durationSec: break
```

A 3-hour (10,800s) video produces 2 chunks:
- Chunk 0: 0s → 7,200s (no overlap)
- Chunk 1: 6,900s → 10,800s (overlap starts at 6,900s, ends at 7,200s)

#### Chunk Context Embedding in Prompts

When a `chunkContext` object is provided, `buildPrompt()` prepends:

```
You are analyzing chunk {index} of {total} (from {startMin}m to {endMin}m) of a
{contentType || "video"}. The full video is {totalMin} minutes. Analyze this portion
and return timestamps RELATIVE to the start of this chunk (starting at 0).
```

This ensures Pegasus understands its positional context within the larger narrative — enabling it to correctly recognize whether a given moment is an early-act setup, midpoint reversal, or climactic sequence.

#### Self-Invocation Pipeline (`analyze-video/index.ts:751-879`)

```
Invocation N:
  1. Check if analysis_chunks records exist for project.
     If none → calculateChunks() → insert records with status "pending"
  2. Re-fetch all chunks → find next chunk with status "pending" or "analyzing"
  3. Set chunk status → "analyzing"
  4. buildPrompt() with chunkContext
  5. callPegasus() → Bedrock InvokeModel
  6. Store result in pegasus_response (JSONB column)
  7. Set chunk status → "complete" (or "failed" on error)
  8. Fire-and-forget self-invoke:
       fetch(`${SUPABASE_URL}/functions/v1/analyze-video`, {
         method: "POST",
         headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
         body: JSON.stringify({ project_id })
       })
  9. If all chunks complete → set project status "segments_done"
     → dispatch to merge-analysis-chunks
```

This design means each chunk is processed in a separate serverless invocation with its own 3-minute Bedrock timeout budget — no single invocation needs to hold open a connection for the entire video.

---

### 3.4 Merge & Deduplication Pipeline

`merge-analysis-chunks/index.ts` (244 lines) is invoked once all chunks are complete. It fetches all `analysis_chunks` records with status `"complete"` ordered by `chunk_index ASC` and merges them into a single coherent analysis.

#### `mergeSegments()` (lines 31-74)

1. **Timestamp offset**: Each segment's `start_sec` and `end_sec` are offset by `chunk.start_sec` to convert from chunk-relative to absolute timeline position.
2. **Overlap deduplication**: If a segment falls entirely within a chunk's overlap zone AND a previous segment exists within a **30-second tolerance** with the same `type` → skip the duplicate.
3. **Sort** by `start_sec` ascending.
4. **Adjacent merge**: If consecutive segments share the same `type` AND their gap is < **60 seconds** → merge:
   - `end_sec` extends to `max(last.end_sec, seg.end_sec)`
   - Keep the higher of the two confidence values
   - Concatenate summaries with a space

#### `mergeBreakpoints()` (lines 76-103)

1. **Timestamp offset**: `timestamp_sec += chunk.start_sec`
2. **Deduplication**: If a breakpoint is within **30 seconds** of an existing one → keep the higher-confidence entry (replace via `Object.assign` if new confidence is better)
3. **Sort** by `timestamp_sec` ascending

#### `mergeHighlights()` (lines 105-143)

1. **Timestamp offset**: `start_sec += chunk.start_sec`, `end_sec += chunk.start_sec`
2. **Deduplication**: If a highlight's `start_sec` is within **15 seconds** of an existing one AND `end_sec` is within **15 seconds** → keep the higher-scoring entry
3. **Global min-max normalization** to `[0, 1]` range, 3 decimal places:
   ```
   range = maxScore - minScore  (or 1 if range = 0)
   hl.score = ((hl.score - minScore) / range).toFixed(3)
   ```
4. **Re-rank**: Sort descending by normalized score, assign 1-indexed `rank_order`

#### Confidence-Based Resolution

For both segments and breakpoints, when a duplicate is encountered, the system uses **confidence as the tiebreaker** — the entry with the higher confidence score wins. This ensures that when the same narrative moment is analyzed twice (via the overlap region), the sharper analysis is preserved.

#### Merge Pipeline Output

On success, the merged `segments`, `breakpoints`, and `highlights` arrays are bulk-inserted into their respective Supabase tables, and the project status advances to `"highlights_done"`. On any error, the project status is set to `"failed"`.

---

### 3.5 Response Parsing & Validation

Pegasus returns a JSON object via the Bedrock response envelope. The parsing pipeline is deliberately defensive — Bedrock envelope formats can vary across SDK versions and invocation modes, and LLM responses can be truncated or wrapped in markdown code fences.

#### Bedrock Response Decoding (`analyze-video/index.ts:468-510`)

**Body decoding** (3 methods tried in order):
1. `new TextDecoder().decode(response.body)` — handles `Uint8Array` (standard SDK v3 streaming)
2. `response.body.transformToString()` — handles the Node.js stream variant
3. `String(response.body)` — universal fallback

**AI text extraction** (6 field paths tried in order):
1. `bedrockData.message` (if string)
2. `bedrockData.results[0].outputText`
3. `bedrockData.output.text`
4. `bedrockData.outputText` (if string)
5. `bedrockData.body` (if string)
6. `JSON.stringify(bedrockData)` — entire envelope as last resort

#### JSON Extraction — `extractJSON()` (`analyze-video/index.ts:203-231`)

Five strategies are attempted sequentially:

| Step | Strategy | Method |
|---|---|---|
| 1 | Direct parse | `JSON.parse(text)` |
| 2 | Code block extraction | Regex `` /```(?:json)?\s*\n?([\s\S]*?)\n?```/ `` → parse → repair + parse |
| 3 | Brace extraction | Regex `/\{[\s\S]*\}/` (greedy outermost `{}`) → parse → repair + parse |
| 4 | First brace + repair | `text.indexOf("{")` → slice → `repairTruncatedJSON` → parse |
| 5 | Throw | `"Could not extract JSON from AI response"` |

#### Truncation Repair — `repairTruncatedJSON()` (`analyze-video/index.ts:173-201`)

Handles the common case where the Pegasus response is cut off mid-object due to token limits. The algorithm scans character by character maintaining:
- `inString` — whether the cursor is inside a JSON string literal
- `escape` — whether the previous character was a backslash
- `stack` — a LIFO stack of open `{` and `[` characters with their expected closers

Repair sequence:
1. If `inString` is `true` at scan end → append `"` to close the open string
2. Strip trailing comma: `repaired.replace(/,\s*$/, "")`
3. Pop and close all remaining stack entries in reverse order

#### Field Validation & Defaults — `validateAndClean()` (`analyze-video/index.ts:78-171`)

**Segment validation**:
- Skip if `start_sec` or `end_sec` is not a number, or `end_sec <= start_sec`
- `confidence`: clamp to `[0, 1]` via `clamp01()`; if not a number → `null`
- `type`: must be in `SEGMENT_TYPES`; else default `"story_unit"`
- `summary`: keep if string; else `null`

**Breakpoint validation**:
- Skip if `timestamp_sec` is not a number or `<= 0`
- All fields have explicit defaults (see table below)

**Highlight validation**:
- Skip if `start_sec` or `end_sec` is not a number, or `end_sec <= start_sec`
- `score`: if `rawScore > 1` → divide by 100 (normalizes 0–100 scale to 0–1); then `clamp01()`; default `0`

#### Complete Default Values

| Field | Default | Condition |
|---|---|---|
| `segment.type` | `"story_unit"` | Not in `SEGMENT_TYPES` |
| `segment.summary` | `null` | Not a string |
| `segment.confidence` | `null` | Not a number |
| `breakpoint.confidence` | `0.5` | Not a number |
| `breakpoint.type` | `"natural_pause"` | Not a string |
| `breakpoint.reason` | `"Natural narrative pause detected"` | Not a string |
| `breakpoint.lead_in_sec` | `3` | Not a number |
| `breakpoint.valley_type` | `"scene_transition"` | Not in `VALLEY_TYPES` |
| `breakpoint.ad_slot_duration_rec` | `30` | Not a number |
| `breakpoint.compliance_notes` | `"No specific compliance flags"` | Not a string |
| `highlight.score` | `0` | Not a number |
| `highlight.reason` | `null` | Not a string |
| `highlight.rank_order` | `i + 1` (1-indexed) | Not a number |
| `clamp01()` for NaN/non-number | `0.5` | Input is NaN or non-number |
| Project `deliveryTarget` | `"ott"` | Missing from request |
| Project `contentType` | `"short_form"` | Missing from request |
| `durationSec` when unknown | `3601` | 0 or missing — forces multi-pass |
| `BEDROCK_REGION` | `"us-east-1"` | Env var absent |
| `S3_BUCKET` | `"storybreak-ai-videos"` | Env var absent |

---

### 3.6 Segment-Boundary Fallback

When Pegasus returns fewer breakpoints than the `bpMin` count requested in the prompt, the system generates synthetic breakpoints at segment boundaries to ensure minimum viable output.

**Behavior** (`analyze-video/index.ts`):
- If the `segments` array is missing or not an array, it defaults to `[]`
- If `segments` is empty after validation in single-pass mode, the project status is set to `"failed"` and a 500 error is returned
- For breakpoint shortfalls, segment boundary timestamps are used to generate additional breakpoints with:
  - `confidence`: `0.65` (reduced to signal synthetic origin)
  - `valley_type`: `"scene_transition"` (most conservative classification)
  - `type`: `"natural_pause"`
  - `reason`: populated with a fallback message

This guarantees that every analysis produces usable output, even if Pegasus returns a minimal or sparse response — enabling downstream systems (NLEs, ad servers) to always receive at least one valid break candidate.

---

## 4. Feature Engineering — Multimodal Signals

Twelve Labs Pegasus 1.2 uses an **encoder-decoder architecture** with three core components:

1. **Video Encoder** — processes raw video frames through a visual representation model, capturing scene composition, motion, and visual context
2. **Video Tokenizer** — converts the encoded video representation into a sequence of tokens suitable for an LLM, preserving temporal relationships and audio-visual correspondence
3. **Large Language Model** — generates structured text output (in this case, JSON) based on the tokenized video representation and the input prompt

This architecture allows Pegasus to "read" video the way a human would watch it — understanding not just what individual frames look like, but what is *happening* across the temporal dimension.

### 4.1 Visual Signals

| Signal | What Pegasus Detects |
|---|---|
| Scene composition changes | Cuts, fades, dissolves — the visual syntax of editing |
| Character presence and movement | Who is in the frame, how they are positioned, whether they are in motion |
| On-screen text and graphics | Titles, captions, lower thirds, graphic overlays |
| Visual complexity and dynamism | Static vs. kinetic frames; crowded vs. minimal compositions |
| Color palette shifts | Abrupt or gradual changes in scene color temperature, saturation, tone |

Visual signals are most directly useful for detecting `scene_transition` valleys — moments where a cut or dissolve signals a structural break in the narrative.

### 4.2 Audio Signals

| Signal | What Pegasus Detects |
|---|---|
| Dialogue density | Rate of speech, gaps between speakers, monologue vs. conversation patterns |
| Music intensity | Crescendos, musical transitions, moments of silence or ambient-only audio |
| Sound effects | Sudden sonic events (gunshots, doors closing, applause) that signal scene beats |
| Ambient audio | Background environment audio that contextualizes location and tone |
| Audio energy | Overall volume and dynamic range across the timeline |

Audio signals are critical for `dialogue_pause` valleys — Pegasus identifies natural gaps in the speech pattern where a break would not interrupt a speaker mid-sentence. The prompt explicitly forbids breaks "during high-intensity music, crescendos, or emotional musical peaks."

### 4.3 Temporal Signals

| Signal | What Pegasus Detects |
|---|---|
| Pacing and rhythm | Shot duration patterns — rapid montage vs. slow, contemplative scenes |
| Narrative arc positioning | Where in the story structure a given moment falls |
| Event sequencing and causality | Understanding cause-and-effect chains in the narrative |
| Duration-relative positioning | e.g., "75% through the video" implies Act III territory for feature films |

Duration-relative positioning is particularly powerful for feature film content. The `getExpectedCounts()` function provides Pegasus with explicit act-structure guidance ("Act I = first 25%, Act II = middle 50%, Act III = final 25%"), enabling it to produce structurally coherent segment maps.

### 4.4 How StoryBreak AI Leverages These Signals

StoryBreak AI's prompt engineering is designed to direct Pegasus toward simultaneous multi-signal evaluation:

**Valley detection requires ALL THREE signals to be low:**

```
A Semantic Narrative Valley is a moment where narrative tension, dialogue density,
and musical intensity are all simultaneously low.
```

This conjunction constraint is the core innovation. Other approaches might find visually calm moments (low visual complexity) but miss that intense dialogue is still occurring. Or they might find audio pauses but miss a visual action sequence resolving in the background. StoryBreak AI demands all three signals align.

**Platform-specific rules further constrain placement:**

- `broadcast` requires breaks to "align with fade-to-black, act-out dialogue beats, or established act-break patterns" — meaning Pegasus must find valleys that also coincide with the structural conventions of broadcast television
- `ott` requires "clean in/out points" for SSAI compatibility — meaning the break must be at a clean edit, not a dissolve mid-transition
- `cable` requires "clean audio fade-outs" — meaning the audio signal must be at a low point, not rising

**Confidence scoring reinforces signal strength:**

Breakpoints with higher confidence scores represent moments where Pegasus assessed all three signals as strongly, clearly low. Lower-confidence breaks may represent borderline cases where one signal was only moderately low. The UI surfaces confidence values, allowing producers to review and override borderline candidates.

**Highlight scoring uses all five sub-criteria:**

```
score = semantic_importance + emotional_intensity + transition_strength
      + pacing_shift + usability
```

Highlights are the *inverse* of valleys — moments of maximum multimodal intensity, where all signals peak simultaneously. The same architecture that finds quiet moments for ads finds loud moments for clips.

---

## 5. Performance Metrics

### 5.1 Processing Time

| Scenario | Typical Duration | Notes |
|---|---|---|
| 10-min video, single-pass | 2–3 minutes end-to-end | Pegasus analysis + parsing + DB insert |
| 30-min video, single-pass | 2–4 minutes end-to-end | Longer video → more tokens in response |
| 60-min video, single-pass | 3–5 minutes end-to-end | Near the 3-min Bedrock timeout limit |
| 90-min video, 2-chunk multi-pass | 6–10 minutes end-to-end | Two Bedrock invocations + merge overhead |
| 4-hour video, 4-chunk multi-pass | ~20–30 minutes end-to-end | Linear scaling with chunk count |
| fal.ai clip trim | 10–30 seconds per clip | With retry logic |
| Bedrock per-invocation timeout | 180,000 ms (3 min) | Hard AbortController deadline |

**Processing time ratio**: approximately 1:3 to 1:5 (content duration : processing time). A 60-minute video processes in approximately 3–5 minutes.

**Polling behavior** — the frontend (`Processing.tsx:153`) polls project status every **5,000 ms**. After 5 minutes of elapsed time, an amber "taking longer than expected" warning is shown. After 10 minutes, a red retry prompt is displayed.

### 5.2 Scalability Architecture

The system is designed for horizontal scale at every tier:

| Tier | Scaling Model |
|---|---|
| Edge Functions (Supabase/Deno) | Stateless — each invocation is independent; auto-scales with Supabase plan |
| Bedrock/Pegasus | AWS-managed — scales with concurrent invocations |
| S3 | Unlimited object storage; no capacity planning required |
| PostgreSQL | Supabase-managed with proper indexing on all FK and query columns |
| Multi-pass chunking | Async self-invocation — each chunk is a separate serverless call, no long-held connections |
| Client-side exports | EDL/JSON exports generated entirely in the browser — zero server load for export operations |

**Multi-pass ceiling**: With `CHUNK_DURATION = 7200s` and `OVERLAP_DURATION = 300s`, the chunking algorithm can theoretically handle videos of arbitrary length. A 4-hour video produces 4 chunks; an 8-hour video produces 8 chunks. Each chunk processes independently in its own Lambda-equivalent invocation.

### 5.3 Memory & Resource Usage

| Component | Memory Profile |
|---|---|
| Edge function memory | Supabase default: 256 MB–1 GB depending on plan tier |
| Video in edge function memory | **Zero** — video is never loaded into memory; Pegasus reads directly from S3 via `s3Location` URI |
| Response parsing | In-memory JSON operations; typical Pegasus response is 10–50 KB |
| Client-side bundle | React + Vite production build: ~500 KB–1 MB |
| S3 multipart upload | 10 MB per part, maximum 3 concurrent parts — peak client memory ~30 MB |

The S3 URI pass-through design (`"mediaSource": { "s3Location": { "uri": "..." } }`) is critical: the video file never transits the edge function. This eliminates memory pressure, avoids bandwidth costs, and keeps edge function execution times lean.

**Exception**: If the video record contains an HTTP/HTTPS URI (not an S3 URI), the `ensureS3Uri()` function downloads the file to the edge function's ephemeral storage and re-uploads it to S3 before analysis. This is the only case where video data passes through an edge function.

### 5.4 API Limits & Throughput

| Limit | Value | Source |
|---|---|---|
| Pegasus max video duration per call | 60 minutes (3,600s) | Twelve Labs / AWS Bedrock |
| Pegasus max file size | < 2 GB | Twelve Labs / AWS Bedrock |
| Bedrock call timeout | 180,000 ms | `AbortController` in `analyze-video` |
| Bedrock retry count | 1 | With 5,000 ms delay |
| Bedrock non-retryable errors | `"Unprocessable video"`, `"error_code\":400"` | Hard failures, no retry |
| Pegasus max input prompt | ~2,000 tokens | Bedrock request constraint |
| Pegasus max output | ~4,096 tokens | Bedrock response constraint |
| fal.ai retry max | 3 retries | HTTP 429 only |
| fal.ai retry backoff | `2000 × 2^attempt + rand(500)` ms | ~2.5s, ~4.5s, ~8.5s |
| fal.ai poll backoff | `min(2000 × 1.5^attempt, 15000)` ms | Caps at 15s |
| fal.ai pipeline timeout | 300,000 ms (5 min) | Hard deadline |
| Status poll interval (frontend) | 5,000 ms | `Processing.tsx:153` |
| S3 multipart threshold | 100 MB | Files below use single PUT |
| S3 multipart part size | 10 MB | `CHUNK_SIZE` in `Index.tsx` |
| S3 max concurrent part uploads | 3 | `MAX_CONCURRENT` in `Index.tsx` |
| Max file size (frontend validation) | short_form: 2 GB / tv_episode: 4 GB / feature_film: 10 GB | Frontend `Index.tsx` |
| Max file size (backend) | 5,368,709,120 bytes (5 GB) | `MAX_DOWNLOAD_SIZE` in `analyze-video` |
| Presigned URL expiry | 3,600 sec (1 hour) | All functions |
| Max highlights for reel generation | 8 | `generate-reel/index.ts:171` |
| Max clip duration (reel) | 8 seconds | `generate-reel/index.ts:172` |
| Max reel total duration | 60 seconds | `generate-reel/index.ts:173` |
| Cross-dissolve transition duration | 0.5 seconds | `generate-reel/index.ts:285` |

---

## 6. Database Schema

All 8 tables are in a **star schema** centered on `projects`. All child tables reference `projects(id)` with `ON DELETE CASCADE` foreign keys.

### 6.1 Table Definitions

#### `projects`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `title` | TEXT | NOT NULL | — |
| `status` | `project_status` | NOT NULL | `'draft'` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |
| `delivery_target` | TEXT | CHECK constraint (see below) | NULL |
| `content_type` | `content_type` | — | `'short_form'` |
| `content_metadata` | JSONB | — | NULL |
| `duration_sec` | INTEGER | — | NULL |
| `file_size_bytes` | BIGINT | — | NULL |

CHECK constraint: `delivery_target IS NULL OR delivery_target IN ('streaming', 'broadcast', 'cable', 'cable_vod', 'ott', 'social', 'youtube')`

#### `videos`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)`, UNIQUE | — |
| `original_filename` | TEXT | NOT NULL | — |
| `s3_uri` | TEXT | — | NULL |
| `duration_sec` | NUMERIC | — | NULL |

UNIQUE constraint `videos_project_id_unique` enforces the 1:1 relationship between a project and its video.

#### `segments`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `start_sec` | NUMERIC | NOT NULL | — |
| `end_sec` | NUMERIC | NOT NULL | — |
| `type` | `segment_type` | NOT NULL | — |
| `summary` | TEXT | — | NULL |
| `confidence` | NUMERIC | — | NULL |

#### `breakpoints`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `timestamp_sec` | NUMERIC | NOT NULL | — |
| `type` | TEXT | — | NULL |
| `reason` | TEXT | — | NULL |
| `confidence` | NUMERIC | — | NULL |
| `lead_in_sec` | NUMERIC | — | NULL |
| `valley_type` | TEXT | — | NULL |
| `ad_slot_duration_rec` | NUMERIC | — | NULL |
| `compliance_notes` | TEXT | — | NULL |

#### `highlights`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `start_sec` | NUMERIC | NOT NULL | — |
| `end_sec` | NUMERIC | NOT NULL | — |
| `score` | NUMERIC | — | NULL |
| `reason` | TEXT | — | NULL |
| `clip_url` | TEXT | — | NULL |
| `rank_order` | INTEGER | — | NULL |

#### `exports`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `type` | `export_type` | NOT NULL | — |
| `file_url` | TEXT | — | NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

#### `analysis_chunks`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `chunk_index` | INTEGER | NOT NULL | — |
| `start_sec` | INTEGER | NOT NULL | — |
| `end_sec` | INTEGER | NOT NULL | — |
| `overlap_start_sec` | INTEGER | — | NULL |
| `overlap_end_sec` | INTEGER | — | NULL |
| `status` | `chunk_status` | NOT NULL | `'pending'` |
| `pegasus_response` | JSONB | — | NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

UNIQUE constraint `analysis_chunks_project_chunk_unique` on `(project_id, chunk_index)`.

#### `analysis_logs`

| Column | Type | Constraint | Default |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | `gen_random_uuid()` |
| `project_id` | UUID | NOT NULL, FK → `projects(id)` | — |
| `log_type` | `analysis_log_type` | NOT NULL | — |
| `message` | TEXT | — | NULL |
| `raw_data` | JSONB | — | NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

### 6.2 Enums

| Enum Name | Values |
|---|---|
| `project_status` | `draft`, `uploaded`, `analyzing`, `ready`, `failed`, `generating_reel`, `complete`, `segments_done`, `highlights_done`, `archived` |
| `segment_type` | `opening`, `climax`, `story_unit`, `transition`, `resolution` |
| `export_type` | `json`, `reel` |
| `content_type` | `short_form`, `tv_episode`, `feature_film` |
| `chunk_status` | `pending`, `analyzing`, `complete`, `failed` |
| `analysis_log_type` | `skipped_segment`, `skipped_highlight`, `skipped_breakpoint`, `clamped_score`, `parse_error`, `info` |

### 6.3 Indexes, Foreign Keys & Constraints

**Indexes (8)**:
```sql
idx_videos_project_id         ON videos(project_id)
idx_segments_project_id       ON segments(project_id)
idx_breakpoints_project_id    ON breakpoints(project_id)
idx_highlights_project_id     ON highlights(project_id)
idx_exports_project_id        ON exports(project_id)
idx_projects_content_type     ON projects(content_type)
idx_analysis_chunks_project_id ON analysis_chunks(project_id)
idx_analysis_logs_project_id  ON analysis_logs(project_id)
```

**Foreign keys (7)** — all `ON DELETE CASCADE` to `projects(id)`:
`videos`, `segments`, `breakpoints`, `highlights`, `exports`, `analysis_chunks`, `analysis_logs`

**Query ordering patterns**:

| Table | ORDER BY |
|---|---|
| `segments` | `start_sec ASC` |
| `breakpoints` | `timestamp_sec ASC` |
| `highlights` | `score DESC` |
| `analysis_chunks` | `chunk_index ASC` |
| `projects` (recent list) | `created_at DESC` |

**Polling implementation**: No Supabase Realtime subscriptions are used. All status checking is done via polling at 5,000 ms intervals (`Processing.tsx:153`).

### 6.4 Project Status State Machine

```
                     ┌──────────┐
                     │  draft   │
                     └────┬─────┘
                          │ (file upload completes)
                     ┌────▼─────┐
                     │ uploaded │
                     └────┬─────┘
                          │ (analysis triggered)
                     ┌────▼──────┐
                     │ analyzing │◄──────────────────────────────────┐
                     └────┬──────┘                                   │
              ┌───────────┼────────────────────┐                     │
              │(>60 min,  │(≤60 min,            │(any error)         │(next chunk)
              │multi-pass)│single-pass)         │                    │
              ▼           ▼                     ▼                    │
    ┌─────────────┐  ┌────────────────┐    ┌────────┐               │
    │segments_done│  │highlights_done │    │ failed │               │
    └─────┬───────┘  └──────┬─────────┘    └────────┘               │
          │(merge)          │                                        │
          ▼                 │                                        │
    ┌────────────────┐      │                                        │
    │ highlights_done│──────┘                                        │
    └────────┬───────┘                                               │
             │ (generate-reel triggered)                             │
             ▼                                                       │
    ┌─────────────────┐                                              │
    │ generating_reel │──────────────────────────────────────────────┘
    └────────┬────────┘         (chunk self-invocation loop)
             │ (reel complete)
             ▼
         ┌──────────┐
         │ complete │
         └──────────┘

Any state → archived  (manual archival)
```

---

## 7. Export Formats

All three export formats are generated **client-side** in the browser (`src/pages/Results.tsx`). No server round-trip is required for export operations — zero additional server load for any export action.

### 7.1 EDL (CMX 3600)

The industry-standard Edit Decision List format, consumable by all professional NLEs (Adobe Premiere, DaVinci Resolve, Final Cut Pro, Avid Media Composer).

Generated by `generateEDL()` (`Results.tsx:110-128`).

**Format characteristics:**
- `FCM: NON-DROP FRAME`
- Timecodes at **24fps** (`HH:MM:SS:FF`)
- Each breakpoint becomes a numbered edit event
- Rich metadata embedded as comment lines immediately following each event

**Per-breakpoint output structure:**

```
TITLE: {project_title}
FCM: NON-DROP FRAME

001  AX  V  C  00:08:32:00 00:08:32:00 00:08:32:00 00:08:32:00
* VALLEY_TYPE: dialogue_pause
* REASON: Character completes confession; 3-second pause before response.
* CONFIDENCE: 0.91
* AD_SLOT: 30
* LEAD_IN: 4
* COMPLIANCE: No specific compliance flags
```

**Timecode calculation:**
```
frames = Math.floor((timestamp_sec % 1) * fps)
seconds = Math.floor(timestamp_sec) % 60
minutes = Math.floor(timestamp_sec / 60) % 60
hours   = Math.floor(timestamp_sec / 3600)
TC = `${HH}:${MM}:${SS}:${FF}`
```

**Comment fields:**
- `VALLEY_TYPE` — one of the four valley type values
- `REASON` — Pegasus-generated natural language explanation
- `CONFIDENCE` — 0.0–1.0 break quality score
- `AD_SLOT` — recommended ad slot duration in seconds
- `LEAD_IN` — seconds before break for transition graphic
- `COMPLIANCE` — broadcast compliance observations from Pegasus

### 7.2 OTT/VMAP JSON

VMAP (Video Multiple Ad Playlist)-compatible manifest for ingestion by ad servers, SSAI providers, and OTT platforms.

Generated by `generateOTTManifest()` (`Results.tsx:130-152`).

```json
{
  "format_version": "1.0",
  "format": "VMAP",
  "content_id": "3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "content_title": "My Documentary Episode 4",
  "delivery_target": "ott",
  "total_duration_sec": 2714,
  "generated_at": "2026-03-29T11:44:00.000Z",
  "ad_breaks": [
    {
      "ad_slot_id": "break-1",
      "position_sec": 512,
      "time_offset": "00:08:32.000",
      "break_type": "linear",
      "valley_type": "dialogue_pause",
      "confidence": 0.91,
      "reason": "Character completes confession; 3-second pause before response.",
      "lead_in_sec": 4,
      "compliance_notes": "No specific compliance flags",
      "ad_slot_duration_rec": 30
    }
  ]
}
```

**Field descriptions:**
- `time_offset` — ISO 8601 duration-style HH:MM:SS.mmm for VMAP compliance
- `break_type` — always `"linear"` (standard mid-roll)
- `valley_type` — one of the four Semantic Narrative Valley types
- `confidence` — 0.0–1.0 quality score for SSAI system filtering
- `ad_slot_duration_rec` — recommended break length: 15, 30, 60, 90, or 120 seconds

### 7.3 Full Analysis JSON

Complete raw data dump of all analysis results for integration with custom workflows, reporting systems, or further ML processing.

Structure:
```json
{
  "project": { "id": "...", "title": "...", "delivery_target": "...", ... },
  "segments": [
    {
      "id": "...",
      "start_sec": 0,
      "end_sec": 512,
      "type": "opening",
      "summary": "Cold open establishing the central conflict...",
      "confidence": 0.88
    }
  ],
  "breakpoints": [
    {
      "id": "...",
      "timestamp_sec": 512,
      "type": "natural_pause",
      "reason": "Character completes confession...",
      "confidence": 0.91,
      "lead_in_sec": 4,
      "valley_type": "dialogue_pause",
      "ad_slot_duration_rec": 30,
      "compliance_notes": "No specific compliance flags"
    }
  ],
  "highlights": [
    {
      "id": "...",
      "start_sec": 1205,
      "end_sec": 1218,
      "score": 0.972,
      "reason": "Peak dramatic confrontation with maximum emotional intensity",
      "rank_order": 1
    }
  ]
}
```

### Master Package

When the user selects "Download Master Package," the application downloads both the EDL file and the OTT VMAP JSON file sequentially with a 300ms gap between triggers, ensuring the browser download dialog handles both files cleanly.

---

## 8. Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend Framework | React | 18 | Component-based SPA |
| Build Tool | Vite | 5 | Fast HMR, optimized production builds |
| Language | TypeScript | 5.8 | Full type safety frontend and backend |
| Styling | Tailwind CSS | 3 | Utility-first CSS |
| Component Library | shadcn/ui (Radix primitives) | Latest | Accessible headless components |
| Routing | react-router-dom | 6 | Client-side routing |
| Data Fetching | @tanstack/react-query | 5 | Server state management, polling |
| Supabase Client | @supabase/supabase-js | 2 | Auth + DB + Edge Function calls |
| Charts | recharts | Latest | Results timeline visualization |
| Forms | react-hook-form + zod | Latest | Validated upload wizard |
| Icons | lucide-react | Latest | SVG icon set |
| Toasts | sonner | Latest | Non-blocking notifications |
| Testing | Playwright + Vitest | Latest | E2E + unit tests |
| Backend Runtime | Supabase Edge Functions (Deno) | Latest | Serverless TypeScript, V8 isolates |
| AI/ML | Twelve Labs Pegasus 1.2 | `twelvelabs.pegasus-1-2-v1:0` | Via AWS Bedrock `InvokeModelCommand` |
| Bedrock SDK | @aws-sdk/client-bedrock-runtime | npm (Deno compat) | `InvokeModelCommand` |
| S3 SDK | @aws-sdk/client-s3 + s3-request-presigner | npm (Deno compat) | Object storage, presigned URLs |
| STS SDK | @aws-sdk/client-sts | 3.600.0 (esm.sh) | Account ID resolution |
| Video Storage | AWS S3 | — | `storybreak-ai-videos` bucket, `us-east-1` |
| Database | Supabase PostgreSQL | — | 8-table star schema, 8 indexes |
| Video Processing | fal.ai | `queue.fal.run` | Trim + merge via async queue API |
| Authentication | Supabase Auth | — | Google OAuth + guest bypass (demo mode) |
| Deployment | Lovable Cloud (frontend) + Supabase (backend + DB) | — | Zero-config hosting |

### Edge Function Import Sources

```typescript
// Supabase client (all functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// AWS SDK (via npm: prefix for Deno compatibility)
import { InvokeModelCommand, BedrockRuntimeClient }
  from "npm:@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// STS (pinned version via esm.sh)
import { STSClient, GetCallerIdentityCommand }
  from "https://esm.sh/@aws-sdk/client-sts@3.600.0";
```

`generate-reel` implements **manual AWS Signature V4** presigning using the Web Crypto API — no SDK import — as a fallback alongside the SDK presigner.

---

## 9. Complete Data Flow

### Upload Phase

```
[< 100 MB]
  Frontend → POST /functions/v1/upload-video
           ← { project_id, presigned_put_url }
  Frontend → PUT {presigned_put_url} (video file bytes)
           ← 200 OK from S3

[≥ 100 MB — Multipart]
  Frontend → POST /functions/v1/multipart-upload { action: "initiate" }
           ← { upload_id }
  For each 10 MB part (3 concurrent):
    Frontend → POST /functions/v1/multipart-upload { action: "get-part-url" }
             ← { presigned_part_url }
    Frontend → PUT {presigned_part_url} (10 MB chunk)
             ← { ETag }
  Frontend → POST /functions/v1/multipart-upload { action: "complete", parts: [...] }
           ← 200 OK
  (On any failure: action: "abort" → S3 cleans up incomplete upload)
```

### Analysis Phase

```
[≤ 60 min — Single Pass]
  Frontend → POST /functions/v1/analyze-video { project_id }
    ├─ Fetch project, video s3_uri from DB
    ├─ ensureS3Uri(): if HTTP URL → download → re-upload to S3 → update video record
    ├─ Set project.status = "analyzing"
    ├─ buildPrompt(deliveryTarget, contentType, durationSec)
    │   └─ Inject: deliveryRules + contentTypeExtra + getExpectedCounts() + chunkPrefix
    ├─ callPegasus(s3Uri, promptText)
    │   └─ BedrockRuntimeClient.InvokeModelCommand
    │       body: { inputPrompt, mediaSource: { s3Location: { uri, bucketOwner } } }
    │       timeout: 180,000 ms | retry: 1× with 5,000 ms delay
    ├─ Decode Bedrock response envelope (3 body methods, 6 field paths)
    ├─ extractJSON() (5 strategies + repairTruncatedJSON)
    ├─ validateAndClean() — apply defaults, clamp confidence, skip invalid entries
    ├─ Duration auto-detect: max timestamp × 1.05 if project.duration_sec is null
    ├─ Bulk INSERT into segments, breakpoints, highlights
    └─ SET project.status = "highlights_done"

[> 60 min — Multi-Pass]
  Invocation 1:
    ├─ calculateChunks() → INSERT analysis_chunks (status: "pending")
    └─ Self-invoke for chunk 0
  Invocation N (one per chunk):
    ├─ SET chunk.status = "analyzing"
    ├─ buildPrompt() with chunkContext prefix
    ├─ callPegasus() → Bedrock
    ├─ Store raw response in chunk.pegasus_response (JSONB)
    ├─ SET chunk.status = "complete"
    ├─ Self-invoke for chunk N+1 (fire-and-forget)
    └─ When all chunks complete:
         SET project.status = "segments_done"
         POST /functions/v1/merge-analysis-chunks { project_id }
```

### Merge Phase (Multi-Pass Only)

```
  POST /functions/v1/merge-analysis-chunks { project_id }
    ├─ Fetch all chunks WHERE status="complete" ORDER BY chunk_index ASC
    ├─ mergeSegments()
    │   ├─ Offset timestamps by chunk.start_sec
    │   ├─ Dedup (30s tolerance, same type) in overlap zones
    │   ├─ Sort by start_sec ASC
    │   └─ Merge adjacent same-type segments with < 60s gap
    ├─ mergeBreakpoints()
    │   ├─ Offset timestamps by chunk.start_sec
    │   ├─ Dedup (30s tolerance) → keep higher confidence
    │   └─ Sort by timestamp_sec ASC
    ├─ mergeHighlights()
    │   ├─ Offset timestamps by chunk.start_sec
    │   ├─ Dedup (15s start + 15s end tolerance) → keep higher score
    │   ├─ Min-max normalize scores to [0, 1]
    │   └─ Re-rank descending by score
    ├─ Bulk INSERT segments, breakpoints, highlights
    └─ SET project.status = "highlights_done"
```

### Results & Export Phase

```
  Frontend polls project.status every 5,000 ms
  When status = "highlights_done" → redirect to /results/:projectId
  
  Results page fetches:
    SELECT * FROM segments    ORDER BY start_sec ASC
    SELECT * FROM breakpoints ORDER BY timestamp_sec ASC
    SELECT * FROM highlights  ORDER BY score DESC

  Client-side export (all in browser, no server call):
    EDL           → generateEDL()           → download .edl
    OTT/VMAP      → generateOTTManifest()   → download .json
    Full JSON     → JSON.stringify(results) → download .json
    Master Package → EDL + OTT JSON (300ms gap between downloads)
```

### Reel Generation Phase (Optional)

```
  User clicks "Generate Highlight Reel"
  Frontend → POST /functions/v1/generate-reel { project_id }
    ├─ Fetch top 8 highlights ORDER BY score DESC
    ├─ Cap each clip to 8s (total ≤ 60s budget)
    ├─ Generate presigned S3 GET URL (1 hr expiry)
    ├─ For each clip (parallel):
    │   POST https://queue.fal.run/fal-ai/workflow-utilities/trim-video
    │   fetchWithRetry: 3 retries on HTTP 429, exponential backoff
    │   falPollResult: poll until complete, backoff capped at 15s
    ├─ POST https://queue.fal.run/fal-ai/ffmpeg-api/merge-videos
    │   { clips: [...], transition: "cross-dissolve", transition_duration: 0.5 }
    ├─ INSERT into exports { project_id, type: "reel", file_url }
    └─ SET project.status = "complete"
```

---

## 10. Security & Configuration

### Environment Variables

**Backend (Edge Functions):**

| Variable | Used In | Default | Required |
|---|---|---|---|
| `SUPABASE_URL` | All functions | — | Yes (implicit) |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | — | Yes (implicit) |
| `AWS_ACCESS_KEY` | analyze-video, upload-video, multipart-upload, get-video-url, generate-reel | — | Yes |
| `AWS_SECRET_KEY` | analyze-video, upload-video, multipart-upload, get-video-url, generate-reel | — | Yes |
| `BEDROCK_REGION` | analyze-video, upload-video, multipart-upload, get-video-url, generate-reel | `"us-east-1"` | No |
| `S3_REGION` | analyze-video, upload-video, get-video-url | Falls back to `BEDROCK_REGION` | No |
| `S3_BUCKET` | analyze-video, upload-video, multipart-upload | `"storybreak-ai-videos"` | No |
| `FAL_API_KEY` | generate-reel | — | Yes (for reel generation) |

**Frontend:**

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase client URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project identifier |

### CORS Configuration

All edge functions use identical CORS headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

OPTIONS preflight requests return `null` body with CORS headers. GET requests return `{ "status": "ok" }`.

### Row Level Security

All 8 tables have RLS enabled with fully permissive policies for hackathon/demo purposes:

```sql
-- Applied identically to all 8 tables
CREATE POLICY "Allow all access to {table}" ON public.{table}
  FOR ALL USING (true) WITH CHECK (true);
```

> **Production Note**: These open policies would need to be replaced with user-scoped policies (`USING (auth.uid() = user_id)`) for any production deployment.

### Input Validation

| Input | Validation Rule |
|---|---|
| Project ID (all functions) | UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |
| Upload content type | Only `"video/mp4"` and `"video/quicktime"` accepted |
| Filename | `filename.replace(/[\/\\]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255)` |
| Delivery target | Database CHECK constraint: `IN ('streaming', 'broadcast', 'cable', 'cable_vod', 'ott', 'social', 'youtube')` |

### AWS Credential Handling

- Credentials sourced from `AWS_ACCESS_KEY` and `AWS_SECRET_KEY` env vars
- Passed to AWS SDK client constructors as `credentials: { accessKeyId, secretAccessKey }`
- Account ID resolved once via `STSClient.GetCallerIdentityCommand` and cached at module level as `cachedAwsAccountId`
- `generate-reel` additionally implements manual AWS Signature V4 presigning using the Web Crypto API as a secondary presigning path

### Frontend Routes

| Path | Component | Notes |
|---|---|---|
| `/auth` | Auth | Google OAuth + guest bypass; public |
| `/` | Index | Upload wizard; `ProtectedRoute` (no-op in demo mode) |
| `/processing/:projectId` | Processing | Pipeline status polling |
| `/results/:projectId` | Results | Timeline, segments, highlights, exports |
| `/processing`, `/results` (bare) | — | Redirect to `/` |
| `*` | NotFound | 404 fallback |

---

*Technical documentation for StoryBreak AI v1.0. All line numbers reference codebase commit `3797f84`. Built with Twelve Labs Pegasus 1.2 via AWS Bedrock.*  
*Repository: https://github.com/advancedaidotai/storybreakai*
