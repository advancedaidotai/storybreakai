
# StoryBreak AI — Full App Scaffold

## Overview
Build the complete 3-screen SPA skeleton with dark cinematic UI, navigation, and all major layout sections using mock/static data.

## Design System
- **Background**: `#0B0F14` (deep cinematic black-blue)
- **Surface panels**: `#111827` (dark slate)
- **Accent colors**: Electric Blue `#3B82F6` (AI/system), Purple `#8B5CF6` (highlights), Green `#10B981` (segments), Amber `#F59E0B` (breakpoints), Red `#EF4444` (peaks)
- **Typography**: Inter font, bold tight headings, clean body text
- **UI style**: Rounded corners (12–16px), subtle glassmorphism on overlays, soft shadows

## Navigation
- Top nav bar: **StoryBreak AI** logo/brand on left, **Upload · Processing · Results** links center, notification/settings/profile icons on right
- Left sidebar on Processing & Results screens: Current Project info, Assets, Metadata, Transitions, Export links
- Active tab highlighted in blue with underline

## Screen 1: Upload (Home)
- Hero section: Large heading "Transform Footage into Cinematic Stories" with "Cinematic Stories" in blue gradient
- Subtitle describing AI capabilities
- Central upload card with dashed border: drag-and-drop zone, cloud upload icon, "Drop your video files here" text, file format info (MP4, MOV, MXF · up to 4GB), "Select Master Clips" button (blue)
- Divider: "OR EXPLORE POSSIBILITIES"
- "Try Sample Video" button with play icon
- Three feature cards at bottom: Scene Detection, Mood Analysis, Auto-Assembly
- Footer with version info and links

## Screen 2: Processing
- Centered card: "Refining Your Vision" heading with subtitle
- Vertical stepper with connecting lines showing 4 stages:
  1. Analyzing Video (✓ complete)
  2. Detecting Story Segments (✓ complete)
  3. Identifying Highlights (in progress with progress bar, "PROCESSING · SCENE 14/32")
  4. Generating Reel (waiting/greyed out)
- AI Director's Insight card: amber accent, shows real-time AI observations
- Bottom bar: Time Remaining, Resolution info, Cancel Process button
- All states are mock/simulated with animated transitions between steps

## Screen 3: Results (Core Experience)
- **Top**: Two video panels side by side — Source Video (left) with duration, AI Highlight Reel (right) with "Proprietary Model" badge
- **Sequence Intelligence Timeline**: Full-width interactive timeline with:
  - Colored segment blocks (story segments in blue/green)
  - Breakpoint markers (amber vertical lines with star icons)
  - Highlight markers (purple sparkle icons)
  - Time scale along bottom
  - Legend: Story Segment · Breakpoint · Highlight
  - "Interactive Mode Active" badge
- **Bottom left**: Segment detail card showing selected segment name, Sequence ID, start/end times, confidence score (98.4%), and "Why This Was Selected" AI explanation
- **Bottom right**: Export Actions panel with Export JSON and Download Reel buttons, Quick Share icons (link, cloud, email), Processing Node status
- Left sidebar: "New Analysis" button at bottom

## Routing & State
- React Router with `/` (Upload), `/processing` (Processing), `/results` (Results)
- Shared layout component for nav bar
- All data is hardcoded/mock for this scaffold — no backend integration yet
- Upload action navigates to Processing; Processing completion navigates to Results
