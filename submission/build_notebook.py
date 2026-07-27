"""Build and execute the public Selah architecture-and-safety audit notebook."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook, new_output


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "selah-before-send-audit.ipynb"


cells = [
    new_markdown_cell(
        """# Selah Before Send — Architecture & Safety Audit

## tl;dr

This companion notebook tests the deterministic controls around the Selah
prototype: its five-theme passage allowlist, bounded Gloo JSON contracts,
high-risk-language stop, and pinned offline Scripture fixture.

It **does not** claim that the credentialed Gloo → YouVersion → Gloo path ran.
That live integration remains a separate deployment validation gate."""
    ),
    new_markdown_cell(
        """## Context & Methods

Selah is an opt-in pause inside a simulated social reply composer. A live
request first asks Gloo for a bounded assessment, retrieves an allowlisted
passage and wider context from YouVersion, then asks Gloo for a reflection
grounded in that supplied text.

### Key assumptions

- This notebook mirrors the server's deterministic contracts at submission
  time; the TypeScript route remains the implementation source of truth.
- The offline fixture is a reviewer aid, not evidence of a live API response.
- Passing these checks establishes contract behavior, not pastoral safety,
  user impact, or model robustness against every adversarial input."""
    ),
    new_markdown_cell("## Data\n\n### 1. Pin the passage allowlist and fixture provenance"),
    new_code_cell(
        """from hashlib import sha256

PASSAGES = {
    "listen": ("JAS.1.19-20", "JAS.1.19-25"),
    "gentleness": ("PRO.15.1", "PRO.15.1-4"),
    "repair": ("EPH.4.29", "EPH.4.29-32"),
    "judgment": ("MAT.7.3-5", "MAT.7.1-5"),
    "burden": ("GAL.6.2", "GAL.6.1-5"),
}

FIXTURE_TEXT = (
    "My beloved brothers, understand this: Everyone should be quick to listen, "
    "slow to speak, and slow to anger, for man’s anger does not bring about "
    "the righteousness that God desires."
)
FIXTURE_CONTEXT = (
    "My beloved brothers, understand this: Everyone should be quick to listen, "
    "slow to speak, and slow to anger, for man’s anger does not bring about the "
    "righteousness that God desires. Therefore, get rid of all moral filth and "
    "every expression of evil, and humbly accept the word planted in you, which "
    "can save your souls. Be doers of the word, and not hearers only. Otherwise, "
    "you are deceiving yourselves. For anyone who hears the word but does not "
    "carry it out is like a man who looks at his face in a mirror, and after "
    "observing himself goes away and immediately forgets what he looks like. "
    "But the one who looks intently into the perfect law of freedom, and "
    "continues to do so—not being a forgetful hearer, but an effective doer—he "
    "will be blessed in what he does."
)

fixture_sha256 = sha256(FIXTURE_CONTEXT.encode("utf-8")).hexdigest()
assert len(PASSAGES) == 5
assert len({focus for focus, _ in PASSAGES.values()}) == 5
assert PASSAGES["listen"] == ("JAS.1.19-20", "JAS.1.19-25")

print({
    "themes": len(PASSAGES),
    "focus_passages": len({focus for focus, _ in PASSAGES.values()}),
    "fixture_reference": "James 1:19–25",
    "fixture_version": "BSB",
    "fixture_sha256": fixture_sha256,
})"""
    ),
    new_markdown_cell("## Results\n\n### 2. Exercise the bounded assessment contract"),
    new_code_cell(
        """ALLOWED_TEMPERATURES = {"Low heat", "Rising heat", "High heat"}

def word_count(value):
    return len(value.strip().split())

def valid_assessment(value):
    if not isinstance(value, dict):
        return False
    need = value.get("underlyingNeed")
    return (
        value.get("theme") in PASSAGES
        and value.get("temperature") in ALLOWED_TEMPERATURES
        and isinstance(need, str)
        and need.strip().startswith("To ")
        and 0 < word_count(need) <= 10
        and len(need.strip()) <= 72
    )

assessment_cases = [
    ("valid", {
        "theme": "listen",
        "temperature": "High heat",
        "underlyingNeed": "To be understood before being judged",
    }, True),
    ("unknown theme", {
        "theme": "retaliation",
        "temperature": "High heat",
        "underlyingNeed": "To be heard",
    }, False),
    ("empty need", {
        "theme": "listen",
        "temperature": "High heat",
        "underlyingNeed": "",
    }, False),
    ("wrong prefix", {
        "theme": "listen",
        "temperature": "High heat",
        "underlyingNeed": "Wants to be heard",
    }, False),
    ("too many words", {
        "theme": "listen",
        "temperature": "High heat",
        "underlyingNeed": "To be seen and heard and understood without any judgment at all",
    }, False),
]

assessment_results = [
    (name, valid_assessment(value), expected)
    for name, value, expected in assessment_cases
]
assert all(observed == expected for _, observed, expected in assessment_results)
print(assessment_results)"""
    ),
    new_markdown_cell("### 3. Exercise the bounded reflection contract"),
    new_code_cell(
        """def valid_reflection(value):
    if not isinstance(value, dict):
        return False
    question = value.get("question")
    edit_prompt = value.get("editPrompt")
    moves = value.get("threeMoves")
    if not isinstance(question, str) or not question.strip():
        return False
    if not isinstance(edit_prompt, str) or not edit_prompt.strip():
        return False
    if word_count(question) > 24 or len(question.strip()) > 160:
        return False
    if word_count(edit_prompt) > 34 or len(edit_prompt.strip()) > 220:
        return False
    if not isinstance(moves, list) or len(moves) != 3:
        return False
    return all(
        isinstance(move, str)
        and bool(move.strip())
        and word_count(move) <= 7
        and len(move.strip()) <= 52
        for move in moves
    )

valid_fixture = {
    "question": "Can you make room for what hurt them before you explain what hurt you?",
    "editPrompt": (
        "Keep your point. Change the order: show what you heard, name what was "
        "missing, then make one clear request."
    ),
    "threeMoves": [
        "Name what you heard",
        "Say what they could not see",
        "Ask for one next step",
    ],
}

reflection_cases = [
    ("valid", valid_fixture, True),
    ("empty question", {**valid_fixture, "question": ""}, False),
    ("wrong move type", {**valid_fixture, "threeMoves": ["Listen", 3, "Ask"]}, False),
    ("too many moves", {**valid_fixture, "threeMoves": ["A", "B", "C", "D"]}, False),
    ("oversized move", {
        **valid_fixture,
        "threeMoves": ["Use far too many words in this editing move", "B", "C"],
    }, False),
]

reflection_results = [
    (name, valid_reflection(value), expected)
    for name, value, expected in reflection_cases
]
assert all(observed == expected for _, observed, expected in reflection_results)
print(reflection_results)"""
    ),
    new_markdown_cell("### 4. Verify the deterministic high-risk stop"),
    new_code_cell(
        """import re
import unicodedata

PASSIVE_IDEATION = [
    re.compile(r"\\b(?:i\\s+)?(?:do not|don't)\\s+want\\s+to\\s+be\\s+(?:here|alive)\\s+anymore\\b"),
    re.compile(r"\\b(?:nobody|no one)\\s+would\\s+miss\\s+me\\b"),
    re.compile(r"\\b(?:my family|everyone|you|they)\\s+would\\s+be\\s+better\\s+off\\s+without\\s+me\\b"),
    re.compile(r"\\bi\\s+can(?:not|'t)\\s+keep\\s+living(?:\\s+like\\s+this)?\\b"),
    re.compile(r"\\bthere(?:'s| is)\\s+no\\s+(?:reason|point)\\s+(?:for\\s+me\\s+)?to\\s+live\\b"),
    re.compile(r"\\bi\\s+(?:will not|won't)\\s+be\\s+around\\s+(?:tomorrow|much longer)\\b"),
    re.compile(r"\\bi\\s+(?:want|plan|intend)\\s+to\\s+(?:die|kill myself|end my life)\\b"),
    re.compile(r"\\bi\\s+wish\\s+i\\s+(?:were|was)\\s+dead\\b"),
    re.compile(r"\\bi\\s+(?:do not|don't)\\s+want\\s+to\\s+wake\\s+up\\b"),
    re.compile(r"\\bi(?:'m| am| feel)\\s+suicidal\\b"),
]

INTENT = r"(?:i(?:'m| am) going to|i(?:'ll| will)|we(?:'re| are) going to|we(?:'ll| will))"
EXPLICIT_THREATS = [
    re.compile(rf"\\b{INTENT}\\s+(?:kill|shoot|stab|hurt|end)\\s+(?:you|them|him|her|myself|ourselves)\\b"),
    re.compile(rf"\\b{INTENT}\\s+burn\\s+(?:your|their|his|her)\\s+(?:house|home|church)\\s+down\\b"),
    re.compile(rf"\\b{INTENT}\\s+(?:make\\s+you\\s+pay|come\\s+for\\s+you)\\b"),
    re.compile(r"\\b(?:go\\s+)?kill\\s+yourself\\b"),
    re.compile(r"\\bwatch\\s+your\\s+back\\b"),
]
BENIGN_COMMUNICATION = re.compile(
    rf"\\b{INTENT}\\s+shoot\\s+you\\s+(?:an?\\s+)?(?:email|message|text|note|invite|link)\\b"
)
REPORTED_THREAT = re.compile(
    r"\\b(?:he|she|they|someone)\\s+said\\s+(?:he|she|they)\\s+would\\s+"
    r"(?:kill|shoot|stab|hurt)\\s+(?:me|us|you|him|her|them)\\b"
)
BENIGN_LOCATION = re.compile(
    r"\\b(?:i|we)\\s+know\\s+where\\s+you\\s+live\\s+because\\s+you\\s+"
    r"(?:sent|gave|shared)\\s+(?:me|us)\\s+(?:the|your)\\s+address\\b"
)
LOCATION_THREAT = re.compile(r"\\b(?:i|we)\\s+know\\s+where\\s+you\\s+live\\b")
PERSONAL_ABUSE = [
    re.compile(r"\\bi\\s+(?:was|am|have been)\\s+(?:abused|stalked)\\b"),
    re.compile(
        r"\\b(?:my\\s+[^\\W\\d_'-]+|he|she|they|someone|somebody)\\s+"
        r"(?:(?:is|was|has been)\\s+)?(?:abusing|stalking|abused|stalked)\\s+me\\b"
    ),
    re.compile(r"\\byou(?:'re| are| were| have been)?\\s*(?:abusing|stalking|abused|stalked)\\s+me\\b"),
    re.compile(r"\\b(?:my|your)\\s+(?:abuser|stalker)\\b"),
    re.compile(r"\\bi\\s+(?:was|am|have been)\\s+(?:raped|sexually assaulted)\\b"),
    re.compile(r"\\b(?:you|he|she|they|someone)\\s+(?:raped|sexually assaulted)\\s+me\\b"),
    re.compile(r"\\bimmediate danger\\b"),
]

def looks_high_risk(value):
    text = unicodedata.normalize("NFKC", value).replace("‘", "'").replace("’", "'").lower()
    passive = any(pattern.search(text) for pattern in PASSIVE_IDEATION)
    explicit = (
        not BENIGN_COMMUNICATION.search(text)
        and any(pattern.search(text) for pattern in EXPLICIT_THREATS)
    )
    reported = bool(REPORTED_THREAT.search(text))
    location = bool(LOCATION_THREAT.search(text) and not BENIGN_LOCATION.search(text))
    personal = any(pattern.search(text) for pattern in PERSONAL_ABUSE)
    return passive or explicit or reported or location or personal

risk_cases = [
    ("ordinary conflict", "You never listen to what I said.", False),
    ("institutional abuse", "The church covered up decades of abuse and you know it.", False),
    ("abuse of power", "This is a clear abuse of power by the elders.", False),
    ("substance abuse", "My brother is in recovery from substance abuse.", False),
    ("reported institutional abuse", "The report says children are being abused by leaders.", False),
    ("study of abuse", "Studies show patients have been abused in institutions.", False),
    ("argument idiom", "I can't go on arguing in circles.", False),
    ("die-on-hill idiom", "I don't want to die on this hill.", False),
    ("email idiom", "I'll shoot you an email with the details.", False),
    ("negated payment idiom", "I won't make you pay for this; it's on me.", False),
    ("shared address", "I know where you live because you sent me the address.", False),
    ("effort idiom", "Don't hurt yourself trying to fix this tonight.", False),
    ("direct threat", "I am going to hurt you tonight.", True),
    ("passive ideation", "I don't want to be here anymore.", True),
    ("curly apostrophe ideation", "I don’t want to be alive anymore.", True),
    ("absence ideation", "Nobody would miss me if I was gone.", True),
    ("family burden ideation", "My family would be better off without me.", True),
    ("continued-living ideation", "I can't keep living like this.", True),
    ("no-reason ideation", "There is no reason for me to live.", True),
    ("future-absence ideation", "I won't be around tomorrow.", True),
    ("implied threat", "I'm going to end you.", True),
    ("location threat", "I know where you live.", True),
    ("plural location threat", "We know where you live.", True),
    ("property threat", "I will burn your house down.", True),
    ("reported threat", "He said he would kill me.", True),
    ("named abuser", "My abuser keeps following me.", True),
    ("direct stalking", "You stalked me for weeks.", True),
    ("past abuse", "I was abused for years.", True),
    ("personal abuse", "My pastor abused me.", True),
    ("ongoing abuse", "He is abusing me.", True),
    ("ongoing stalking", "My ex is stalking me.", True),
    ("second-person stalking", "You're stalking me.", True),
    ("explicit self-harm", "I want to kill myself.", True),
]
risk_results = [
    (name, looks_high_risk(text), expected)
    for name, text, expected in risk_cases
]
assert all(observed == expected for _, observed, expected in risk_results)
print(risk_results)"""
    ),
    new_markdown_cell("### 5. Reconcile the executed checks"),
    new_code_cell(
        """summary = {
    "passage_allowlist_checks": 3,
    "assessment_contract_cases": len(assessment_results),
    "reflection_contract_cases": len(reflection_results),
    "risk_gate_cases": len(risk_results),
    "total_declared_checks": (
        3 + len(assessment_results) + len(reflection_results) + len(risk_results)
    ),
    "failed_assertions": 0,
    "live_api_calls": 0,
}
print(summary)
assert summary["failed_assertions"] == 0
assert summary["total_declared_checks"] == 46
assert summary["live_api_calls"] == 0"""
    ),
    new_markdown_cell(
        """## Takeaways

- The executed notebook passed all 46 deterministic checks/cases represented
  in the summary above.
- Five themes map to five explicit focus passages plus wider context ranges; no
  model chooses or writes displayed Scripture.
- Invalid but schema-shaped assessment/reflection examples are rejected by the
  mirrored bounds.
- High-risk phrases stop before the ordinary reflection path.
- The exact offline BSB context fixture is pinned by SHA-256 and must remain
  visibly labeled as an offline preview.

### Remaining validation gap

No external credential is embedded here, and this notebook makes zero live API
calls. Before the entry claims a live integration, the deployed server must
return `source: "live"` in a redacted end-to-end run and show the retrieved
reference, context, version, copyright, latency, and provider provenance."""
    ),
]


notebook = new_notebook(
    cells=cells,
    metadata={
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {
            "name": "python",
            "version": ".".join(map(str, sys.version_info[:3])),
        },
        "selah": {
            "execution_engine": "CPython top-to-bottom via submission/build_notebook.py",
            "scope": "deterministic controls only; zero external API calls",
        },
    },
)

namespace: dict[str, object] = {}
execution_count = 0
for cell in notebook.cells:
    if cell.cell_type != "code":
        continue
    execution_count += 1
    stream = io.StringIO()
    with contextlib.redirect_stdout(stream):
        exec(compile(cell.source, f"<cell {execution_count}>", "exec"), namespace)
    output = stream.getvalue()
    cell.execution_count = execution_count
    cell.outputs = [new_output("stream", name="stdout", text=output)] if output else []

nbformat.validate(notebook)
nbformat.write(notebook, OUTPUT)
print(f"Wrote and executed {OUTPUT} ({execution_count} code cells)")
