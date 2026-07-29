drop policy if exists "Masters read all extraction files" on storage.objects;
create policy "Masters read all extraction files"
on storage.objects for select to authenticated
using (bucket_id = 'extraction-uploads' and public.is_master());
