-- Run this SQL in your Supabase project's SQL Editor.
-- Emails are only written/read by the server using the service role key.
create extension if not exists pgcrypto;

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('Token Creator', 'Trader', 'Community Member')),
  wallet_address text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Intentionally do not create public SELECT/INSERT policies.
-- The Next.js API routes access this table server-side using SUPABASE_SERVICE_ROLE_KEY.
