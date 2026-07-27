# Selah Before Send

## Impact & Vision

Some consequential digital moments last one second: the pause between writing an angry reply and pressing send.

Selah Before Send brings Scripture into that threshold. It is an opt-in pause inside a familiar social reply composer—not another destination to remember. When a draft is heated, Selah opens a non-public reflection with a relevant Biblical passage, wider context, and one question. The user can revise, start a ten-minute countdown, or send anyway. Selah never inserts model text into the reply, posts Scripture publicly, or takes the send button.

The prototype demonstrates Scripture as a private aid to attention before speech becomes public. A future browser or platform integration could make that pause available wherever conflict happens. This build is a working simulated composer, not a social-account integration; no user-impact study has been run.

## Experience & Story

The demo begins with a tense post and defensive reply. **Pause before sending** opens a panel naming the temperature and charitable need the draft may protect. It shows a focused passage, offers surrounding verses, and asks one private question. Three choices preserve agency: **Edit in my own words**, **Pause 10 minutes**, or **Send anyway**.

The interface explicitly labels whether the response came from the live API path or the curated offline preview. Nothing is auto-posted or persisted by the app. The ten-minute choice runs a real browser countdown.

## Technical Depth & Execution

Selah uses a two-stage, provenance-first pipeline:

1. Gloo AI Studio classifies the draft into a fixed schema: temperature, underlying need, and one of five permitted themes.
2. The theme selects a curated passage identifier; YouVersion Platform retrieves the exact text, wider context, and Bible attribution. The build pins that passage set to the BSB.
3. A second Gloo request receives the post, draft, assessment, focused passage, and wider context. Its Biblical grounding is restricted to that supplied text, and it is instructed not to diagnose, shame, claim divine intent, or write the reply.

Strict type, form, word, and length validation; bounded inputs; a passage allowlist; timeouts; token caching; and fail-closed errors constrain the model path. A deterministic safety gate stops threats, self-harm, abuse, and immediate-danger language before any AI call. Live mode also has a best-effort quota guard.

The application does not persist messages; in live mode, Gloo necessarily processes the post and draft server-side under its provider terms. If credentials are absent, the public prototype uses a clearly labeled deterministic fixture so the interaction remains reviewable without pretending the APIs ran. An executed public notebook records 46 deterministic contract checks and zero external calls.

**Validation status:** The curated prototype path is implemented. The live Gloo + YouVersion path requires registered participant credentials and an end-to-end validation run before it should be described as live.
