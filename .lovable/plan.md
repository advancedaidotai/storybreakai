

## Plan: Block Unsupported Codec Uploads with Friendly Error

### What Changes

Currently, when a video with an unsupported codec is selected, the UI shows an amber **warning** banner but still allows the user to proceed with upload. This leads to a guaranteed 500/422 failure from the AI model later. The fix will upgrade the codec check from a dismissible warning to a **blocking error** that disables the upload button.

### Implementation (single file: `src/pages/Index.tsx`)

**1. Add a new state flag: `codecBlocked`**
- `const [codecBlocked, setCodecBlocked] = useState(false);`
- Set to `true` when `videoWidth === 0 && videoHeight === 0` (confirmed unsupported codec) or when `video.onerror` fires
- Set to `false` on new file selection or file removal
- Reset alongside `codecWarning` in all existing clear points

**2. Update `checkCodecSupport` callback**
- In the `onloadedmetadata` handler: when dimensions are `0x0`, also call `setCodecBlocked(true)` and change the message to a firm error tone: *"This video uses an unsupported codec. StoryBreak AI requires H.264 (AVC) video in an MP4 container. Please re-encode your video and try again."*
- In the `onerror` handler: also call `setCodecBlocked(true)` with message: *"We couldn't read this video. The file may be corrupt or use an unsupported format. Please use an H.264/MP4 file."*
- For the softer MIME/extension mismatch case (lines 404-411), keep it as a non-blocking warning (no change)

**3. Gate the upload button on `codecBlocked`**
- Change `disabled={!formValid || isBusy}` to `disabled={!formValid || isBusy || codecBlocked}`
- Update the gradient condition similarly

**4. Change the warning banner to an error banner when blocked**
- When `codecBlocked` is true, render the banner with red/destructive styling (`bg-red-500/10 border-red-500/25 text-red-400`) instead of amber, with title "Unsupported Video Format" and an `XCircle` icon
- When `codecBlocked` is false but `codecWarning` exists, keep current amber warning style
- Remove the dismiss `X` button when `codecBlocked` — user must pick a different file instead

**5. Update the tooltip on disabled button**
- When `codecBlocked`, show: *"This video format is not supported — please select a different file"*

### Technical Detail
- No new dependencies or files
- No backend changes
- `codecBlocked` resets on `handleFileSelect` and the remove-file button click, so selecting a valid file immediately unblocks
- The non-blocking amber warning for edge-case MIME mismatches remains as-is for `.mov` and similar files that may still work

