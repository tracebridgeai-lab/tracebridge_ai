# TraceBridge AI

TraceBridge checks whether a medical device submission package agrees with itself before FDA reads it.

> **BU Spark DS 549 team:** start with the [Branching & Collaboration Guide](BU_SPARK_WORKFLOW.md). All student work goes into the `bu-spark` branch through pull requests. Never push to `main`.

## Built today vs. building this semester

| | What it is | Where it lives |
| --- | --- | --- |
| **Built today** | A working prototype that checks Q-Sub (Pre-Submission) agreements against the evidence documents in a package and shows the matches and gaps in a traceability matrix. It runs on synthetic test packages. Accuracy has not been measured yet. | `main` (deployed to tracebridge.ai) |
| **Building this semester** | A 510(k) pipeline that detects defects across documents (missing data, incomplete traceability, outdated references, undocumented controls), cites both sides of every finding, and is scored with precision and recall against planted errors. | `bu-spark` and your `spark/<feature>` branches |
| **Founder's redesign** | A pre-eSTAR readiness check (Upload, Findings by eSTAR section, Review and export). Owned by James. | `redesign/pre-estar` (please don't commit here) |

## Tech stack

- Next.js and TypeScript, deployed on Vercel
- Firebase for sign-in, database (Firestore) and file storage
- Google Gemini API for analysis (`GEMINI_MOCK_MODE=true` runs without calling the API)
- Playwright for end-to-end tests

## Run it locally

```bash
git clone https://github.com/tracebridgeai-lab/tracebridge_ai.git
cd tracebridge_ai
git checkout bu-spark
npm install
cp .env.example .env.local   # then fill in the values James shares with you
npm run dev
```

Open http://localhost:3000.

Never commit `.env.local` or any key, token or password. If you need a credential, ask James.

## Where things are

| Folder | What's in it |
| --- | --- |
| `src/app/dashboard/` | The app's pages: upload, results, reports, traceability |
| `src/app/api/` | Server routes: upload, analyze, gap, drift, traceability, precedents and others |
| `src/pipeline/` | Analysis pipeline code |
| `src/lib/` | Shared helpers, Firebase setup, FDA product code list |
| `demo_data/` | Synthetic test documents used by scripts and tests |
| `public/demo_data/` | Synthetic documents the app loads directly |
| `FDA_Test_Dossiers/` | Three small synthetic dossiers (compliant, software failure, predicate failure) |
| `scripts/` | Seeding, evaluation and data-generation scripts; `scripts/synthetic_dataset/` holds generated .docx packages |
| `phase_2_files/` | FDA guidance and regulatory templates used for rules |
| `tests/e2e/` | Playwright tests |

All test data in this repo is synthetic. Real company submission data is never committed here.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build (run this before opening a PR) |
| `npm run lint` | Lint the code |
| `npm run eval:hostile` | Run the evaluation engine over `demo_data/` |
| `npx playwright test` | Run the end-to-end tests |

## Confidentiality

Public FDA data is open. TraceBridge's dataset, curation and compiled data are confidential, and this repository is private. Don't copy code or data out of it.
