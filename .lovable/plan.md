

## Fix: Recent Project Click Navigation

### Problem
Currently clicking a recent project card has inconsistent behavior:
- "uploaded"/"draft" projects navigate to `/` (home page) with no context — user loses track
- "failed" projects go to results page but don't clearly offer reanalysis
- All statuses should route users to see their data and offer appropriate actions

### Changes

**File: `src/components/RecentProjects.tsx` — Update `handleClick` in `ProjectCard`**

Change the routing logic:
1. **"analyzing" / "generating_reel" / "segments_done"** → `/processing/:id` (unchanged, correct)
2. **"uploaded"** → `/processing/:id` (sends user to processing page which auto-triggers analysis)
3. **"draft"** → Stay on `/` but no longer show misleading "pre-filling form" toast. Just show a toast saying the project needs setup.
4. **"complete" / "ready" / "highlights_done" / "failed"** → `/results/:id` (unchanged — results page already has retry button for failed analysis)

This is a minimal change: just move "uploaded" from the home-redirect group into the processing-redirect group, and simplify the draft toast.

### Technical Detail

In `handleClick` (~line 94-106), change:
```typescript
// Before
if (s === "uploaded" || s === "draft") {
  navigate("/");
}

// After  
if (s === "uploaded") {
  navigate(`/processing/${project.id}`);
} else if (s === "draft") {
  navigate("/");
}
```

The processing page already auto-triggers analysis for "uploaded" status projects (line 150-173 of Processing.tsx), so this correctly resumes the workflow. The results page already has export/download buttons and a retry mechanism for failed analyses.

