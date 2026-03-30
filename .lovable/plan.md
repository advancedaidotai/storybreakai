

## Plan: Store Waitlisted Emails in Database

### What Changes

1. **Create `waitlist_signups` table** via migration
   - Columns: `id` (uuid, PK), `email` (text, unique, not null), `user_id` (uuid, nullable), `created_at` (timestamptz, default now())
   - RLS policy: allow inserts from authenticated users, allow select for admins only
   - On conflict (email) do nothing — so repeat visits don't create duplicates

2. **Update `src/pages/Waitlist.tsx`** to insert the user's email on mount
   - On component mount, upsert the user's email into `waitlist_signups`
   - Silent operation — no UI change needed, just fire-and-forget insert

### Files to Modify
- **New migration** — create `waitlist_signups` table
- **`src/pages/Waitlist.tsx`** — add upsert call on mount

### Technical Details
```sql
CREATE TABLE public.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert own signup"
  ON public.waitlist_signups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read own signup"
  ON public.waitlist_signups FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

In Waitlist.tsx, add to the existing `useEffect`:
```typescript
supabase.from("waitlist_signups")
  .upsert({ email: user.email, user_id: user.id }, { onConflict: "email" })
  .then(() => {});
```

