-- Attachment storage for capacity-planner (F3 Stage 0), 2026-07-07.
-- Run once in the self-host Supabase Studio SQL editor.
-- Private bucket; every object path starts with the owner's auth.uid():
--   {userId}/{storyId}/{attId}/{filename}

insert into storage.buckets (id, name, public)
values ('capacity-planner-docs', 'capacity-planner-docs', false)
on conflict (id) do nothing;

create policy "cp-docs read own"   on storage.objects for select to authenticated
  using  (bucket_id = 'capacity-planner-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cp-docs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'capacity-planner-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cp-docs update own" on storage.objects for update to authenticated
  using  (bucket_id = 'capacity-planner-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cp-docs delete own" on storage.objects for delete to authenticated
  using  (bucket_id = 'capacity-planner-docs' and (storage.foldername(name))[1] = auth.uid()::text);
