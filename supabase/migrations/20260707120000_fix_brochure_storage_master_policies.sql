-- Restore owner-or-master authorization for protected brochure object management.
-- Public published brochure reads are intentionally left unchanged.
-- Exports bucket policies are intentionally left unchanged.

drop policy if exists "organizers_insert_brochures_for_owned_tournaments" on storage.objects;
drop policy if exists "organizers_select_brochures_for_owned_tournaments" on storage.objects;
drop policy if exists "organizers_update_brochures_for_owned_tournaments" on storage.objects;
drop policy if exists "organizers_delete_brochures_for_owned_tournaments" on storage.objects;

create policy "organizers_insert_brochures_for_owned_tournaments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brochures'
  and exists (
    select 1
    from public.tournaments t
    where t.id::text = (storage.foldername(name))[1]
      and t.deleted_at is null
      and (
        t.owner_id = auth.uid()
        or public.is_master()
      )
  )
);

create policy "organizers_select_brochures_for_owned_tournaments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'brochures'
  and exists (
    select 1
    from public.tournaments t
    where t.id::text = (storage.foldername(name))[1]
      and t.deleted_at is null
      and (
        t.owner_id = auth.uid()
        or public.is_master()
      )
  )
);

create policy "organizers_update_brochures_for_owned_tournaments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brochures'
  and exists (
    select 1
    from public.tournaments t
    where t.id::text = (storage.foldername(name))[1]
      and t.deleted_at is null
      and (
        t.owner_id = auth.uid()
        or public.is_master()
      )
  )
)
with check (
  bucket_id = 'brochures'
  and exists (
    select 1
    from public.tournaments t
    where t.id::text = (storage.foldername(name))[1]
      and t.deleted_at is null
      and (
        t.owner_id = auth.uid()
        or public.is_master()
      )
  )
);

create policy "organizers_delete_brochures_for_owned_tournaments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brochures'
  and exists (
    select 1
    from public.tournaments t
    where t.id::text = (storage.foldername(name))[1]
      and t.deleted_at is null
      and (
        t.owner_id = auth.uid()
        or public.is_master()
      )
  )
);
