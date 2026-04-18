This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Supabase Configuration

### Email confirmation

The app works with Supabase email confirmation either ON or OFF — toggle it in **Supabase → Authentication → Providers → Email → "Confirm email"** without any code changes.

- **OFF** — `signUp` returns a session immediately; registration redirects straight to `/`. Recommended for local and preview dev because Supabase's free tier caps confirmation emails at 2/hour.
- **ON** — `signUp` returns no session; registration redirects to `/verify-email`. The confirmation link hits `/auth/callback`, which exchanges the code for a session and redirects to `/`. On exchange failure, the user lands on `/login?error=auth_callback_failed`.

When confirmation is ON, make sure **Site URL** and **Redirect URLs** (under Authentication → URL Configuration) include every origin you care about — local dev, preview deploys, and production — so the confirmation links resolve back to your app.

### Env vars

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Generating database types

Database types live at `src/lib/supabase/database.types.ts` and are regenerated from the live Supabase schema whenever you run new migrations. The CLI is installed as a dev dependency.

```bash
SUPABASE_PROJECT_ID=<your-project-ref> npm run gen:types
```

Replace `<your-project-ref>` with your Supabase project reference (the subdomain piece of your project URL — e.g. `abcdefghijklmnop` in `https://abcdefghijklmnop.supabase.co`). You can also find it under **Project Settings → General**. First-time use requires `npx supabase login`.

### Running migrations

Migrations live under `supabase/migrations/`. Apply them either via the Supabase Dashboard SQL Editor (paste each file in order) or via the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

After migrations run, regenerate types with `npm run gen:types`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
