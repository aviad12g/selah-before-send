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

The full interaction and deterministic curated-preview path are implemented.
The live orchestration path is present in the server route but requires
registered Gloo AI Studio and YouVersion Platform credentials plus an
end-to-end validation run. Until that validation is complete, the deployed
experience must not be described as using live API responses.

No user study has been run. This repository demonstrates the product concept
and technical pipeline, not measured behavior change.

## How it works

```text
original post + draft
        |
        v
Gloo assessment
(temperature + need + fixed theme)
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

The first Gloo request returns a fixed JSON contract: conversation
temperature, a charitable description of the underlying need, and one of five
allowed themes (`listen`, `gentleness`, `repair`, `judgment`, or `burden`). The
prompt forbids diagnosis, protected-attribute inference, blame, preaching, and
Scripture quotation.

### 2. Retrieve, never invent

Each theme maps to a curated passage identifier. The YouVersion Platform path
retrieves the focused text, a wider context range, Bible metadata, and
attribution. The passage set is pinned to the Berean Standard Bible (BSB). The
application does not ask a language model to generate Biblical text.

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
- External calls have timeouts and the live path fails closed if any call or
  validation step fails.
- A deterministic high-risk-language gate stops drafts involving threats,
  self-harm, abuse, or immediate danger before any AI call and offers the
  international [Find A Helpline](https://findahelpline.com/) directory.
- The live path has a best-effort per-edge-client quota guard. A production
  integration should also configure a platform-level rate-limiting rule.
- Gloo access tokens are cached in worker memory until shortly before expiry;
  no token is sent to the browser.
- API responses are marked `no-store`.
- The application has no database, account system, analytics, or message
  persistence. The live quota guard temporarily counts requests by the
  Cloudflare-provided client address within a worker instance.
- In live mode, the original post and draft are transmitted server-side to
  Gloo for both AI stages. YouVersion receives passage identifiers, not the
  user's draft. Provider-side data handling is governed by those services and
  should be reviewed before production use.
- Nothing posts automatically, and the user can always close the pause or send
  anyway.
- API failures leave the draft in the browser and return a non-posting error
  state.

## Demo modes

| Mode | Condition | What the interface shows |
| --- | --- | --- |
| Curated preview | One or more API credentials are absent | A deterministic, labeled response with `source: "curated-demo"` |
| Live path | All three credentials are present and calls succeed | Retrieved and generated output labeled `source: "live"` |

The curated mode exists so reviewers can inspect the complete interaction
without a secret key. It must not be represented as an API result.

## Local setup

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

For the live path, copy `.env.example` to an ignored local environment file and
configure these server-side variables:

```text
GLOO_CLIENT_ID
GLOO_CLIENT_SECRET
YVP_APP_KEY
```

Never expose those values in client code or commit them to the repository.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` builds the vinext/Cloudflare worker and verifies both the
server-rendered surface and the deterministic API behavior. A credentialed
end-to-end test of both external APIs remains required before the live
integration claim is submission-ready.

## Scope and next steps

This build uses a simulated social conversation and a fixed sample post. It is
not yet a browser extension or platform integration. The next evidence
milestone is a credentialed API run with captured provenance, followed by
safety review and small, consent-based usability testing before any real
posting integration.

## Competition package

The `submission/` directory contains:

- the final 462-word Kaggle writeup;
- a timed, sub-three-minute video script and shot list;
- an executed, public-ready notebook with 46 deterministic checks/cases;
- the notebook generator; and
- a truth-gated delivery checklist.

The landscape cover image is `public/og.png`.

## License

The application source is available under the [MIT License](LICENSE). The
included BSB passage and its attribution are governed by the notice displayed
in the application.
