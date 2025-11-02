-- Private bucket for server-side import uploads
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- Enable authenticated users to manage only their own files under imports bucket
alter table storage.objects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'imports_select_own'
  ) then
    create policy imports_select_own
      on storage.objects
      for select to authenticated
      using (
        bucket_id = 'imports'
        and owner = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'imports_insert_own'
  ) then
    create policy imports_insert_own
      on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'imports'
        and owner = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'imports_delete_own'
  ) then
    create policy imports_delete_own
      on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'imports'
        and owner = auth.uid()
      );
  end if;
end $$;

-- Path convention: imports/{user_id}/{tournament_id}/{iso_date}/{sha256}_{filename}
