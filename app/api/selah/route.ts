type ThemeKey = "listen" | "gentleness" | "repair" | "judgment" | "burden";

type Assessment = {
  theme: ThemeKey;
  temperature: "Low heat" | "Rising heat" | "High heat";
  underlyingNeed: string;
};

type Reflection = {
  question: string;
  editPrompt: string;
  threeMoves: [string, string, string];
};

const BIBLE_ID = 3034;
const BIBLE_VERSION = "BSB";
const BIBLE_COPYRIGHT =
  "The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. This text of God's Word has been dedicated to the public domain.";
const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
};
const MAX_REQUEST_BYTES = 8_192;
const UPSTREAM_TIMEOUT_MS = 15_000;
const OVERALL_TIMEOUT_MS = 35_000;
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;

let cachedGlooToken:
  | {
      value: string;
      expiresAt: number;
    }
  | undefined;

const rateBuckets = new Map<string, { count: number; resetsAt: number }>();

const passages: Record<
  ThemeKey,
  {
    focus: string;
    context: string;
  }
> = {
  listen: {
    focus: "JAS.1.19-20",
    context: "JAS.1.19-25",
  },
  gentleness: {
    focus: "PRO.15.1",
    context: "PRO.15.1-4",
  },
  repair: {
    focus: "EPH.4.29",
    context: "EPH.4.29-32",
  },
  judgment: {
    focus: "MAT.7.3-5",
    context: "MAT.7.1-5",
  },
  burden: {
    focus: "GAL.6.2",
    context: "GAL.6.1-5",
  },
};

const fixtureAssessment: Assessment = {
  theme: "listen",
  temperature: "High heat",
  underlyingNeed: "To be understood before being judged",
};

const fixtureReflection: Reflection = {
  question:
    "Can you make room for what hurt them before you explain what hurt you?",
  editPrompt:
    "Keep your point. Change the order: show what you heard, name what was missing, then make one clear request.",
  threeMoves: [
    "Name what you heard",
    "Say what they could not see",
    "Ask for one next step",
  ],
};

function stripFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function wordCount(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function parseAssessment(value: string): Assessment {
  const parsed = JSON.parse(stripFence(value)) as Assessment;
  const underlyingNeed =
    typeof parsed?.underlyingNeed === "string"
      ? parsed.underlyingNeed.trim()
      : "";
  if (
    !parsed ||
    !passages[parsed.theme] ||
    !["Low heat", "Rising heat", "High heat"].includes(parsed.temperature) ||
    !/^To\b/u.test(underlyingNeed) ||
    wordCount(underlyingNeed) > 10 ||
    underlyingNeed.length > 72
  ) {
    throw new Error("Gloo assessment did not match the fixed contract");
  }
  return { ...parsed, underlyingNeed };
}

function parseReflection(value: string): Reflection {
  const parsed = JSON.parse(stripFence(value)) as Reflection;
  const question = typeof parsed?.question === "string" ? parsed.question.trim() : "";
  const editPrompt =
    typeof parsed?.editPrompt === "string" ? parsed.editPrompt.trim() : "";
  if (
    !parsed ||
    !question ||
    !editPrompt ||
    wordCount(question) > 24 ||
    wordCount(editPrompt) > 34 ||
    question.length > 160 ||
    editPrompt.length > 220 ||
    !Array.isArray(parsed.threeMoves) ||
    parsed.threeMoves.length !== 3 ||
    parsed.threeMoves.some(
      (move) =>
        typeof move !== "string" ||
        !move.trim() ||
        wordCount(move) > 7 ||
        move.trim().length > 52,
    )
  ) {
    throw new Error("Gloo reflection did not match the fixed contract");
  }
  return {
    question,
    editPrompt,
    threeMoves: parsed.threeMoves.map((move) => move.trim()) as [
      string,
      string,
      string,
    ],
  };
}

function upstreamSignal(overallSignal: AbortSignal) {
  return AbortSignal.any([
    overallSignal,
    AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  ]);
}

async function getGlooToken(
  clientId: string,
  clientSecret: string,
  overallSignal: AbortSignal,
) {
  if (cachedGlooToken && cachedGlooToken.expiresAt > Date.now() + 60_000) {
    return cachedGlooToken.value;
  }

  const response = await fetch("https://platform.ai.gloo.com/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "api/access",
    }),
    signal: upstreamSignal(overallSignal),
  });
  if (!response.ok) throw new Error(`Gloo token failed: ${response.status}`);
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) throw new Error("Gloo token response was empty");
  cachedGlooToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3_600) * 1_000,
  };
  return cachedGlooToken.value;
}

async function complete(
  token: string,
  messages: Array<{ role: string; content: string }>,
  overallSignal: AbortSignal,
) {
  const response = await fetch(
    "https://platform.ai.gloo.com/ai/v2/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auto_routing: true,
        messages,
        temperature: 0,
        max_tokens: 220,
      }),
      signal: upstreamSignal(overallSignal),
    },
  );
  if (!response.ok) throw new Error(`Gloo completion failed: ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Gloo completion was empty");
  return content;
}

async function assessDraft(
  token: string,
  post: string,
  draft: string,
  overallSignal: AbortSignal,
) {
  const content = await complete(
    token,
    [
      {
        role: "system",
        content: `Classify a social reply for a private pre-send pause. Return JSON only.
Never diagnose a person, infer protected attributes, assign blame, preach, or quote Scripture.
Choose theme from listen, gentleness, repair, judgment, burden.
Temperature must be Low heat, Rising heat, or High heat.
Underlying need is a charitable description under 10 words, beginning with "To".
Schema: {"theme":"listen","temperature":"High heat","underlyingNeed":"To be understood before being judged"}`,
      },
      {
        role: "user",
        content: `Original post:\n${post}\n\nDraft reply:\n${draft}`,
      },
    ],
    overallSignal,
  );
  return parseAssessment(content);
}

async function reflect(
  token: string,
  post: string,
  draft: string,
  assessment: Assessment,
  passage: {
    content: string;
    reference: string;
    context: string;
    contextReference: string;
  },
  overallSignal: AbortSignal,
) {
  const content = await complete(
    token,
    [
      {
        role: "system",
        content: `Create one private reflection before a social reply is sent. Return JSON only.
Use only the supplied Biblical focus passage and context; do not quote or paraphrase other Scripture.
Do not write the reply for the user. Do not shame, diagnose, promise an outcome, claim divine
intent, or replace pastoral/professional care. The question must be under 24 words.
The edit prompt must preserve user agency and be under 34 words. Each of three moves
must be an imperative under 7 words.
Schema: {"question":"","editPrompt":"","threeMoves":["","",""]}`,
      },
      {
        role: "user",
        content: `Original post:\n${post}\n\nDraft reply:\n${draft}

Assessment: ${assessment.temperature}; ${assessment.underlyingNeed}
Focus passage (${passage.reference}): ${passage.content}
Wider context (${passage.contextReference}): ${passage.context}`,
      },
    ],
    overallSignal,
  );
  return parseReflection(content);
}

async function fetchYouVersion(
  theme: ThemeKey,
  appKey: string,
  overallSignal: AbortSignal,
) {
  const selected = passages[theme];
  const headers = {
    accept: "application/json",
    "x-yvp-app-key": appKey,
  };
  const [focusResponse, contextResponse, bibleResponse] = await Promise.all([
    fetch(
      `https://api.youversion.com/v1/bibles/${BIBLE_ID}/passages/${selected.focus}?format=text`,
      { headers, signal: upstreamSignal(overallSignal) },
    ),
    fetch(
      `https://api.youversion.com/v1/bibles/${BIBLE_ID}/passages/${selected.context}?format=text`,
      { headers, signal: upstreamSignal(overallSignal) },
    ),
    fetch(`https://api.youversion.com/v1/bibles/${BIBLE_ID}`, {
      headers,
      signal: upstreamSignal(overallSignal),
    }),
  ]);
  if (!focusResponse.ok || !contextResponse.ok) {
    throw new Error(
      `YouVersion passage failed: ${focusResponse.status}/${contextResponse.status}`,
    );
  }

  const rawFocus = (await focusResponse.json()) as {
    data?: { content?: string; reference?: string };
    content?: string;
    reference?: string;
  };
  const rawContext = (await contextResponse.json()) as {
    data?: { content?: string; reference?: string };
    content?: string;
    reference?: string;
  };
  const focus = rawFocus.data ?? rawFocus;
  const context = rawContext.data ?? rawContext;
  if (!focus.content || !focus.reference || !context.content || !context.reference) {
    throw new Error("YouVersion passage response was empty");
  }

  let copyright = BIBLE_COPYRIGHT;
  if (bibleResponse.ok) {
    const rawBible = (await bibleResponse.json()) as {
      data?: { copyright?: string };
      copyright?: string;
    };
    copyright = (rawBible.data ?? rawBible).copyright || copyright;
  }

  return {
    content: focus.content,
    reference: focus.reference,
    context: context.content,
    contextReference: context.reference,
    copyright,
  };
}

function looksHighRisk(value: string) {
  return [
    /\b(?:suicid(?:e|al)|self[- ]?harm|end my life|kill myself)\b/iu,
    /\b(?:kill|shoot|stab|hurt)\s+(?:you|them|him|her|myself|yourself)\b/iu,
    /\b(?:abuse|abuser|rape|stalk(?:ed|ing)?|immediate danger)\b/iu,
  ].some((pattern) => pattern.test(value));
}

function takeRateLimit(request: Request) {
  const now = Date.now();
  if (rateBuckets.size > 1_000) {
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetsAt <= now) rateBuckets.delete(key);
    }
  }

  const key = request.headers.get("cf-connecting-ip") ?? "anonymous";
  const current = rateBuckets.get(key);
  if (!current || current.resetsAt <= now) {
    rateBuckets.set(key, {
      count: 1,
      resetsAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((current.resetsAt - now) / 1_000));
  }
  current.count += 1;
  return null;
}

function fixtureResponse() {
  return {
    assessment: fixtureAssessment,
    passage: {
      content:
        "My beloved brothers, understand this: Everyone should be quick to listen, slow to speak, and slow to anger, for man’s anger does not bring about the righteousness that God desires.",
      context:
        "My beloved brothers, understand this: Everyone should be quick to listen, slow to speak, and slow to anger, for man’s anger does not bring about the righteousness that God desires. Therefore, get rid of all moral filth and every expression of evil, and humbly accept the word planted in you, which can save your souls. Be doers of the word, and not hearers only. Otherwise, you are deceiving yourselves. For anyone who hears the word but does not carry it out is like a man who looks at his face in a mirror, and after observing himself goes away and immediately forgets what he looks like. But the one who looks intently into the perfect law of freedom, and continues to do so—not being a forgetful hearer, but an effective doer—he will be blessed in what he does.",
      reference: "James 1:19–20",
      contextReference: "James 1:19–25",
      version: BIBLE_VERSION,
      copyright: BIBLE_COPYRIGHT,
    },
    reflection: fixtureReflection,
    source: "curated-demo" as const,
  };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: "The request is too large." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  let input: { post?: unknown; draft?: unknown };
  try {
    input = (await request.json()) as { post?: unknown; draft?: unknown };
  } catch {
    return Response.json(
      { error: "Send the post and draft as JSON." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const post = typeof input.post === "string" ? input.post.trim().slice(0, 1000) : "";
  const draft =
    typeof input.draft === "string" ? input.draft.trim().slice(0, 500) : "";
  if (post.length < 4 || draft.length < 8) {
    return Response.json(
      { error: "The post or draft is too short." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (looksHighRisk(`${post}\n${draft}`)) {
    return Response.json(
      {
        code: "HIGH_RISK",
        error:
          "Selah does not open a spiritual reflection for language about threats, self-harm, abuse, or immediate danger. Pause here. If anyone may be in danger, contact local emergency services or a trusted person nearby.",
      },
      { status: 422, headers: NO_STORE_HEADERS },
    );
  }

  const clientId = process.env.GLOO_CLIENT_ID;
  const clientSecret = process.env.GLOO_CLIENT_SECRET;
  const youVersionKey = process.env.YVP_APP_KEY;
  if (!clientId || !clientSecret || !youVersionKey) {
    return Response.json(fixtureResponse(), { headers: NO_STORE_HEADERS });
  }

  const retryAfter = takeRateLimit(request);
  if (retryAfter !== null) {
    return Response.json(
      {
        error:
          "The live reflection limit was reached. Nothing was posted; try again later.",
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "retry-after": String(retryAfter),
        },
      },
    );
  }

  try {
    const overallSignal = AbortSignal.timeout(OVERALL_TIMEOUT_MS);
    const token = await getGlooToken(clientId, clientSecret, overallSignal);
    const assessment = await assessDraft(token, post, draft, overallSignal);
    const passage = await fetchYouVersion(
      assessment.theme,
      youVersionKey,
      overallSignal,
    );
    const reflection = await reflect(
      token,
      post,
      draft,
      assessment,
      passage,
      overallSignal,
    );
    return Response.json(
      {
        assessment,
        passage: {
          ...passage,
          version: BIBLE_VERSION,
        },
        reflection,
        source: "live",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      "Selah orchestration failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      {
        error:
          "The private reflection could not be opened. No social post was created.",
      },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
