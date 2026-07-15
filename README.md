# SafeMind

SafeMind includes a Python NLP service that classifies messages as spam/scam or likely safe. It uses spaCy for multilingual tokenization and phrase matching, plus NLTK for Porter stemming and a trained Naive Bayes classifier. It does not require downloading an external spaCy model or NLTK corpus.

## Supabase setup

1. Create a Supabase project, then open **SQL Editor** and run [`supabase-full-setup.sql`](supabase-full-setup.sql). The script creates the application tables, RPC functions, row-level security policies, and the private `report-screenshots` Storage bucket. It is safe to rerun after updates.
2. In **Authentication > URL Configuration**, set the production Site URL and add the local and production callback URLs (for example, `http://localhost:5173/**` and `https://your-domain.example/**`) to Redirect URLs.
3. Create the administrator in **Authentication > Users**. Then run this in SQL Editor with the same lowercase email:

```sql
insert into public.admin_accounts (email)
values ('admin@example.com')
on conflict (email) do nothing;
```

4. Copy `.env.example` to `.env`. In **Project Settings > API**, copy the Project URL and the public publishable/anon key. Never use the service-role key in `.env` or any browser code.

```bash
cp .env.example .env
```

5. Restart Vite after changing `.env`.

The report page accepts one optional PNG, JPEG, or WebP screenshot up to 5 MB. Screenshots are stored privately at `report-screenshots/<reporter-user-id>/<random-file-name>`; the matching path and safe metadata are stored on `admin_reports`. Users can access only their own folder. Emails listed in `admin_accounts` can read all report rows and screenshot objects.

To review a submission, sign in as the administrator and inspect `admin_reports` in **Table Editor**, then use `screenshot_path` to locate the private object in **Storage > report-screenshots**. Set `status` to `reviewing`, `confirmed`, or `dismissed` when appropriate. The Supabase dashboard itself has project-level access; an admin page built with the public client should create a short-lived signed URL only after the included admin RLS check succeeds.

The separate `supabase-*.sql` files remain available for targeted upgrades. [`supabase-threat-directory.sql`](supabase-threat-directory.sql) also includes optional demonstration directory records.

### Agent observability

Operational telemetry remains internal to the API runtime. It is not included in browser responses, displayed by the client, or written by client JavaScript. The optional `agent_runs` schema is available only for a future trusted server-side exporter; never expose service credentials in the browser.

The current analyzer is a local CPU, non-streaming model. Its cost is therefore reported as `$0`, GPU throughput as unavailable, token values as estimates, and TTFT as the complete response latency. These fields can accept real provider or GPU telemetry later without changing the database shape.

## AI Security Agent architecture

SafeMind now coordinates modular Input, Threat Intelligence, ML Classification, Evidence, Reasoning, and Decision agents. Each scan produces a structured case file, investigation timeline, evidence cards, explainable score contributions, relationship data, recommendations, and explicit provider-availability states. The scanner remains a focused security workbench and does not use a chat interface.

Run [`supabase-security-cases.sql`](supabase-security-cases.sql) after the main setup to enable persistent case files, continuous-learning feedback, pgvector-ready case embeddings, and RAG knowledge documents. The full design, API contracts, model adapter requirements, RAG flow, vector search, deployment architecture, and security boundaries are documented in [`docs/AI_SECURITY_AGENT_ARCHITECTURE.md`](docs/AI_SECURITY_AGENT_ARCHITECTURE.md).

The default local service remains lightweight. To run the typed FastAPI adapter after installing updated Python requirements:

```bash
npm run nlp:fastapi
```

## Run locally

Create the Python environment once:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

If you use the absolute virtual-environment path, quote it because the project folder contains an apostrophe:

```bash
"/Volumes/KXANT'S 1/Web/safemind 2/.venv/bin/python" -m pip install -r requirements.txt
```

```bash
npm run dev
```

`npm run dev` starts both the Python analysis API and Vite. Vite proxies `/api/spam-check` to the Python service at `http://127.0.0.1:5050`. Use `npm run dev:web` only when the API is already running separately. For a separately hosted API, set `VITE_NLP_API_URL` to its complete spam-check endpoint before building the frontend.

Open the website at `http://127.0.0.1:5173`. Port `5050` is the analysis API; its root displays service information and its interactive FastAPI documentation is available at `/docs` when using `npm run nlp:fastapi`. SafeMind avoids port `5000` because macOS commonly reserves it for AirPlay Receiver.

## Deploy online with Vercel

The project includes `api/spam-check.js`, a serverless function. Vercel deploys it automatically at `/api/spam-check`, so the hosted Message Checker does not need `npm run nlp` or a continuously running local computer.

```bash
npx vercel deploy
```

Use `npx vercel deploy --prod` when the preview deployment is verified. The frontend and Python function must be deployed as one Vercel project so the default same-origin API path works.

## Unified security API

Send any supported content to `POST /api/spam-check`:

```json
{
  "scan_type": "link",
  "content": "http://secure-account-verify.example.top/login"
}
```

Supported scan types are `message`, `link`, `email`, and `phone`. The response contains an explainable `risk_score`, `confidence`, `risk`, `verdict`, `category`, `reason`, detected `indicators`, the analysis model, an agent summary, recommended actions, and a human-review flag. The original `{ "message": "..." }` request remains supported for compatibility. The health check is available at `GET /health` when the local Python service is running.

## Test

```bash
npm run test:nlp
npm run build:all
```

## Browser extension

The `extension` directory contains a low-permission Manifest V3 WebExtension for Chrome, Edge, Brave, Opera, Vivaldi, Firefox desktop, and Firefox for Android. It stores only the configured SafeMind website address and does not request access to tabs, browsing history, page content, passwords, or form data.

For local development, load `extension` as an unpacked extension and set its website address to the Vite development URL. For production, deploy SafeMind first and set the extension to the deployment root. See [`extension/README.md`](extension/README.md) for Chromium, Firefox, Safari packaging, validation, signing, and store-submission instructions.
