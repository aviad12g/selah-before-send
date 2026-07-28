#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");
const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile = profileArg?.split("=")[1] ?? "v4";
const previewStillArg = process.argv.find((arg) =>
  arg.startsWith("--preview-still="),
);
const previewStillPath =
  previewStillArg?.slice("--preview-still=".length) ??
  process.env.PREVIEW_STILL ??
  "/private/tmp/selah-demo-current.jpg";
const totalDuration =
  profile === "v4"
    ? 86.458
    : profile === "v3"
      ? 82.608
      : profile === "human"
        ? 83.928
        : 90.766542;

const W = 1920;
const H = 1080;
const black = "#0d0f0d";
const blackSoft = "#141714";
const paper = "#f0ece1";
const acid = "#d8ff61";
const ember = "#ff7350";
const muted = "#aaa89f";
const sans =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";
const serif =
  "'Iowan Old Style', Baskerville, Georgia, 'Times New Roman', serif";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svg(body, extra = "") {
  return Buffer.from(`
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="captionBand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${black}" stop-opacity=".94"/>
          <stop offset=".72" stop-color="${black}" stop-opacity=".84"/>
          <stop offset="1" stop-color="${black}" stop-opacity="0"/>
        </linearGradient>
        <clipPath id="productClip">
          <rect x="548" y="70" width="1296" height="872"/>
        </clipPath>
      </defs>
      ${extra}
      ${body}
    </svg>
  `);
}

function wrapLines(lines, x, y, lineHeight, attrs = "") {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${esc(line)}</text>`,
    )
    .join("\n");
}

function fallbackProductStill() {
  return `
    <g clip-path="url(#productClip)">
      <rect x="548" y="70" width="648" height="872" fill="#f3f2ed"/>
      <rect x="1196" y="70" width="648" height="872" fill="${blackSoft}"/>
      <text x="620" y="170" fill="#777871" font-family="${sans}" font-size="18"
        font-weight="700" letter-spacing="1.4">CONVERSATION</text>
      <text x="620" y="250" fill="${black}" font-family="${serif}" font-size="48">
        I’m tired of you pretending
      </text>
      <text x="620" y="310" fill="${black}" font-family="${serif}" font-size="48">
        this isn’t a choice.
      </text>
      <text x="620" y="370" fill="${black}" font-family="${serif}" font-size="48">
        Stop calling it complicated.
      </text>
      <line x1="620" y1="382" x2="1118" y2="382" stroke="#d5d3cb"/>
      <text x="1248" y="162" fill="${acid}" font-family="${sans}" font-size="16"
        font-weight="800" letter-spacing="2">A PRIVATE PAUSE</text>
      <rect x="1248" y="220" width="508" height="330" fill="${paper}"/>
      <rect x="1248" y="220" width="5" height="330" fill="${acid}"/>
      <text x="1290" y="300" fill="${black}" font-family="${serif}" font-size="42">
        “Quick to listen,
      </text>
      <text x="1290" y="355" fill="${black}" font-family="${serif}" font-size="42">
        slow to speak,
      </text>
      <text x="1290" y="410" fill="${black}" font-family="${serif}" font-size="42">
        slow to anger.”
      </text>
      <text x="1248" y="635" fill="${ember}" font-family="${sans}" font-size="15"
        font-weight="800" letter-spacing="2">ONE PRIVATE QUESTION</text>
      <text x="1248" y="702" fill="${paper}" font-family="${serif}" font-size="42">
        What do you want
      </text>
      <text x="1248" y="754" fill="${paper}" font-family="${serif}" font-size="42">
        them to understand?
      </text>
      <rect x="1248" y="818" width="508" height="66" fill="${acid}"/>
      <text x="1278" y="859" fill="${black}" font-family="${sans}" font-size="16"
        font-weight="850" letter-spacing="1.2">EDIT IN MY OWN WORDS</text>
    </g>
  `;
}

function placeholderFrame(item, productStillUri) {
  const timelineX = 104;
  const timelineWidth = 1712;
  const start = item.start / totalDuration;
  const end = item.end / totalDuration;
  const x1 = timelineX + timelineWidth * start;
  const x2 = timelineX + timelineWidth * end;
  const number = String(item.index).padStart(2, "0");
  const product =
    productStillUri === null
      ? fallbackProductStill()
      : `<image href="${productStillUri}" x="548" y="70" width="1296" height="872"
           preserveAspectRatio="xMidYMid slice" clip-path="url(#productClip)"/>`;
  return svg(`
    <rect width="${W}" height="${H}" fill="${black}"/>
    <rect x="0" y="0" width="516" height="${H}" fill="#090a08"/>
    <line x1="516" y1="70" x2="516" y2="942" stroke="#35372f"/>

    <text x="72" y="102" fill="${muted}" font-family="${sans}"
      font-size="15" font-weight="750" letter-spacing="2.4">SELAH / BEFORE SEND</text>
    <text x="72" y="205" fill="${acid}" font-family="${serif}"
      font-size="118" font-weight="400">${number}</text>
    <text x="72" y="254" fill="${muted}" font-family="${sans}"
      font-size="14" font-weight="800" letter-spacing="2.3">RECORDING NOTE</text>
    ${wrapLines(item.title, 72, 338, 64,
      `fill="${paper}" font-family="${serif}" font-size="54" font-weight="400"`)}
    <line x1="72" y1="510" x2="446" y2="510" stroke="#3a3c34"/>
    ${wrapLines(item.instructions, 72, 570, 36,
      `fill="#c6c2b8" font-family="${sans}" font-size="22" font-weight="430"`)}

    ${product}
    <rect x="548" y="70" width="1296" height="872" fill="none"
      stroke="#4a4b45" stroke-width="2"/>
    <rect x="548" y="70" width="1296" height="50" fill="${black}" fill-opacity=".94"/>
    <text x="574" y="102" fill="${ember}" font-family="${sans}"
      font-size="14" font-weight="850" letter-spacing="2">
      OFFLINE REFERENCE · NOT LIVE EVIDENCE
    </text>
    <text x="1818" y="102" text-anchor="end" fill="${muted}" font-family="${sans}"
      font-size="14">Replace with the verified recording before final render.</text>

    <rect x="${timelineX}" y="1000" width="${timelineWidth}" height="2"
      fill="#373930"/>
    <rect x="${x1.toFixed(2)}" y="996" width="${(x2 - x1).toFixed(2)}" height="10"
      fill="${acid}"/>
    <text x="104" y="1042" fill="#74766e" font-family="${sans}" font-size="14"
      letter-spacing="1.4">PREVISUALIZATION</text>
    <text x="1816" y="1042" text-anchor="end" fill="#74766e"
      font-family="${sans}" font-size="14">${item.start.toFixed(1)}–${item.end.toFixed(1)} SEC</text>
  `);
}

function captionFrame(lines) {
  const lineHeight = 38;
  const textY = lines.length === 1 ? 1021 : 995;
  return svg(`
    <rect x="0" y="942" width="1500" height="138" fill="url(#captionBand)"/>
    <rect x="72" y="976" width="4" height="55" fill="${acid}"/>
    ${wrapLines(lines, 108, textY, lineHeight,
      `fill="${paper}" font-family="${sans}" font-size="29" font-weight="560"`)}
  `);
}

function chapterFrame(index, label) {
  const number = String(index).padStart(2, "0");
  return svg(`
    <rect x="0" y="0" width="650" height="128" fill="${black}" fill-opacity=".76"/>
    <text x="72" y="78" fill="${acid}" font-family="${sans}" font-size="17"
      font-weight="850" letter-spacing="2.3">${number}</text>
    <line x1="111" y1="70" x2="146" y2="70" stroke="${muted}"/>
    <text x="166" y="78" fill="${paper}" font-family="${sans}" font-size="17"
      font-weight="760" letter-spacing="2.3">${esc(label)}</text>
  `);
}

function proofFrame(kind) {
  const live = kind === "live";
  const label = live ? "VERIFIED LIVE" : "VERIFIED SAFETY STOP";
  const detail = live
    ? "Gloo → YouVersion → Gloo"
    : "0 retrieval · 0 reflection";
  const accent = live ? acid : "#ffb020";
  return svg(`
    <g transform="translate(1330 62)">
      <rect width="510" height="94" fill="${black}" fill-opacity=".90"/>
      <rect width="5" height="94" fill="${accent}"/>
      <text x="31" y="37" fill="${accent}" font-family="${sans}" font-size="15"
        font-weight="850" letter-spacing="2">${label}</text>
      <text x="31" y="70" fill="${paper}" font-family="${sans}" font-size="22"
        font-weight="540">${detail}</text>
    </g>
  `);
}

function architectureFrame() {
  return svg(`
    <rect width="${W}" height="${H}" fill="${black}" fill-opacity=".98"/>
    <text x="112" y="124" fill="${acid}" font-family="${sans}" font-size="16"
      font-weight="850" letter-spacing="2.6">THE BOUNDED PATH</text>
    <text x="112" y="244" fill="${paper}" font-family="${serif}" font-size="68"
      font-weight="400">Three stages. Clear boundaries.</text>
    <line x1="112" y1="322" x2="1808" y2="322" stroke="#42443c"/>

    <text x="112" y="462" fill="${paper}" font-family="${sans}" font-size="52"
      font-weight="740">GLOO</text>
    <text x="514" y="462" fill="${acid}" font-family="${serif}" font-size="58">→</text>
    <text x="704" y="462" fill="${paper}" font-family="${sans}" font-size="52"
      font-weight="740">YOUVERSION</text>
    <text x="1304" y="462" fill="${acid}" font-family="${serif}" font-size="58">→</text>
    <text x="1506" y="462" fill="${paper}" font-family="${sans}" font-size="52"
      font-weight="740">GLOO</text>

    <text x="112" y="530" fill="${muted}" font-family="${sans}" font-size="22">
      reads the heat
    </text>
    <text x="704" y="530" fill="${muted}" font-family="${sans}" font-size="22">
      returns exact Scripture
    </text>
    <text x="1506" y="530" fill="${muted}" font-family="${sans}" font-size="22">
      reflects on returned text
    </text>

    <line x1="112" y1="652" x2="1808" y2="652" stroke="#42443c"/>
    <text x="112" y="735" fill="${ember}" font-family="${sans}" font-size="16"
      font-weight="850" letter-spacing="2.3">NEVER</text>
    <text x="112" y="797" fill="${paper}" font-family="${serif}" font-size="43">
      No model chooses a verse. No model writes Scripture.
    </text>
    <text x="1808" y="927" text-anchor="end" fill="${muted}"
      font-family="${sans}" font-size="18">Fixed schema · allowlisted themes · fail-closed</text>
  `);
}

function previewWatermark() {
  return svg(`
    <rect width="${W}" height="7" fill="${ember}"/>
    <rect x="1476" y="26" width="368" height="38" fill="${black}" fill-opacity=".92"/>
    <text x="1820" y="51" text-anchor="end" fill="${ember}"
      font-family="${sans}" font-size="13" font-weight="850" letter-spacing="1.8">
      PREVIEW · NOT FOR SUBMISSION
    </text>
  `);
}

function introTitleFrame() {
  return svg(`
    <rect width="${W}" height="${H}" fill="${black}"/>
    <text x="112" y="126" fill="${muted}" font-family="${sans}" font-size="16"
      font-weight="800" letter-spacing="2.7">SELAH / BEFORE SEND</text>
    <line x1="112" y1="174" x2="1808" y2="174" stroke="#40423a"/>
    <text x="112" y="487" fill="${paper}" font-family="${serif}" font-size="132"
      font-weight="400" letter-spacing="-4">A private pause,</text>
    <text x="112" y="626" fill="${paper}" font-family="${serif}" font-size="132"
      font-weight="400" letter-spacing="-4">before it leaves.</text>
    <rect x="112" y="716" width="144" height="8" fill="${acid}"/>
    <text x="112" y="817" fill="${muted}" font-family="${sans}" font-size="28"
      font-weight="430">One quiet moment before a message leaves your hands.</text>
  `);
}

function introHelloFrame() {
  return svg(`
    <rect width="${W}" height="${H}" fill="${paper}"/>
    <line x1="112" y1="118" x2="1808" y2="118" stroke="#c8c5bb"/>
    <text x="112" y="82" fill="#6f716b" font-family="${sans}" font-size="15"
      font-weight="800" letter-spacing="2.5">SELAH / BEFORE SEND</text>
    <text x="960" y="542" text-anchor="middle" fill="${black}" font-family="${serif}"
      font-size="82" font-weight="400" letter-spacing="-2">Hi.</text>
    <text x="960" y="598" text-anchor="middle" fill="#6f716b" font-family="${sans}"
      font-size="18" font-weight="650" letter-spacing="1.8">A PRIVATE PAUSE</text>
    <rect x="912" y="646" width="96" height="5" fill="${acid}"/>
  `);
}

function openingConversationFrame(stage) {
  const hasReply = stage !== "message";
  const hasPause = stage === "pause";
  const replyCopy = hasReply
    ? `
      <text x="202" y="676" fill="${black}" font-family="${sans}" font-size="43"
        font-weight="520">You have no idea what I was carrying.</text>
      <rect x="202" y="712" width="3" height="50" fill="${black}" opacity=".72"/>
    `
    : `
      <text x="202" y="697" fill="#8b8d87" font-family="${sans}" font-size="39"
        font-weight="450">Write your reply…</text>
    `;
  const pauseFill = hasPause ? acid : blackSoft;
  const pauseText = hasPause ? black : paper;
  const sendFill = hasPause ? "#dad6ca" : ember;
  const sendText = hasPause ? "#656761" : black;
  const pauseNote = hasPause
    ? `
      <circle cx="1122" cy="910" r="24" fill="${paper}" stroke="${black}"
        stroke-width="2"/>
      <path d="M1114 900 L1133 910 L1114 920 Z" fill="${black}"/>
    `
    : "";

  return svg(`
    <rect width="${W}" height="${H}" fill="${paper}"/>
    <rect x="0" y="0" width="${W}" height="118" fill="${black}"/>
    <text x="112" y="75" fill="${paper}" font-family="${sans}" font-size="16"
      font-weight="800" letter-spacing="2.5">SELAH / BEFORE SEND</text>
    <text x="1808" y="75" text-anchor="end" fill="${muted}" font-family="${sans}"
      font-size="14" font-weight="760" letter-spacing="1.8">PRIVATE COMPOSER</text>

    <text x="112" y="177" fill="#73756f" font-family="${sans}" font-size="14"
      font-weight="850" letter-spacing="2.3">MARA · 2 MIN AGO</text>
    <text x="1808" y="177" text-anchor="end" fill="#73756f" font-family="${sans}"
      font-size="14" font-weight="760" letter-spacing="1.5">
      OFFLINE REFERENCE · LIVE CAPTURE REQUIRED
    </text>

    <rect x="112" y="210" width="1696" height="286" rx="2" fill="${black}"/>
    <rect x="112" y="210" width="8" height="286" fill="${acid}"/>
    <text x="170" y="302" fill="${paper}" font-family="${serif}" font-size="56"
      font-weight="400" letter-spacing="-1.1">“I’m tired of you pretending</text>
    <text x="170" y="374" fill="${paper}" font-family="${serif}" font-size="56"
      font-weight="400" letter-spacing="-1.1">this isn’t a choice.</text>
    <text x="170" y="446" fill="${paper}" font-family="${serif}" font-size="56"
      font-weight="400" letter-spacing="-1.1">Stop calling it complicated.”</text>

    <text x="112" y="571" fill="#73756f" font-family="${sans}" font-size="14"
      font-weight="850" letter-spacing="2.3">YOUR REPLY</text>
    <rect x="112" y="603" width="1696" height="184" rx="2" fill="#fffdf7"
      stroke="#bbb9b0" stroke-width="2"/>
    ${replyCopy}

    <line x1="112" y1="838" x2="1808" y2="838" stroke="#c8c5bb"/>
    <rect x="1078" y="872" width="450" height="76" rx="2" fill="${pauseFill}"/>
    <text x="1303" y="920" text-anchor="middle" fill="${pauseText}"
      font-family="${sans}" font-size="16" font-weight="850"
      letter-spacing="1.6">PAUSE BEFORE SENDING</text>
    <rect x="1550" y="872" width="258" height="76" rx="2" fill="${sendFill}"/>
    <text x="1679" y="920" text-anchor="middle" fill="${sendText}"
      font-family="${sans}" font-size="16" font-weight="850"
      letter-spacing="1.6">SEND NOW</text>
    ${pauseNote}
  `);
}

async function write(name, data) {
  await sharp(data).png().toFile(path.join(assets, name));
}

const placeholders = [
  {
    index: 1,
    start: 0,
    end: 7.5,
    title: ["The reply", "you regret"],
    instructions: [
      "Type the tense reply in real time.",
      "Hold the cursor over Send now for one beat.",
    ],
  },
  {
    index: 2,
    start: 7.5,
    end: 18,
    title: ["Put the pause", "inside the argument"],
    instructions: [
      "Pull back to reveal the product.",
      "Click Pause before sending; keep the cursor visible.",
    ],
  },
  {
    index: 3,
    start: 18,
    end: 44,
    title: ["Prove the", "real path"],
    instructions: [
      "Show source: live, passage provenance, version and copyright.",
      "Open Read passage context in the actual product.",
    ],
  },
  {
    index: 4,
    start: 44,
    end: 60,
    title: ["Keep agency", "human"],
    instructions: [
      "Show Edit in my own words and the editing moves.",
      "Start Pause 10 minutes; frame Send anyway without clicking.",
    ],
  },
  {
    index: 5,
    start: 60,
    end: 74,
    title: ["Stop before", "retrieval"],
    instructions: [
      "Use only the approved passive-ideation safety phrase.",
      "Show the stop and Find A Helpline link—no private logs on screen.",
    ],
  },
  {
    index: 6,
    start: 74,
    end: 85,
    title: ["Make the", "bounds visible"],
    instructions: [
      "Keep the real product visible behind the architecture overlay.",
      "Do not show credentials, tokens or raw provider payloads.",
    ],
  },
  {
    index: 7,
    start: 85,
    end: 87,
    title: ["Return to", "the choice"],
    instructions: [
      "Return to the original composer.",
      "Land the cursor beside Pause before sending.",
    ],
  },
];

const profileRanges =
  profile === "v4"
    ? [
        [0, 12.436],
        [12.436, 15.032],
        [15.032, 36.564],
        [36.564, 51.016],
        [51.016, 66.45],
        [66.45, 78.014],
        [78.014, 81.119],
      ]
    : profile === "v3"
    ? [
        [0, 16.104],
        [16.104, 19.294],
        [19.294, 35.583],
        [35.583, 49.594],
        [49.594, 62.523],
        [62.523, 74.164],
        [74.164, 77.185],
      ]
    : profile === "human"
    ? [
        [0, 10.325],
        [10.325, 20.703],
        [20.703, 40.091],
        [40.091, 51.25],
        [51.25, 63.867],
        [63.867, 75.195],
        [75.195, 78.151],
      ]
    : [
        [0, 7.5],
        [7.5, 18],
        [18, 44],
        [44, 60],
        [60, 74],
        [74, 85],
        [85, 87],
      ];

for (const [index, item] of placeholders.entries()) {
  [item.start, item.end] = profileRanges[index];
}

if (profile === "v4" || profile === "v3") {
  placeholders[0].title = ["The moment", "it was built for"];
  placeholders[0].instructions = [
    "Open on the product while the short introduction lands.",
    "Show the friend's message, type the reply, then hold on Send.",
  ];
  placeholders[1].title = ["One click", "before Send"];
  placeholders[1].instructions = [
    "Keep the cursor visible as it reaches Send.",
    "Click Pause before sending on the spoken word “Pause.”",
  ];
}

let productStillUri = null;
if (fs.existsSync(previewStillPath)) {
  const extension = path.extname(previewStillPath).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
  productStillUri = `data:${mime};base64,${fs
    .readFileSync(previewStillPath)
    .toString("base64")}`;
}

for (const item of placeholders) {
  await write(
    `placeholder-${String(item.index).padStart(2, "0")}.png`,
    placeholderFrame(item, productStillUri),
  );
}

const captions =
  profile === "v4" || profile === "v3"
    ? [
        ["Tap Pause."],
        ["Gloo reads the heat—not who is right."],
        ["YouVersion returns exact Scripture."],
        ["The model never chooses a verse."],
        ["Edit · Wait · Send anyway"],
        ["A crisis stops here."],
        ["No retrieval · No reflection · Human help"],
        ["One quiet moment before your words leave your hands."],
      ]
    : profile === "human"
    ? [
        ["Your thumb reaches Send."],
        ["This is the second Selah is built for."],
        ["Gloo reads the heat—not who is right."],
        ["YouVersion returns the exact passage."],
        ["The model never chooses or invents Scripture."],
        ["Your voice. Your choice."],
        ["Edit · Wait · Send anyway"],
        ["A crisis never gets answered with a verse."],
        ["It stops—and points toward human help."],
        ["Bounded. Schema-checked. Fail-closed."],
        ["One quiet moment before your words leave your hands."],
      ]
    : [
        ["Ever write the perfect reply—", "and regret it one second later?"],
        ["Selah lives inside that second."],
        ["Gloo reads the heat—not who is right."],
        ["YouVersion returns the exact passage."],
        ["The model never invents Scripture."],
        ["Your voice. Your choice."],
        ["Edit · Wait · Send anyway"],
        ["A crisis never gets answered with a verse."],
        ["It stops—and points toward human help."],
        ["Bounded. Schema-checked. Fail-closed."],
        ["One quiet moment before your words leave your hands."],
      ];
for (const [index, lines] of captions.entries()) {
  await write(
    `caption-${String(index + 1).padStart(2, "0")}.png`,
    captionFrame(lines),
  );
}

const chapters = [
  "THE MOMENT",
  "LIVE PROOF",
  "YOUR CHOICE",
  "SAFETY",
  "THE BOUNDS",
];
for (const [index, label] of chapters.entries()) {
  await write(
    `chapter-${String(index + 1).padStart(2, "0")}.png`,
    chapterFrame(index + 1, label),
  );
}

await write("proof-live.png", proofFrame("live"));
await write("proof-safety.png", proofFrame("safety"));
await write("architecture.png", architectureFrame());
await write("preview-watermark.png", previewWatermark());
await write("intro-title.png", introTitleFrame());
await write("intro-hello.png", introHelloFrame());
await write("opening-message.png", openingConversationFrame("message"));
await write("opening-reply.png", openingConversationFrame("reply"));
await write("opening-pause.png", openingConversationFrame("pause"));

console.log(`Generated ${profile} editorial video graphics in ${assets}`);
console.log(
  productStillUri === null
    ? "Preview reference: built-in illustrative fallback (not live evidence)"
    : `Preview reference: ${previewStillPath} (marked not live evidence)`,
);
