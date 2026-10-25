# DraftMate Legal Drafting Studio

DraftMate is a legal drafting workspace for reviewing agreements, explaining potential risks, preparing editable revisions, and comparing cited references with material supplied by the user.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/draftmate-studio` — React workspace, local document/draft library, file parsing, review results, and exports
- `artifacts/api-server/src/routes/draftmate.ts` — AI drafting and contract-review endpoints
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and validation schemas
- `lib/api-client-react` and `lib/api-zod` — generated API hooks and request/response validation

## Architecture decisions

- Drafts and reference documents remain in browser storage; extracted document text is sent to the server only when the user starts an AI request.
- The OpenAI key is used server-side from Replit Secrets and must never be exposed to the browser or logs.
- Citation checks compare citation text only with the supporting materials provided in that request. They do not search external legal sources or establish that an authority is current or applicable.
- Uploaded documents are not stored by the API server. Scanned PDFs need OCR before their text can be reviewed.

## Product

The flagship workflow is Contract Review → Identify Risks → Compare Cited References → Prepare a Revised Draft. Findings distinguish observed contract wording from concerns, missing information, and suggested changes. Material edits are tied to a finding or user instruction.

## User preferences

Use the uploaded DraftMate prototype as the starting point and the supplied screenshot as the workspace reference.

## Gotchas

- This prototype has no user accounts or document access controls. Do not publish it for public use with sensitive client documents until authentication, access controls, and stronger usage protections are in place.
- The in-memory AI request limit is a prototype safeguard, not a substitute for account-level quotas or abuse controls.
- The OpenAI key is a Replit Secret; never expose it to frontend code or logs.
- AI output is not legal advice. Citation matches are limited to the user's supplied material and are not independent legal verification.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
