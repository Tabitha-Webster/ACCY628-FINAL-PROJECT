# ServiceSync MSP

**From service agreement to support, billing, and collection.**

A contract-to-cash web app for a mid-sized IT managed-services provider. Built for ACCY628 with Next.js, React, Tailwind CSS, daisyUI, Supabase, and Recharts.

## Setup

1. Copy environment values:

```bash
cp .env.local.example .env.local
```

2. In `.env.local`, set values from the shared Supabase project **ACCY628-FINAL-PROJECT**:

```
NEXT_PUBLIC_SUPABASE_URL=https://icymsjpkfddfrbbazxss.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_or_publishable_key_here
```

Find the Project URL and anon/publishable key in Supabase → Project Settings → API Keys.  
Never put a service-role key or database password in this file or in GitHub.

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port Next.js prints if 3000 is already in use, for example `http://localhost:3001`).  
After changing `.env.local`, stop the server (Ctrl+C) and run `npm run dev` again.

## Demo accounts

Password for all demo users: `1234`

| Role | Name | Email |
|------|------|-------|
| Admin | Tabitha Webster | admin@servicesync.demo |
| Manager | Emilie Pierson | manager@servicesync.demo |
| Executive | Evan Bean | executive@servicesync.demo |
| Technician | Jackson Pecunia | tech@servicesync.demo |
| Billing | Lindsay-Kate Williams | billing@servicesync.demo |
| HR | Lily Walker | hr@servicesync.demo |
| Customer (Chad Corporation) | Casey Ortiz | casey.ortiz@chadcorporation.demo |

Mark Ashe (Help Desk) shares the technician login, and Carson Kimble (AR) shares billing. See Admin → Employees for the full staff list.

Use the **Demo Login Selector** on the login page to fill credentials, then click Sign in.

## Suggested demo path

1. Sign in as Manager → review Executive Dashboard, contracts, exceptions.
2. Sign out → Technician → open an assigned ticket → record time → flag additional work.
3. Manager → Additional Work (via Operations / related pages) → approve.
4. Billing → Ready to Bill → generate invoice → Payments → record a partial payment.
5. Customer → confirm ticket, invoice, payment, and remaining balance.
6. Manager dashboard → confirm AR / profitability figures moved.

## Git branch

Work on feature branches such as `lindsay-kate`. Do not commit directly to `main`.
