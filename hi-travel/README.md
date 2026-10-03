# HI Travel: Phase 1 (Gestion centrale opérationnelle)

Back office, public website, client space and online payment for HI Travel. This repo implements **Phase 1** of the *Cahier des charges HI Travel, version 9 (02/10/2026)*. Every third-party service is **mocked** behind an interface so the real one can be plugged in later.

| | |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Apps | `apps/site` (public site + client space + payment, port 3000) · `apps/backoffice` (staff back office, port 3001), both Next.js 16 App Router |
| Backend | Supabase: Postgres + RLS, Auth, Storage. Business rules live in SQL functions (`supabase/migrations`). |
| Packages | `@hi/db` (typed Supabase clients) · `@hi/core` (domain logic) · `@hi/integrations` (mocked hotel APIs, payment provider, messaging, FX) · `@hi/ui` (components and the hitravel.tn brand theme) |

## Quick start (local)

Requirements: Node 22, pnpm 10, Docker.

```bash
cd hi-travel
pnpm install
pnpm db:start          # local Supabase stack (Docker)
pnpm db:reset          # migrations + demo seed
pnpm env:local         # writes apps/*/.env.local from `supabase status`
pnpm dev               # site → http://localhost:3000 · back office → http://localhost:3001
```

Demo accounts (password `HiTravel2026!`):

| Role | Login | Sees |
|---|---|---|
| Direction et administration | direction@hitravel.test | everything, settings, rights matrix |
| Commercial et réservation | commercial@hitravel.test | CRM, quotes, dossiers, margins |
| Opérations | operations@hitravel.test | dossiers, services, suppliers, imports, tasks; no margins |
| Finance | finance@hitravel.test | invoicing, payments, treasury, accounting, reports |
| Gestion du site | site@hitravel.test | offers and site pages only; no passports, no margins |
| Client (site) | client@hitravel.test | dossier DOS-2026-00001: Istanbul, 2 390 DT, 500 DT deposit paid |
| Client 2 (site) | client2@hitravel.test | nothing of client 1 |

Local mail (password resets) is in Mailpit at http://127.0.0.1:54324.

## Tests

```bash
pnpm db:test                     # 108 pgTAP acceptance tests on the database
pnpm test                        # 30 unit tests (@hi/core, @hi/integrations)
pnpm typecheck && pnpm lint && pnpm build
pnpm db:reset && pnpm test:e2e   # 13 Playwright end-to-end tests on the production builds
```

Run the end-to-end tests after `pnpm build` and on a freshly reset database; they create data. In a sandbox with a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_PATH`.

### Acceptance scenarios covered (REC = *recette* in the spec)

| Area | Covered by | Scenarios |
|---|---|---|
| Quote to dossier, seats, change control | pgTAP `01` + e2e | REC01 (versioned quote, idempotent acceptance), REC03 (no overbooking: row lock + DB constraint), REC04 (flight change flags the linked transfer and creates a task, never moves or confirms it), confirmation blockers and derogation |
| Finance and accounting | pgTAP `02` | REC02 (2 390 / 500 / 3 × 630 → 0; idempotent resubmission; refund + credit note), REC08, REC09 (cheque deposited → rejected), REC10 (transfer = 2 linked movements, no revenue), REC11 (unknown account / unbalanced entry refused atomically), REC12 (60/40 split), REC13 (closed period, ledger = trial balance), REC15 (4/3/3 nights → 1 200 / 900 / 900), supplier duplicate check |
| Security, site, payment | pgTAP `03` + e2e | REC05/REC49 (no internal data in public views, expired departure not bookable), REC06/REC20 (passports, margins and costs hidden by role), REC48 (one CRM request per submission, duplicate contact flagged without blind merge), REC51 (client isolation, safe portal views), REC52 (forged/replayed webhook → no extra encashment; payment never confirms services) |
| Imports, closing | pgTAP `04` + unit | REC26–REC28 (re-import creates nothing, refund is a linked evolution, invalid/ambiguous rows skipped), CLO01/CLO02 (financial closing, motivated exception) |
| Hotel APIs | unit + e2e | REC24 (both APIs normalised side by side, never merged), REC25 (one API down, timeout → "à vérifier", no blind retry) |

## What Phase 1 contains

- **The nine business modules** (hotels in Tunisia and abroad, tailor-made trips, organised trips with Omra as a category, visa, ticketing, circuits, transport, events/MICE): a shared dossier with services per module, each with its own supplier, dates, cost, currency/FX and confirmation status.
- **CRM**:
  - leads pipeline with an assignment rule
  - duplicate detection before creation, merge with history
- **Quotes**:
  - versioned; a version is frozen once sent
  - prices for adults, children and infants, optional lines, internal costs kept separate
  - FR/EN print view
  - accepting a quote creates the dossier without re-entry
- **Dossier**:
  - commercial status separate from payment and service statuses
  - confirmation rules with motivated derogation
  - pre-departure checklist, external deadlines (a missing date shows "délai à compléter"; dates are never invented)
  - incidents, documents (private bucket, signed URLs, access log), full audit history
- **Daily work**:
  - action dashboard
  - "À traiter aujourd’hui" with explainable red/orange/planned priorities that need no AI
  - tasks, calendar, departures with options, expiry and rooming/passenger exports
- **Finance**:
  - invoices, pro formas, credit notes; validated invoices are frozen
  - idempotent payments with explicit allocation; cheque/traite lifecycle and deposit slips
  - cash and bank, cash closing
  - supplier invoices with withholding and cost allocation
  - margins: forecast / confirmed / actual, flagged "provisoire, coûts incomplets" when costs are missing
  - financial closing of a dossier
- **Accounting**:
  - draft journal (brouillard) generated from approved posting rules
  - atomic, server-side validated posting; reversal entries
  - journals, general ledger, trial balance, aged balances, periods, CSV exports with 3 decimals
- **Integrations**:
  - two independent hotel API connectors with a capability matrix, masked call log and hotel mapping table
  - safe booking with an idempotent request id
  - CSV report imports for ticketing and foreign hotels, with preview, diff, de-duplication and history
- **Public site** (FO01–FO08):
  - catalogue, offer pages, the nine activity pages and Omra
  - per-activity request forms (idempotent; separate consents)
  - Tunisian hotel search on both APIs with a price re-check
  - SEO (metadata, sitemap, redirects table)
  - secure client space (dossiers, documents, upload, change requests)
  - online payment through the mock provider
- **Roles and rights**:
  - a configurable module × action permission matrix
  - enforced in Postgres (RLS + `require_perm` in every business function), not only in the UI

## What is mocked, and how to plug in the real thing

| Service | Mock | To go live |
|---|---|---|
| Hotel API A, "Tunisiabeds" (`hotel_api_tunisiabeds`) | `packages/integrations/src/hotels/tunisiabeds.ts`: own response format, native idempotency | Implement `HotelProvider` from the supplier's documentation; return it from `getHotelProvider()`; keep keys in server env vars |
| Hotel API B, "MyGo" (`hotel_api_mygo`) | `…/hotels/mygo.ts`: different format, tourist tax extra, no idempotency | same |
| Payment provider (`mockpay`) | `…/payments/index.ts` + hosted page `apps/site/src/app/mock-psp/` + signed webhook `apps/site/src/app/api/payments/webhook` | Implement `PaymentProvider` for the chosen PSP (`createCheckoutSession`, `verifyWebhook`); remove `/mock-psp` |
| E-mail / WhatsApp | `MockMessenger`: messages are drafted to `outbox_messages`; automatic sending stays off (`app_settings.channels`) | Plug a provider into `MessagingProvider` once channels and authorisations are approved |
| FX rates | `getFxRate()` (`fx_mock`) | Plug the bank / central bank source |

The two supplier names were inferred from hotel image URLs on hitravel.tn; both connectors are placeholders until HI Travel shares the API documentation (API01). Failure modes can be demonstrated from **Connexions et imports → API hôtels** (scenario: down, slow, timeout on booking, price change).

## Deploying to Supabase (org `tigbhjmccxqeqvdlpmgd`)

The demo seed is **never** pushed to a remote project. From a machine where the CLI is logged in (`supabase login`) or `SUPABASE_ACCESS_TOKEN` is set:

```bash
cd hi-travel
npx supabase projects list                       # is there already a project for HI Travel?
# if not (this creates a billable project; pick the region, e.g. eu-central-1):
npx supabase projects create hi-travel --org-id tigbhjmccxqeqvdlpmgd --region eu-central-1 --db-password '<strong password>'
npx supabase link --project-ref <project-ref>
npx supabase db push                             # applies supabase/migrations
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> \
  node scripts/create-admin.mjs direction@hitravel.tn "Prénom Nom"   # first direction account
```

Then in the Supabase dashboard → Authentication → URL configuration, set the site URL and add `https://<site-domain>/**` and `https://<backoffice-domain>/**` to the redirect URLs (needed for password-reset links).

Each app needs these environment variables (see `apps/*/.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BACKOFFICE_URL`, `PAYMENT_WEBHOOK_SECRET`, and `NEXT_PUBLIC_AUTH_COOKIE_NAME` (different per app, so staff and client sessions never mix).

## To validate with HI Travel before go-live

These are open points in the spec. The code makes them configurable instead of hard-coding them:

- **Tax rules** (`tax_rules`): VAT, stamp duty and withholding rates are seeded as *indicative and not validated*; the accountant must confirm them (FIN08). The 1 DT stamp duty appears on invoices until then.
- **Chart of accounts and posting rules** (`accounts`, `posting_rules`): a starting set to be approved by the accountant.
- **Urgency thresholds, lead assignment, numbering series, hotel markup, online-payment account**: these are under **Paramètres**.
- **Legal texts and agency address** (`site_pages`, `app_settings.agency`): placeholders marked "à valider".
- **Payment provider, hotel API contracts, report formats**: the import templates are versioned and the samples are in `apps/backoffice/public/samples/`.

## Deliberately left for Phases 2 and 3

- **Phase 2 (automation and controls):**
  - AUT01–AUT03 automatic task generation, recalculation of internal deadlines, escalations
  - rule-based purchase/sales reconciliation
  - bank statement import and reconciliation (BAN01–BAN04)
  - the global control centre (CTL)

  Phase 1 keeps reconciliation and tasks manual, with the links and fields Phase 2 will need.
- **Phase 3 (assistant and AI):**
  - OCR / extraction (INT01)
  - AI interpretation and suggestions (INT02–INT07)
  - conversational assistant and ChatGPT/MCP connector (ASS01–ASS04)
- **Not built in Phase 1:**
  - Arabic (right-to-left) and English site versions: separately priced options; all site strings already live in `apps/site/src/lib/i18n/fr.ts`
  - El Fatoora / TEIF / TEJ fiscal interfaces (optional)
  - GDS connection, WhatsApp synchronisation
  - the MICE run-of-day sheet (EVT04)
  - linking an imported report line to the matching quoted service: imported lines are created as new services

## Repository layout

```
hi-travel/
├── apps/
│   ├── backoffice/   # Next.js back office: (app)/… routes, src/lib/auth.ts (requireStaff), src/proxy.ts
│   └── site/         # Next.js site: (site)/… routes, client space, mock-psp, payment webhook
├── packages/
│   ├── core/         # money, schedules, allocation, priority, CSV imports, French labels (+ tests)
│   ├── db/           # Supabase clients (server/browser/admin) + generated types
│   ├── integrations/ # hotel API mocks, MockPay, messaging, FX (+ tests)
│   └── ui/           # components + theme.css (hitravel.tn palette, Poppins/Roboto)
├── supabase/
│   ├── migrations/   # schema, RLS, business functions, reference data
│   ├── seed.sql      # local demo data only
│   └── tests/        # pgTAP acceptance tests
├── e2e/              # Playwright end-to-end tests
└── scripts/          # write-local-env, create-admin
```
