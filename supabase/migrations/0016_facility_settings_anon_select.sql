-- facility_settings is read through a cookie-less anon client inside
-- unstable_cache (see src/lib/data/facility-settings.ts — unstable_cache
-- callbacks can't call cookies(), so the cached path uses the anon key).
-- The 0002 SELECT policy targets only `authenticated`, so the cached read
-- returned 0 rows and silently fell back to DEFAULTS — every getFacilitySettings
-- call served the built-in defaults regardless of what admin had saved.
-- Make the select visible to anon as well; the row holds non-sensitive
-- operational knobs (hours, prices, contact info) that are shown on the
-- public payment page anyway.

drop policy if exists "facility_settings_select_authenticated" on public.facility_settings;

create policy "facility_settings_select_public"
  on public.facility_settings for select
  to anon, authenticated
  using (true);
