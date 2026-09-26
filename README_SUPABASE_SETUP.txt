# Excess Baggage Report — Supabase Online Version

This ZIP keeps the existing single-file Excess Baggage Report app and adds:

- Supabase Auth login
- User ID + password registration
- Online report storage
- My Reports loaded from the cloud
- Supervisor role
- Supervisor Dashboard showing all users' reports
- Search/filter and Supervisor Excel export
- Row Level Security (RLS)

## 1. Create a Supabase project

Create a Supabase project.

In Supabase:
- Authentication -> Settings: turn OFF email confirmation for this ID/password design.
- Open SQL Editor.
- Run the complete `supabase_setup.sql` file included in this ZIP.

## 2. Put the Supabase keys into index.html

Open `index.html` and find:

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";

Replace them with:
- your Supabase Project URL
- your Supabase Publishable Key

Use the Publishable key only. NEVER put a Supabase secret/service key in this GitHub Pages file.

## 3. Create your Supervisor account

First use the website's Create Account screen to register the Supervisor User ID.

Then in Supabase SQL Editor run:

update public.profiles
set role='supervisor'
where user_code='YOUR_SUPERVISOR_USER_ID';

Example:

update public.profiles
set role='supervisor'
where user_code='37888';

The Supervisor can then sign in with the same User ID and password.

## 4. Normal users

Normal users register their own User ID and password.

Each user's reports are tied to their Supabase Auth account. RLS prevents a normal user from reading another user's reports.

## Important

The app is static and runs on GitHub Pages. The Supabase Publishable key is expected to be visible in browser code. Security comes from Supabase Auth + Row Level Security. Do not publish a secret/service key.

## Existing report behavior

The existing EMD parser, Rate per KG calculation, USD calculation, report columns, and Excel export are retained.

Reports are stored as structured JSON in Supabase, and Excel is generated in the browser when requested. The app does not need to upload Excel files to Supabase for normal operation.


PROJECT CONNECTION
-------------------
The supplied build is preconfigured with the Supabase Project URL and Publishable Key provided by the owner.
The URL used by the app is the project root (without /rest/v1).

SUPERVISOR SETUP
----------------
1. Create/sign up a normal account in the app using the Supervisor's desired User ID and password.
2. In Supabase > SQL Editor run:
   update public.profiles set role='supervisor' where user_code='YOUR_SUPERVISOR_USER_ID';
3. Sign out and sign in again with that account.
4. The Supervisor Dashboard will then show all users' reports.

IMPORTANT
---------
Do not put a Supabase secret key in this HTML file. The publishable key is intended for browser apps and RLS controls database access.
