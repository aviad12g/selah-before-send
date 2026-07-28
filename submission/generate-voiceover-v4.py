#!/usr/bin/env python3
"""Build the Selah v4 narration from conversationally paced Ava thought groups."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EDGE_TTS = Path("/private/tmp/selah-edge-tts/bin/edge-tts")
FFMPEG = Path("/opt/homebrew/bin/ffmpeg")
FFPROBE = Path("/opt/homebrew/bin/ffprobe")
VOICE = "en-US-AvaNeural"
OUTPUT_MP3 = ROOT / "video-voiceover-v4-human.mp3"
OUTPUT_SRT = ROOT / "video-voiceover-v4-human.srt"
OUTPUT_REPORT = ROOT / "video-voiceover-v4-report.json"


@dataclass(frozen=True)
class Beat:
    rate: str
    silence_after: float
    spoken: tuple[str, ...]
    displayed: tuple[str, ...]


# The rate changes are intentionally subtle. The emotional arc, not speed for its
# own sake, drives them: warm opening, faster conflict, a held intervention,
# measured proof and safety, then a slower close.
BEATS = (
    Beat(
        rate="+1%",
        silence_after=0.34,
        spoken=(
            "Hi.",
            "Mara writes, “I’m tired of you pretending this isn’t a choice. Stop calling it complicated.”",
        ),
        displayed=(
            "Hi.",
            "Mara writes, “I’m tired of you pretending this isn’t a choice. Stop calling it complicated.”",
        ),
    ),
    Beat(
        rate="+3%",
        silence_after=0.38,
        spoken=(
            "You fire back, “You have no idea what I was carrying.”",
            "Your cursor reaches Send.",
        ),
        displayed=(
            "You fire back, “You have no idea what I was carrying.”",
            "Your cursor reaches Send.",
        ),
    ),
    Beat(
        rate="-9%",
        silence_after=0.82,
        spoken=("Tap Pause.",),
        displayed=("Tap Pause.",),
    ),
    Beat(
        rate="+1%",
        silence_after=0.58,
        spoken=(
            "This is Say-lah Before Send—a private pause before that reply leaves your hands.",
            "First, Glue reads the heat—not who is right.",
            "Here it sees defensiveness, and a need to be understood.",
            "That selects a pre-approved theme.",
            "You Version returns the exact passage and its wider context.",
            "The model never chooses or invents Scripture.",
        ),
        displayed=(
            "This is Selah Before Send—a private pause before that reply leaves your hands.",
            "First, Gloo reads the heat—not who is right.",
            "Here it sees defensiveness, and a need to be understood.",
            "That selects a pre-approved theme.",
            "YouVersion returns the exact passage and its wider context.",
            "The model never chooses or invents Scripture.",
        ),
    ),
    Beat(
        rate="-2%",
        silence_after=0.58,
        spoken=(
            "Then Say-lah asks one private question.",
            "It never writes the reply, and it never posts for you.",
            "Edit in your own words.",
            "Wait ten minutes.",
            "Or send anyway.",
            "Your voice—and your choice—stay yours.",
        ),
        displayed=(
            "Then Selah asks one private question.",
            "It never writes the reply, and it never posts for you.",
            "Edit in your own words.",
            "Wait ten minutes.",
            "Or send anyway.",
            "Your voice—and your choice—stay yours.",
        ),
    ),
    Beat(
        rate="-5%",
        silence_after=0.30,
        spoken=(
            "And if the message is more than angry, Say-lah does not answer a crisis with a verse.",
        ),
        displayed=(
            "And if the message is more than angry, Selah does not answer a crisis with a verse.",
        ),
    ),
    Beat(
        rate="-9%",
        silence_after=0.55,
        spoken=(
            "It stops.",
        ),
        displayed=(
            "It stops.",
        ),
    ),
    Beat(
        rate="-5%",
        silence_after=0.76,
        spoken=(
            "No Scripture retrieval.",
            "No reflection.",
            "It points toward immediate human help.",
        ),
        displayed=(
            "No Scripture retrieval.",
            "No reflection.",
            "It points toward immediate human help.",
        ),
    ),
    Beat(
        rate="+3%",
        silence_after=0.62,
        spoken=(
            "Every step has a fixed structure, and if anything fails, the system stops safely.",
            "Glue classifies, You Version retrieves, and Glue reflects using only the returned text.",
        ),
        displayed=(
            "Every step has a fixed structure, and if anything fails, the system stops safely.",
            "Gloo classifies, YouVersion retrieves, and Gloo reflects using only the returned text.",
        ),
    ),
    Beat(
        rate="-5%",
        silence_after=0.00,
        spoken=(
            "Say-lah doesn’t ask technology to speak for you.",
            "It gives you one quiet moment to decide who you want to be—before your words leave your hands.",
        ),
        displayed=(
            "Selah doesn’t ask technology to speak for you.",
            "It gives you one quiet moment to decide who you want to be—before your words leave your hands.",
        ),
    ),
)


SRT_BLOCK_RE = re.compile(
    r"(?ms)^(\d+)\n"
    r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n"
    r"(.*?)(?=\n\n|\Z)"
)
WORD_RE = re.compile(r"[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*")


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    return result.stdout if capture else ""


def duration(path: Path) -> float:
    return float(
        run(
            [
                str(FFPROBE),
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture=True,
        ).strip()
    )


def parse_srt_time(value: str) -> float:
    hours, minutes, seconds = value.replace(",", ".").split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def format_srt_time(value: float) -> str:
    milliseconds = max(0, round(value * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def parse_word_cues(path: Path) -> list[tuple[float, float, str]]:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    cues: list[tuple[float, float, str]] = []
    for match in SRT_BLOCK_RE.finditer(text):
        cues.append(
            (
                parse_srt_time(match.group(2)),
                parse_srt_time(match.group(3)),
                " ".join(match.group(4).split()),
            )
        )
    if not cues:
        raise RuntimeError(f"No timing cues were generated in {path}")
    return cues


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


def map_captions(
    beat: Beat,
    word_cues: list[tuple[float, float, str]],
    beat_offset: float,
) -> list[tuple[float, float, str]]:
    if len(word_cues) == len(beat.displayed):
        captions: list[tuple[float, float, str]] = []
        for (raw_start, raw_end, _), displayed in zip(
            word_cues, beat.displayed
        ):
            start = beat_offset + raw_start
            if captions and start < captions[-1][1]:
                start = captions[-1][1] + 0.001
            captions.append(
                (
                    start,
                    max(start + 0.35, beat_offset + raw_end),
                    displayed,
                )
            )
        return captions

    expected_counts = [word_count(segment) for segment in beat.spoken]
    expected_total = sum(expected_counts)
    actual_total = len(word_cues)

    # Edge returns one WordBoundary event per spoken word. If tokenization ever
    # differs, proportional boundaries preserve monotonic, non-overlapping cues.
    boundaries = [0]
    cumulative = 0
    for count in expected_counts[:-1]:
        cumulative += count
        boundaries.append(round(cumulative / expected_total * actual_total))
    boundaries.append(actual_total)

    captions: list[tuple[float, float, str]] = []
    for index, displayed in enumerate(beat.displayed):
        start_index = min(boundaries[index], actual_total - 1)
        end_index = max(start_index, min(boundaries[index + 1] - 1, actual_total - 1))
        start = beat_offset + word_cues[start_index][0]
        end = beat_offset + word_cues[end_index][1]
        if captions and start < captions[-1][1]:
            start = captions[-1][1] + 0.001
        captions.append((start, max(start + 0.35, end), displayed))
    return captions


def measure_loudness(path: Path) -> dict[str, float]:
    output = subprocess.run(
        [
            str(FFMPEG),
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter_complex",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stderr
    loudness = re.findall(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", output)
    peaks = re.findall(r"Peak:\s+(-?\d+(?:\.\d+)?) dBFS", output)
    if not loudness or not peaks:
        raise RuntimeError("Unable to measure output loudness")
    return {
        "integrated_lufs": float(loudness[-1]),
        "true_peak_dbfs": float(peaks[-1]),
    }


def main() -> None:
    for tool in (EDGE_TTS, FFMPEG, FFPROBE):
        if not tool.exists():
            raise SystemExit(f"Required tool is missing: {tool}")

    with tempfile.TemporaryDirectory(prefix="selah-v4-") as temp_name:
        temp = Path(temp_name)
        audio_paths: list[Path] = []
        raw_srt_paths: list[Path] = []

        for index, beat in enumerate(BEATS, start=1):
            audio = temp / f"beat-{index:02d}.mp3"
            raw_srt = temp / f"beat-{index:02d}.srt"
            run(
                [
                    str(EDGE_TTS),
                    "--voice",
                    VOICE,
                    "--rate",
                    beat.rate,
                    "--text",
                    " ".join(beat.spoken),
                    "--write-media",
                    str(audio),
                    "--write-subtitles",
                    str(raw_srt),
                ]
            )
            audio_paths.append(audio)
            raw_srt_paths.append(raw_srt)

        filter_parts: list[str] = []
        concat_labels: list[str] = []
        for index, (audio, beat) in enumerate(zip(audio_paths, BEATS)):
            filter_parts.append(
                f"[{index}:a]aresample=48000,"
                "aformat=sample_fmts=fltp:channel_layouts=stereo"
                f"[voice{index}]"
            )
            concat_labels.append(f"[voice{index}]")
            if beat.silence_after:
                filter_parts.append(
                    "anullsrc=r=48000:cl=stereo,"
                    f"atrim=duration={beat.silence_after:.3f}[pause{index}]"
                )
                concat_labels.append(f"[pause{index}]")

        filter_parts.append(
            "".join(concat_labels)
            + f"concat=n={len(concat_labels)}:v=0:a=1,"
            + "loudnorm=I=-16:TP=-1.5:LRA=9[out]"
        )
        command = [str(FFMPEG), "-y", "-hide_banner"]
        for path in audio_paths:
            command.extend(["-i", str(path)])
        command.extend(
            [
                "-filter_complex",
                ";".join(filter_parts),
                "-map",
                "[out]",
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                str(OUTPUT_MP3),
            ]
        )
        run(command)

        captions: list[tuple[float, float, str]] = []
        offset = 0.0
        beat_durations: list[float] = []
        for audio, raw_srt, beat in zip(audio_paths, raw_srt_paths, BEATS):
            beat_duration = duration(audio)
            beat_durations.append(beat_duration)
            captions.extend(map_captions(beat, parse_word_cues(raw_srt), offset))
            offset += beat_duration + beat.silence_after

        srt_blocks = []
        for index, (start, end, text) in enumerate(captions, start=1):
            srt_blocks.append(
                f"{index}\n"
                f"{format_srt_time(start)} --> {format_srt_time(end)}\n"
                f"{text}\n"
            )
        OUTPUT_SRT.write_text("\n".join(srt_blocks), encoding="utf-8")

    output_duration = duration(OUTPUT_MP3)
    loudness = measure_loudness(OUTPUT_MP3)
    report = {
        "voice": VOICE,
        "duration_seconds": round(output_duration, 3),
        "integrated_lufs": loudness["integrated_lufs"],
        "true_peak_dbfs": loudness["true_peak_dbfs"],
        "thought_groups": len(BEATS),
        "synthesis_segments": len(BEATS),
        "rates": [beat.rate for beat in BEATS],
        "intentional_silence_seconds": round(
            sum(beat.silence_after for beat in BEATS), 3
        ),
        "caption_cues": len(captions),
    }
    OUTPUT_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if not 80.0 <= output_duration <= 92.0:
        raise SystemExit(
            f"Narration duration {output_duration:.3f}s is outside the 80–92s target"
        )
    if not -17.0 <= loudness["integrated_lufs"] <= -15.0:
        raise SystemExit(
            f"Narration loudness {loudness['integrated_lufs']:.1f} LUFS "
            "is outside the -16 ±1 LUFS target"
        )
    if loudness["true_peak_dbfs"] > -1.0:
        raise SystemExit(
            f"Narration true peak {loudness['true_peak_dbfs']:.1f} dBFS is too high"
        )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f"Command failed with exit code {error.returncode}", file=sys.stderr)
        raise
