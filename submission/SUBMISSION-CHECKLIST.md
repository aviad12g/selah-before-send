# Scripture in New Frontiers — Selah delivery checklist

Deadline: **August 1, 2026 at 04:59 UTC**
Jerusalem: **August 1, 2026 at 07:59 IDT**

## Finished and verified

- [x] Working no-account interaction prototype
- [x] Clearly separated offline-preview and live-API modes
- [x] Gloo → YouVersion → Gloo server orchestration
- [x] Exact BSB offline fixture with attribution
- [x] Credential-free preview restricted to the exact pinned sample
- [x] Wider Scripture context passed into the reflection stage
- [x] Strict assessment/reflection output contracts
- [x] Non-exhaustive pre-AI high-risk-language first pass
- [x] Bounded semantic risk contract that stops live retrieval/reflection
- [x] Upstream/overall timeouts, token cache, and live quota guard
- [x] Real ten-minute browser countdown
- [x] Accessible focus transfer, context controls, and improved contrast
- [x] Lint, strict TypeScript, production build, and 15/15 tests passing
- [x] Executed public notebook with 57 deterministic checks/cases
- [x] Sub-500-word final writeup
- [x] Sub-three-minute video script and shot list
- [x] Exact-text landscape cover in `public/og-editorial.png`
- [x] Public-ready README, MIT license, and empty credential template
- [x] Public-safe redacted production-validation result

## Identity/terms gates — entrant must complete

- [x] Join and accept the official Kaggle competition rules:
  <https://www.kaggle.com/competitions/scripture-in-new-frontiers/rules>
- [x] Register the YouVersion application and accept its applicable terms:
  <https://platform.youversion.com/summer-virtual-challenge-2026>
- [x] Register for Gloo AI Studio challenge credentials:
  <https://studio.ai.gloo.com/challenge>
- [x] Publish the repository through authenticated Git access:
  <https://github.com/aviad12g/selah-before-send>

Never paste credential values into chat, source, a notebook, or Kaggle. Store
them only as deployment secrets named `GLOO_CLIENT_ID`,
`GLOO_CLIENT_SECRET`, and `YVP_APP_KEY`.

## Live-validation gate

- [x] Add the three server-side secrets to production v4.
- [x] Make one redacted end-to-end request and confirm `source: "live"`.
- [x] Record public-safe provenance and provider-stage audits without recording
  prompts, credentials, request text, Scripture text, or reflection text.
- [x] Verify that an authenticated synthetic provider failure returns no post or
  fabricated Scripture.
- [x] Verify the deterministic safety stop attempts zero provider stages.
- [ ] Run broader redacted semantic-risk probes and verify every non-`none`
  result stops before YouVersion retrieval and the second Gloo call.
- [ ] Keep platform-level rate limiting enabled before public live mode.

## Kaggle delivery

- [x] Make the working demo public and no-login:
  <https://selah-before-send.aviadcoh.chatgpt.site>
- [x] Publish the source repository.
- [x] Attach `selah-before-send-audit.ipynb` as a public Project File.
- [x] Attach `production-validation-redacted.json` beside the notebook.
- [x] Upload `public/og-editorial.png` as the cover/media-gallery image.
- [x] Capture genuine production interactions with visible clicks and no mocked
  application state.
- [x] Upload the 86-second final video publicly to YouTube at 1080p with the
  verified English caption track:
  <https://www.youtube.com/watch?v=G0j-cC6ewFY>
- [x] Submit `kaggle-writeup.md` as the final writeup, not a draft.
- [x] Add the public demo, repository, notebook evidence, and final video.
- [x] Re-read the rendered entry and submit before the deadline:
  <https://www.kaggle.com/competitions/scripture-in-new-frontiers/writeups/selah-before-send>

## Truth gate for the final entry

Production v4/source `f63ab0b` passed all three redacted validator paths at
`2026-07-28T18:16:16.500Z`. The final video may show **LIVE API PATH** only
through genuine production captures. Preview cards remain **NOT LIVE EVIDENCE**
and must never be submitted.
