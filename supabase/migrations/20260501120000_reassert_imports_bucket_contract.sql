-- Reassert imports bucket contract used by supabase/functions/_shared/importStorage.ts;
-- parseWorkbook upload is best-effort, but the private imports bucket should still exist.
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public
where storage.buckets.name is distinct from excluded.name
   or storage.buckets.public is distinct from excluded.public;
