# Selah Before Send

## Impact & Vision

Some online moments last one second: the pause between writing an angry reply and pressing send.

Selah Before Send brings Scripture into that threshold. It is an opt-in pause inside a social reply composer. For a heated draft, Selah opens a non-public reflection with a relevant Biblical passage, wider context, and one question. The user can revise, start a ten-minute countdown, or send anyway. Selah never inserts model text or posts Scripture publicly.

The prototype demonstrates Scripture as a private aid to attention before speech becomes public. A future browser or platform integration could make that pause available wherever conflict happens. This build is a working simulated composer, not a social-account integration; no user-impact study has been run.

## Experience & Story

The demo begins with a tense post and defensive reply. **Pause before sending** opens a panel naming its temperature and charitable need. It shows a focused passage, offers surrounding verses, and asks one private question. Three choices preserve agency: **Edit in my own words**, **Pause 10 minutes**, or **Send anyway**.

The interface labels live API and curated offline responses. Selah stores no messages and never auto-posts; in live mode, Gloo processes the post and draft under its provider terms. The ten-minute choice runs a real browser countdown.

## Technical Depth & Execution

Selah uses a three-stage, provenance-first pipeline:

1. Gloo AI Studio classifies the draft into a fixed schema: temperature, underlying need, one of five permitted themes, and a bounded semantic risk level/category. Any risk other than `none` stops the pipeline.
2. The theme selects a curated passage identifier; YouVersion Platform retrieves the exact text, wider context, and Bible attribution. The build pins that passage set to the BSB.
3. A second Gloo request receives the post, draft, assessment, focused passage, and wider context. Its Biblical grounding is restricted to that supplied text, and it is instructed not to diagnose, shame, claim divine intent, or write the reply.

Strict type, form, word, and length validation; bounded inputs; a passage allowlist; timeouts; token caching; and fail-closed errors constrain the model path. A non-exhaustive deterministic first pass catches explicit high-risk phrasing before any AI call. In live mode, Gloo’s bounded semantic risk field adds a second layer for paraphrase; non-`none` results stop before Scripture retrieval or reflection. Neither layer is claimed comprehensive. Live mode also has a best-effort quota guard.

If credentials are absent, the prototype replays its clearly labeled fixture only for the exact pinned sample and rejects novel drafts. An executed public notebook records 57 deterministic contract checks and zero external calls.

**Validation status:** [Public production v4](https://selah-before-send.aviadcoh.chatgpt.site), built from source commit `f63ab0b`, passed a redacted validator on July 28, 2026: completed live Gloo → YouVersion → Gloo with provenance; deterministic safety stop with zero provider stages attempted; and authenticated provider failure with no generated output.
