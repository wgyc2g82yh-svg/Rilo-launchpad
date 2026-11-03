-- Run once in the project's Supabase SQL editor. Only the server service-role
-- uploads metadata; no public write policy is installed. Paths are content-addressed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('token-metadata', 'token-metadata', true, 3000000,
  array['image/png', 'image/jpeg', 'image/webp', 'application/json'])
on conflict (id) do nothing;
