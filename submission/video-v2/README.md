# Selah editorial video render kit

This is a truth-gated 1080p renderer for the replacement Kaggle pitch video.
It uses the final paced narration in `../video-voiceover-v4-human.mp3`, the
editorial conversation cover, eight restrained burned-in proof lines, and seven short
real-product recording slots.

## Visual direction

The video borrows directly from the product rather than from generic AI-demo
language:

- near-black, warm paper, and one lime action color;
- Iowan/Baskerville editorial display type with plain system sans-serif UI text;
- square edges and rules instead of floating pills, glowing cards, or fake
  browser chrome;
- real product footage at full frame whenever a live clip exists;
- a restrained spoken hello over the conversation itself—never a title-card delay;
- a three-stage architecture statement instead of a diagram made of cards; and
- only decision/proof lines burned in. The full SRT is the accessibility track.

Preview mode may use `/private/tmp/selah-demo-current.jpg` as a design reference.
It is visibly labeled **OFFLINE REFERENCE · NOT LIVE EVIDENCE**. Override that
path with `PREVIEW_STILL=/absolute/path/to/image.jpg`. The image is never
accepted as a final clip.

## Render the honest previsualization

```bash
./submission/video-v2/render.sh preview
```

Missing screen captures are replaced by cards marked **NOT LIVE EVIDENCE** and
the whole video carries **PREVIEW · NOT FOR SUBMISSION**. The output is:

`submission/video-v2/rendered/selah-v5-conversation-first-PREVIZ-NOT-FOR-SUBMISSION.mp4`

## Render the final

1. Capture the seven files described in `clips/README.md`.
2. Verify the production Gloo → YouVersion → Gloo path and the safety stop.
3. Copy `evidence/verified.example.env` to `evidence/verified.env`, set both
   verification flags to `yes`, and record the verification time and evidence
   note.
4. Run:

```bash
./submission/video-v2/render.sh final
```

Final mode fails closed if a clip is missing, either verification flag is not
`yes`, or the finished video is not within the competition’s three-minute cap.
Its output is:

`submission/video-v2/rendered/selah-v5-conversation-first-FINAL.mp4`

Override the narration without editing the script by setting `AUDIO_FILE`.
The paced v4 human track is the default:

```bash
./submission/video-v2/render.sh preview
```

The renderer uses `video-voiceover-v4-human.srt` as the timing authority for
the spoken “Hi,” friend-message scenario, seven slots, editorial section
marks, proof overlays, and cover. The paced cut runs 87.20 seconds. Older v3,
v2 neural, and standard profiles remain available through `AUDIO_FILE`;
arbitrary narration is not silently forced into the edit.

The preview opens on the full-frame friend message at frame one. The spoken
“Hi” plays over it; then the reply and the Pause-versus-Send choice appear in
sync with the narration. These three opening cards are preview-only. A final
render still requires the corresponding genuine product recordings in
`clips/01-composer-hook.mp4` and `clips/02-pause-reveal.mp4`.

## Exact proof overlays

- `VERIFIED LIVE · Gloo → YouVersion → Gloo` appears only in final mode
  after `LIVE_PATH_VERIFIED=yes`.
- `VERIFIED SAFETY STOP · 0 retrieval · 0 reflection` appears only in
  final mode after `SAFETY_ZERO_CALLS_VERIFIED=yes`.
- The conceptual architecture overlay is always safe to show; it makes no claim
  that a particular request completed.

No credentials, provider payloads, private drafts, or logs belong in the video.
