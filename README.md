# RILO Launchpad — waitlist website starter

A responsive Next.js landing page for RILO, a Solana launch-acceleration concept. It includes a working waitlist form/API and a public signup count once Supabase is configured.

## What's included

- RILO-branded landing page with responsive dark/neon-green design
- Waitlist signup: email, audience type, optional public Solana wallet address
- Duplicate email handling and basic validation
- Server-side API routes for signup and count
- Supabase schema
- Demo launchpad sections; no real token launches or trading are implemented

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Create a Supabase project at https://supabase.com.
5. In the Supabase SQL Editor, run `supabase/schema.sql`.
6. In `.env.local`, set:
   - `SUPABASE_URL` to your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` to your project service-role key
7. Run `npm run dev` and open http://localhost:3000.

**Security:** Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code or commit `.env.local`. The API currently has basic validation but should receive rate limiting, bot protection/CAPTCHA, privacy-policy language, and abuse monitoring before public promotion.

## Deploy

Deploy the project to Vercel or another Node-compatible Next.js host. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-side environment variables in the hosting dashboard, then deploy.

## Before public launch

- Add a privacy policy and terms
- Add rate limiting and bot protection to the signup endpoint
- Decide how signups will be exported or managed by the team
- Replace demo content with verified launch details
- Keep token metrics clearly labeled as demo data until connected to reliable data sources
- Add wallet connection or on-chain launch features only when ready; this starter does not request signatures or move funds
