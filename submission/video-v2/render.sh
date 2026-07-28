#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MODE="${1:-preview}"

if [[ "${MODE}" != "preview" && "${MODE}" != "final" ]]; then
  echo "Usage: $0 [preview|final]" >&2
  exit 2
fi

if [[ -x /opt/homebrew/bin/ffmpeg ]]; then
  FFMPEG=/opt/homebrew/bin/ffmpeg
  FFPROBE=/opt/homebrew/bin/ffprobe
else
  FFMPEG="$(command -v ffmpeg)"
  FFPROBE="$(command -v ffprobe)"
fi

for command in node "${FFMPEG}" "${FFPROBE}"; do
  if ! command -v "${command}" >/dev/null 2>&1 && [[ ! -x "${command}" ]]; then
    echo "Required command is missing: ${command}" >&2
    exit 1
  fi
done

AUDIO_FILE="${AUDIO_FILE:-${PROJECT_ROOT}/submission/video-voiceover-v4-human.mp3}"
if [[ ! -f "${AUDIO_FILE}" ]]; then
  echo "Narration not found: ${AUDIO_FILE}" >&2
  exit 1
fi
audio_basename="$(basename "${AUDIO_FILE}")"
if [[ "${AUDIO_PROFILE:-auto}" == "v4" || "${audio_basename}" == *"v4-human."* ]]; then
  PROFILE=v4
elif [[ "${AUDIO_PROFILE:-auto}" == "v3" || "${audio_basename}" == *"v3-human."* ]]; then
  PROFILE=v3
elif [[ "${AUDIO_PROFILE:-auto}" == "human" || "${audio_basename}" == *"v2-human."* ]]; then
  PROFILE=human
else
  PROFILE=standard
fi

ASSETS="${SCRIPT_DIR}/assets"
CLIPS="${SCRIPT_DIR}/clips"
WORK="${SCRIPT_DIR}/work"
RENDERED="${SCRIPT_DIR}/rendered"
EVIDENCE="${SCRIPT_DIR}/evidence/verified.env"
mkdir -p "${ASSETS}" "${WORK}" "${RENDERED}"

node "${SCRIPT_DIR}/generate-graphics.mjs" "--profile=${PROFILE}"

clip_names=(
  "01-composer-hook.mp4"
  "02-pause-reveal.mp4"
  "03-live-result.mp4"
  "04-agency.mp4"
  "05-safety-stop.mp4"
  "06-architecture-bed.mp4"
  "07-return-composer.mp4"
)
if [[ "${PROFILE}" == "v4" ]]; then
  # Timed directly from video-voiceover-v4-human.srt. The final cover begins
  # with the last spoken thought at 81.120 seconds.
  durations=(12.436 2.596 21.532 14.452 15.434 11.564 3.105)
  PRODUCT_DURATION=81.119
elif [[ "${PROFILE}" == "v3" ]]; then
  # Timed directly from the normalized video-voiceover-v3-human.srt.
  durations=(16.104 3.190 16.289 14.011 12.929 11.641 3.021)
  PRODUCT_DURATION=77.185
elif [[ "${PROFILE}" == "human" ]]; then
  # Timed directly from video-voiceover-v2-human.srt.
  durations=(10.325 10.378 19.388 11.159 12.617 11.328 2.956)
  PRODUCT_DURATION=78.151
else
  durations=(7.5 10.5 26 16 14 11 2)
  PRODUCT_DURATION=87
fi

missing=()
for clip in "${clip_names[@]}"; do
  if [[ ! -f "${CLIPS}/${clip}" ]]; then
    missing+=("${clip}")
  fi
done

if [[ "${MODE}" == "final" ]]; then
  if (( ${#missing[@]} > 0 )); then
    echo "Final render locked. Missing real capture(s):" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
  if [[ ! -f "${EVIDENCE}" ]]; then
    echo "Final render locked. Create evidence/verified.env after production validation." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "${EVIDENCE}"
  if [[ "${LIVE_PATH_VERIFIED:-no}" != "yes" ]]; then
    echo "Final render locked: LIVE_PATH_VERIFIED must be yes." >&2
    exit 1
  fi
  if [[ "${SAFETY_ZERO_CALLS_VERIFIED:-no}" != "yes" ]]; then
    echo "Final render locked: SAFETY_ZERO_CALLS_VERIFIED must be yes." >&2
    exit 1
  fi
fi

normalize_real_clip() {
  local input="$1"
  local duration="$2"
  local output="$3"
  local fade_out
  fade_out="$(node -e "console.log(Math.max(0, Number(process.argv[1]) - 0.22).toFixed(3))" "${duration}")"
  "${FFMPEG}" -hide_banner -loglevel error -y \
    -i "${input}" \
    -vf "tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080a0f,fps=30,format=yuv420p,fade=t=in:st=0:d=0.18,fade=t=out:st=${fade_out}:d=0.22" \
    -an -c:v libx264 -preset medium -crf 18 -movflags +faststart "${output}"
}

make_placeholder_clip() {
  local input="$1"
  local duration="$2"
  local output="$3"
  local fade_out
  fade_out="$(node -e "console.log(Math.max(0, Number(process.argv[1]) - 0.22).toFixed(3))" "${duration}")"
  "${FFMPEG}" -hide_banner -loglevel error -y \
    -loop 1 -i "${input}" -t "${duration}" \
    -vf "scale=1920:1080,zoompan=z='min(zoom+0.00008,1.012)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,format=yuv420p,fade=t=in:st=0:d=0.18,fade=t=out:st=${fade_out}:d=0.22" \
    -an -c:v libx264 -preset medium -crf 18 -movflags +faststart "${output}"
}

segment_files=()
for index in "${!clip_names[@]}"; do
  number="$(printf '%02d' "$((index + 1))")"
  segment="${WORK}/segment-${number}.mp4"
  clip="${CLIPS}/${clip_names[$index]}"
  duration="${durations[$index]}"
  placeholder="${ASSETS}/placeholder-${number}.png"
  if [[ -f "${clip}" ]]; then
    echo "Using real capture: ${clip_names[$index]}"
    normalize_real_clip "${clip}" "${duration}" "${segment}"
  else
    echo "Using marked placeholder: ${clip_names[$index]}"
    make_placeholder_clip "${placeholder}" "${duration}" "${segment}"
  fi
  segment_files+=("${segment}")
done

AUDIO_DURATION="$("${FFPROBE}" -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "${AUDIO_FILE}")"
COVER_DURATION="$(node -e \
  "console.log(Math.max(1, Number(process.argv[1]) - Number(process.argv[2])).toFixed(6))" \
  "${AUDIO_DURATION}" "${PRODUCT_DURATION}")"
COVER_SEGMENT="${WORK}/segment-08-cover.mp4"
COVER_FADE="$(node -e "console.log(Math.max(0, Number(process.argv[1]) - 0.5).toFixed(3))" "${COVER_DURATION}")"

"${FFMPEG}" -hide_banner -loglevel error -y \
  -loop 1 -i "${PROJECT_ROOT}/public/og-editorial.png" -t "${COVER_DURATION}" \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00008,1.010)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=${COVER_FADE}:d=0.50" \
  -an -c:v libx264 -preset medium -crf 18 -movflags +faststart "${COVER_SEGMENT}"
segment_files+=("${COVER_SEGMENT}")

CONCAT_LIST="${WORK}/concat.txt"
: > "${CONCAT_LIST}"
for segment in "${segment_files[@]}"; do
  printf "file '%s'\n" "${segment}" >> "${CONCAT_LIST}"
done

BASE="${WORK}/base.mp4"
"${FFMPEG}" -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "${CONCAT_LIST}" -an -c copy "${BASE}"

overlay_inputs=(-i "${BASE}")
filter="[0:v]setpts=PTS-STARTPTS[v0]"
overlay_count=0

add_overlay() {
  local image="$1"
  local start="$2"
  local end="$3"
  overlay_count=$((overlay_count + 1))
  overlay_inputs+=(-loop 1 -i "${image}")
  filter="${filter};[${overlay_count}:v]format=rgba[ov${overlay_count}];[v$((overlay_count - 1))][ov${overlay_count}]overlay=0:0:enable='between(t,${start},${end})':eof_action=pass[v${overlay_count}]"
}

if [[ "${PROFILE}" == "v4" ]]; then
  # Paced editorial cut, timed from video-voiceover-v4-human.srt.
  # Start on the actual dilemma. The spoken “Hi” plays over Mara's complete
  # message instead of delaying the hook with a separate greeting card.
  if [[ "${MODE}" == "preview" ]]; then
    add_overlay "${ASSETS}/opening-message.png" 0.00 6.920
    add_overlay "${ASSETS}/opening-reply.png" 6.920 12.436
    add_overlay "${ASSETS}/opening-pause.png" 12.436 15.032
  fi

  # No chapter banner here: the conversation itself already provides the
  # section context, and a banner would compete with the product header.
  add_overlay "${ASSETS}/chapter-02.png" 15.032 35.92
  add_overlay "${ASSETS}/chapter-03.png" 36.564 50.30
  add_overlay "${ASSETS}/chapter-04.png" 51.016 65.70
  add_overlay "${ASSETS}/chapter-05.png" 66.450 77.70

  # Only decision and proof lines are burned in. The full v4 SRT remains the
  # accessibility track and the canonical timing reference.
  add_overlay "${ASSETS}/caption-01.png" 12.436 13.727
  add_overlay "${ASSETS}/caption-02.png" 20.490 23.583
  add_overlay "${ASSETS}/caption-03.png" 28.954 33.088
  add_overlay "${ASSETS}/caption-04.png" 33.088 35.922
  add_overlay "${ASSETS}/caption-05.png" 42.827 50.289
  add_overlay "${ASSETS}/caption-06.png" 51.016 56.897
  add_overlay "${ASSETS}/caption-07.png" 59.594 65.583

  add_overlay "${ASSETS}/architecture.png" 66.450 78.014
  if [[ "${MODE}" == "final" ]]; then
    add_overlay "${ASSETS}/proof-live.png" 28.954 33.088
    add_overlay "${ASSETS}/proof-safety.png" 59.594 62.872
  fi
elif [[ "${PROFILE}" == "v3" ]]; then
  # Editorial v4: a human hello, a short title card, then product-first proof.
  add_overlay "${ASSETS}/intro-hello.png" 0.05 0.985
  add_overlay "${ASSETS}/intro-title.png" 0.985 5.8

  add_overlay "${ASSETS}/chapter-01.png" 6.586 19.2
  add_overlay "${ASSETS}/chapter-02.png" 19.294 35.4
  add_overlay "${ASSETS}/chapter-03.png" 35.583 49.4
  add_overlay "${ASSETS}/chapter-04.png" 49.594 62.4
  add_overlay "${ASSETS}/chapter-05.png" 62.523 74.1

  # Burn in only the lines that carry a decision or a proof claim. The full
  # normalized SRT remains the accessibility track for YouTube.
  add_overlay "${ASSETS}/caption-01.png" 18.122 19.294
  add_overlay "${ASSETS}/caption-02.png" 19.294 22.602
  add_overlay "${ASSETS}/caption-03.png" 28.253 32.602
  add_overlay "${ASSETS}/caption-04.png" 32.602 35.583
  add_overlay "${ASSETS}/caption-05.png" 41.977 49.594
  add_overlay "${ASSETS}/caption-06.png" 49.594 55.362
  add_overlay "${ASSETS}/caption-07.png" 55.362 62.523
  add_overlay "${ASSETS}/caption-08.png" 74.164 82.510

  add_overlay "${ASSETS}/architecture.png" 62.523 74.164
  if [[ "${MODE}" == "final" ]]; then
    add_overlay "${ASSETS}/proof-live.png" 29.0 32.2
    add_overlay "${ASSETS}/proof-safety.png" 56.6 60.8
  fi
elif [[ "${PROFILE}" == "human" ]]; then
  # Sparse chapter labels, timed to the neural narration.
  add_overlay "${ASSETS}/chapter-01.png" 10.325 20.6
  add_overlay "${ASSETS}/chapter-02.png" 20.703 39.9
  add_overlay "${ASSETS}/chapter-03.png" 40.091 51.1
  add_overlay "${ASSETS}/chapter-04.png" 51.25 63.7
  add_overlay "${ASSETS}/chapter-05.png" 63.867 75.1

  add_overlay "${ASSETS}/caption-01.png" 8.4 10.3
  add_overlay "${ASSETS}/caption-02.png" 10.4 19.4
  add_overlay "${ASSETS}/caption-03.png" 20.7 27.6
  add_overlay "${ASSETS}/caption-04.png" 30.1 34.3
  add_overlay "${ASSETS}/caption-05.png" 34.3 37.4
  add_overlay "${ASSETS}/caption-07.png" 43.5 48.4
  add_overlay "${ASSETS}/caption-06.png" 48.5 51.2
  add_overlay "${ASSETS}/caption-08.png" 51.3 57.1
  add_overlay "${ASSETS}/caption-09.png" 57.1 63.8
  add_overlay "${ASSETS}/caption-10.png" 63.9 75.1
  add_overlay "${ASSETS}/caption-11.png" 75.2 "${AUDIO_DURATION}"

  add_overlay "${ASSETS}/architecture.png" 64.3 74.8
  if [[ "${MODE}" == "final" ]]; then
    add_overlay "${ASSETS}/proof-live.png" 23.5 26.7
    add_overlay "${ASSETS}/proof-safety.png" 57.8 61.0
  fi
else
  # Sparse chapter labels, timed to the original narration.
  add_overlay "${ASSETS}/chapter-01.png" 7.5 17.8
  add_overlay "${ASSETS}/chapter-02.png" 18.0 43.8
  add_overlay "${ASSETS}/chapter-03.png" 44.0 59.8
  add_overlay "${ASSETS}/chapter-04.png" 60.0 73.8
  add_overlay "${ASSETS}/chapter-05.png" 74.0 84.8

  add_overlay "${ASSETS}/caption-01.png" 0.2 6.8
  add_overlay "${ASSETS}/caption-02.png" 7.6 16.8
  add_overlay "${ASSETS}/caption-03.png" 18.2 25.8
  add_overlay "${ASSETS}/caption-04.png" 26.0 33.5
  add_overlay "${ASSETS}/caption-05.png" 34.0 42.5
  add_overlay "${ASSETS}/caption-06.png" 44.4 51.5
  add_overlay "${ASSETS}/caption-07.png" 52.0 59.0
  add_overlay "${ASSETS}/caption-08.png" 60.2 66.5
  add_overlay "${ASSETS}/caption-09.png" 66.8 73.4
  add_overlay "${ASSETS}/caption-10.png" 74.4 83.3
  add_overlay "${ASSETS}/caption-11.png" 84.8 90.6

  add_overlay "${ASSETS}/architecture.png" 75.0 83.8
  if [[ "${MODE}" == "final" ]]; then
    add_overlay "${ASSETS}/proof-live.png" 20.5 23.7
    add_overlay "${ASSETS}/proof-safety.png" 67.8 71.0
  fi
fi

if [[ "${MODE}" == "preview" ]]; then
  add_overlay "${ASSETS}/preview-watermark.png" 0 "${AUDIO_DURATION}"
fi

VISUAL="${WORK}/visual-${MODE}.mp4"
"${FFMPEG}" -hide_banner -loglevel error -y \
  "${overlay_inputs[@]}" \
  -filter_complex "${filter}" -map "[v${overlay_count}]" \
  -t "${AUDIO_DURATION}" -an -c:v libx264 -preset medium -crf 18 \
  -pix_fmt yuv420p -movflags +faststart "${VISUAL}"

if [[ "${MODE}" == "final" ]]; then
  if [[ "${PROFILE}" == "v4" ]]; then
    OUTPUT="${RENDERED}/selah-v5-conversation-first-FINAL.mp4"
  else
    OUTPUT="${RENDERED}/selah-v4-editorial-FINAL.mp4"
  fi
elif [[ "${PROFILE}" == "v4" ]]; then
  OUTPUT="${RENDERED}/selah-v5-conversation-first-PREVIZ-NOT-FOR-SUBMISSION.mp4"
elif [[ "${PROFILE}" == "v3" ]]; then
  OUTPUT="${RENDERED}/selah-v4-editorial-PREVIZ-NOT-FOR-SUBMISSION.mp4"
elif [[ "${PROFILE}" == "human" ]]; then
  OUTPUT="${RENDERED}/selah-v2-human-PREVIZ-NOT-FOR-SUBMISSION.mp4"
else
  OUTPUT="${RENDERED}/selah-v2-PREVIZ-NOT-FOR-SUBMISSION.mp4"
fi

"${FFMPEG}" -hide_banner -loglevel error -y \
  -i "${VISUAL}" -i "${AUDIO_FILE}" \
  -filter:a "loudnorm=I=-16:TP=-1.5:LRA=9,apad=pad_dur=1" \
  -t "${AUDIO_DURATION}" -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -metadata title="Selah / Before Send" \
  -metadata comment="Rendered by the truth-gated Selah editorial video pipeline" \
  -movflags +faststart "${OUTPUT}"

FINAL_DURATION="$("${FFPROBE}" -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "${OUTPUT}")"
RESOLUTION="$("${FFPROBE}" -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=s=x:p=0 "${OUTPUT}")"

if ! node -e "process.exit(Number(process.argv[1]) <= 180.01 ? 0 : 1)" "${FINAL_DURATION}"; then
  echo "Rendered video exceeds the 3-minute competition cap." >&2
  exit 1
fi
if [[ "${RESOLUTION}" != "1920x1080" ]]; then
  echo "Unexpected resolution: ${RESOLUTION}" >&2
  exit 1
fi

echo
echo "Rendered: ${OUTPUT}"
echo "Mode: ${MODE}"
echo "Narration profile: ${PROFILE}"
echo "Duration: ${FINAL_DURATION}s"
echo "Resolution: ${RESOLUTION}"
if [[ "${MODE}" == "preview" ]]; then
  echo "Truth status: marked previsualization; never upload this file."
fi
