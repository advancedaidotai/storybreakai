

## Add Confirmation Step to Re-Analyze Modal

### What Changes
Add a two-step flow inside the existing Re-Analyze dialog: after clicking "Start Re-Analysis", show a warning confirmation before proceeding.

### Implementation
**File: `src/pages/Results.tsx`**

1. Add a `reAnalyzeConfirm` boolean state (default `false`).

2. Split the modal into two views using conditional rendering:
   - **Step 1 (default)**: Current form with delivery target + content type selects. "Start Re-Analysis" button now sets `reAnalyzeConfirm = true` instead of calling `handleReAnalyze`.
   - **Step 2 (confirm)**: Warning message with `AlertTriangle` icon stating: *"This will permanently delete all existing segments, breakpoints, highlights, and analysis data for this project. The video file will be preserved and re-analyzed with your new settings."* Two buttons: "Go Back" (returns to step 1) and "Confirm & Re-Analyze" (calls `handleReAnalyze`).

3. Reset `reAnalyzeConfirm` to `false` when the dialog closes (in `onOpenChange`).

### Technical Detail
- No new components or files needed — just a conditional render inside the existing `<DialogContent>`.
- Uses existing `AlertTriangle` from lucide-react for the warning icon.
- The "Confirm & Re-Analyze" button uses `variant="destructive"` styling to emphasize the destructive action.

