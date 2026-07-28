# Selah Before Send

**A Scripture-grounded pause before an impulsive social reply leaves your
hands.**

Selah Before Send is an interaction prototype for the Scripture in New
Frontiers challenge. It places an opt-in pause inside a simulated social reply
composer. Rather than writing for the user or posting a verse at someone else,
Selah retrieves a relevant passage and its wider context, asks one private
question, and returns the final language and decision to the user.

The prototype supports three outcomes:

- **Edit in my own words** preserves the user's point while offering three
  small editing moves.
- **Pause 10 minutes** starts a real ten-minute browser countdown while holding
  the simulated draft.
- **Send anyway** preserves user agency. The prototype is not connected to a
  real social account, so it does not post.

## Status

The full interaction, exact-sample curated preview, and live orchestration path
are implemented. [Production v4 is public and requires no
login](https://selah-before-send.aviadcoh.chatgpt.site); it was built from
source commit `f63ab0b175d08f8450d8acbe89071a5e79271c74`.

At `2026-07-28T18:16:16.500Z`, the redacted production validator passed all
three paths: a completed live Gloo → YouVersion → Gloo response with
provenance, a deterministic safety stop with zero provider stages attempted,
and an authenticated synthetic provider failure that returned no generated
output. The public-safe result is recorded in
`submission/production-validation-redacted.json`. Without credentials, a local
deployment can replay only the pinned sample; novel drafts fail closed.

No user study has been run. This repository demonstrates the product concept
and technical pipeline, not measured behavior change.

## How it works

```text
original post + draft
        |
        v
Gloo assessment
(temperature + need + fixed theme + semantic risk)
        |
        +-- risk != none --> stop; no Scripture retrieval or reflection
        |
        v
curated passage identifier
        |
        v
YouVersion retrieval
(focus text + wider context + Bible attribution)
        |
        v
Gloo reflection grounded in the retrieved text
(one question + edit prompt + three moves)
        |
        v
user chooses: edit / pause / send anyway
```

### 1. Assess without diagnosing

The first Gloo request must call a structured assessment tool whose schema
contains conversation temperature, a charitable description of the underlying
need, and one of five allowed themes (`listen`, `gentleness`, `repair`,
`judgment`, or `burden`). It also returns a bounded semantic risk level and
category. Any validated risk other than `none` stops the pipeline before
passage retrieval or reflection. The prompt forbids diagnosis,
protected-attribute inference, blame, preaching, and Scripture quotation.

### 2. Retrieve, never invent

Each theme maps to a curated passage identifier. The YouVersion Platform path
retrieves the focused text, a wider context range, Bible metadata, and
attribution. Live responses also carry exact, machine-checkable provenance:
the provider name, Bible ID, version, focus passage ID, and context passage ID.
The passage set is pinned to the Berean Standard Bible (BSB). The application
does not ask a language model to generate Biblical text.

### 3. Reflect, never replace

The second Gloo request receives the original post and draft, the assessment,
the focused passage, and its wider context. It returns one bounded question,
an editing prompt, and three short moves. Its contract forbids writing the
reply, shaming, diagnosis, promises, claims of divine intent, and references to
Scripture outside the supplied text.

## Safety, privacy, and agency

- Inputs are trimmed and bounded; model outputs are schema-checked and
  length-bounded.
- Passage selection is restricted to a fixed allowlist.
- External calls have timeouts and the live path fails closed if any required
  call or validation step fails. Bible metadata has a pinned attribution
  fallback.
- A non-exhaustive deterministic first pass catches explicit high-risk
  phrasing before any AI call. In live mode, the bounded Gloo assessment adds
  semantic triage for paraphrase; any non-`none` risk result stops before
  YouVersion retrieval or the reflection call. A safety stop offers the
  international [Find A Helpline](https://findahelpline.com/) directory.
- The deterministic layer is a floor, not a claim of comprehensive detection.
  If live semantic screening is unavailable, novel drafts receive no fixture
  or reflection.
- Neither safety layer is claimed to be comprehensive; this prototype is not a
  crisis service or production moderation system.
- The live path has a best-effort per-edge-client quota guard. A production
  integration should also configure a platform-level rate-limiting rule.
- Gloo access tokens are cached in worker memory until shortly before expiry;
  no token is sent to the browser.
- API responses are marked `no-store`.
- Responses include a redacted pipeline audit with provider-stage
  attempted/completed booleans. It contains no credentials or user text. For a
  deterministic safety stop, all provider stages are `false`; regression tests
  separately assert that the network function was never called.
- The application has no database, account system, analytics, or message
  persistence. The live quota guard temporarily counts requests by the
  Cloudflare-provided client address within a worker instance.
- In live mode, the original post and draft are transmitted server-side to
  Gloo for both AI stages. YouVersion receives passage identifiers, not the
  user's draft. Provider-side data handling is governed by those services and
  should be reviewed before production use.
- Nothing posts automatically. When a high-risk stop fires, Selah withholds the
  reflection and does not advise whether to send; the user can recheck an
  edited draft or leave the simulated flow.
- API failures leave the draft in the browser and return a non-posting error
  state.

## Demo modes

| Mode | Condition | What the interface shows |
| --- | --- | --- |
| Curated preview | One or more API credentials are absent and the input exactly matches the pinned sample | A deterministic, labeled response with `source: "curated-demo"` |
| Fail-closed preview | One or more API credentials are absent and the input differs from the pinned sample | No reflection; `LIVE_SAFETY_UNAVAILABLE` |
| Live path | All three credentials are present and calls succeed | Retrieved and generated output labeled `source: "live"` |

The curated mode exists so reviewers can inspect the complete interaction
without a secret key. It cannot classify user-entered text and must not be
represented as an API result.

## Local setup

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

To regenerate and execute the public audit notebook:

```bash
python3 -m pip install -r submission/requirements-notebook.txt
python3 submission/build_notebook.py
```

The notebook dependency is pinned to the version used for the checked-in
artifact. Its cells are executed top to bottom and validated before the file is
written.

For the live path, copy `.env.example` to an ignored local environment file and
configure these server-side variables:

```text
GLOO_CLIENT_ID
GLOO_CLIENT_SECRET
YVP_APP_KEY
```

Never expose those values in client code or commit them to the repository.

For the optional redacted production fault-injection check, also configure a
random 32+ character server-only `SELAH_VALIDATION_SECRET`. The validator uses
it to HMAC-sign a one-minute request; the secret itself is never transmitted.
The authenticated scenario simulates a provider adapter failure before any
network request and verifies the normal fail-closed response path. It cannot
change data, reveal credentials, or generate a reflection.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` builds the vinext/Cloudflare worker and verifies the server-rendered
surface, deterministic safety floor, exact-sample preview, and fail-closed
behavior for novel drafts. The current suite contains 15 tests.

Production v4 passed the redacted validator at
`2026-07-28T18:16:16.500Z`. To repeat that validation from a trusted shell:

```bash
SELAH_VALIDATION_SECRET='the-server-side-validation-secret' \
  npm run validate:production -- \
  --base-url 'https://your-deployed-site.example'
```

It makes three synthetic requests: a successful live reflection, a
deterministic safety stop, and an HMAC-authenticated synthetic provider
failure. Its JSON output includes only statuses, provenance identifiers, and
pipeline stage booleans; it intentionally omits request text, Scripture text,
reflection text, signatures, and credentials. The checked-in redacted result
also records the deployed site version and exact source commit.

## Scope and next steps

This build uses a simulated social conversation and a fixed sample post. It is
not yet a browser extension or platform integration. The next evidence
milestone is safety review and small, consent-based usability testing before
any real posting integration.

## Competition package

The `submission/` directory contains:

- the final, sub-500-word Kaggle writeup;
- a timed, sub-three-minute video script and shot list;
- an executed, public-ready notebook with 57 deterministic checks/cases;
- the notebook generator and pinned Python requirement;
- a public-safe redacted production-validation result; and
- a truth-gated delivery checklist.

The landscape cover image is `public/og-editorial.png`.

## License

The application source is available under the [MIT License](LICENSE). The
included BSB passage and its attribution are governed by the notice displayed
in the application.
