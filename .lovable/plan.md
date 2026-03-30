

## Plan: Require Google Login & Redesign Auth Page

### What Changes

1. **Make `ProtectedRoute` enforce authentication** (src/App.tsx)
   - Use the existing `useAuth` hook to check session state
   - If loading, show a spinner
   - If no session, redirect to `/auth`
   - Remove guest access

2. **Remove "Continue as Guest" from Auth page** (src/pages/Auth.tsx)
   - Remove the guest button and the "or" divider
   - Redesign the login page to be more visually attractive:
     - Add a gradient background with subtle animated glow effects
     - Larger logo presentation with tagline
     - Feature highlights / value props below the sign-in button (e.g. "AI-powered video analysis", "Smart ad break detection", "Instant storyboards")
     - More visual polish: glassmorphism card, subtle border glow

3. **Add sign-out to TopNav** (src/components/layout/TopNav.tsx)
   - Show user avatar/email and a sign-out button in the top nav
   - Use `useAuth` hook + `supabase.auth.signOut()`

### Files to Modify
- `src/App.tsx` — enforce auth in `ProtectedRoute`
- `src/pages/Auth.tsx` — remove guest option, enhance visual design
- `src/components/layout/TopNav.tsx` — add user info + sign out

### No database changes needed
The existing auth system (Google OAuth via Lovable Cloud) is already configured. This is purely a frontend enforcement change.

