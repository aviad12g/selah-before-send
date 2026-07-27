import assert from "node:assert/strict";
import test from "node:test";

const SAMPLE_POST =
  "If this mattered to you, you would have shown up. Stop calling it complicated.";
const SAMPLE_DRAFT =
  "You don’t get to decide what mattered to me. You have no idea what I was carrying—maybe stop making everything about you.";

async function dispatch(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render(path = "/") {
  return dispatch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
  );
}

async function withLiveCredentials(fetchImplementation, callback) {
  const originalFetch = globalThis.fetch;
  const credentialNames = [
    "GLOO_CLIENT_ID",
    "GLOO_CLIENT_SECRET",
    "YVP_APP_KEY",
  ];
  const originalCredentials = Object.fromEntries(
    credentialNames.map((name) => [name, process.env[name]]),
  );

  process.env.GLOO_CLIENT_ID = "test-client";
  process.env.GLOO_CLIENT_SECRET = "test-secret";
  process.env.YVP_APP_KEY = "test-youversion-key";
  globalThis.fetch = fetchImplementation;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of credentialNames) {
      const value = originalCredentials[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("server-renders the Selah experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Selah Before Send — A pause inside the conversation<\/title>/i,
  );
  assert.match(html, /SELAH \/ BEFORE SEND/);
  assert.match(html, /Before it leaves/);
  assert.match(html, /Pause before sending/);
  assert.match(html, /YouVersion Platform/);
  assert.match(html, /Gloo AI Studio/);
  assert.match(html, /In live mode, pausing sends this post and draft to Gloo/);
  assert.match(
    html,
    /property="og:image" content="http:\/\/localhost(?::3000)?\/og\.png"/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("returns the labeled deterministic preview without credentials", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/selah", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        post: SAMPLE_POST,
        draft: SAMPLE_DRAFT,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const payload = await response.json();
  assert.equal(payload.source, "curated-demo");
  assert.equal(payload.passage.reference, "James 1:19–20");
  assert.equal(payload.passage.version, "BSB");
  assert.match(payload.passage.content, /^My beloved brothers, understand this:/);
  assert.equal(payload.reflection.threeMoves.length, 3);
  assert.deepEqual(payload.assessment.risk, {
    level: "none",
    category: "none",
  });
});

test("rejects incomplete reflection requests", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/selah", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ post: "No", draft: "short" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "The post or draft is too short.",
  });
});

test("rejects non-object JSON request bodies", async () => {
  for (const body of ["null", "[]", '"text"', "42"]) {
    const response = await dispatch(
      new Request("http://localhost/api/selah", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    assert.equal(response.status, 400, body);
    assert.deepEqual(await response.json(), {
      error: "Send the post and draft as a JSON object.",
    });
  }
});

test("stops realistic high-risk language before the reflection path", async () => {
  const riskyDrafts = [
    "I am going to hurt you tonight.",
    "I don't want to be here anymore.",
    "I don’t want to be alive anymore.",
    "Nobody would miss me if I was gone.",
    "My family would be better off without me.",
    "I can't keep living like this.",
    "There is no reason for me to live.",
    "I won't be around tomorrow.",
    "I'm going to end you.",
    "I know where you live.",
    "We know where you live.",
    "I will burn your house down.",
    "He said he would kill me.",
    "My abuser keeps following me.",
    "You stalked me for weeks.",
    "I was abused for years.",
    "My pastor abused me.",
    "He is abusing me.",
    "My ex is stalking me.",
    "You're stalking me.",
    "I want to kill myself.",
  ];

  for (const draft of riskyDrafts) {
    const response = await dispatch(
      new Request("http://localhost/api/selah", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post: "A highly emotional exchange.", draft }),
      }),
    );

    assert.equal(response.status, 422, draft);
    const payload = await response.json();
    assert.equal(payload.code, "HIGH_RISK", draft);
    assert.equal(payload.supportUrl, "https://findahelpline.com/", draft);
    assert.match(payload.error, /will not continue this reflection/, draft);
  }
});

test("does not mislabel ordinary discussion as high risk", async () => {
  const ordinaryDrafts = [
    "The church covered up decades of abuse and you know it.",
    "This is a clear abuse of power by the elders.",
    "My brother is in recovery from substance abuse.",
    "The report says children are being abused by leaders.",
    "Studies show patients have been abused in institutions.",
    "I can't go on arguing in circles.",
    "I don't want to die on this hill.",
    "I'll shoot you an email with the details.",
    "I won't make you pay for this; it's on me.",
    "I know where you live because you sent me the address.",
    "Don't hurt yourself trying to fix this tonight.",
  ];

  for (const draft of ordinaryDrafts) {
    const response = await dispatch(
      new Request("http://localhost/api/selah", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post: "A difficult public conversation.", draft }),
      }),
    );

    assert.equal(response.status, 503, draft);
    const payload = await response.json();
    assert.equal(payload.code, "LIVE_SAFETY_UNAVAILABLE", draft);
    assert.equal(payload.reflection, undefined, draft);
    assert.equal(payload.passage, undefined, draft);
  }
});

test("never reflects on novel drafts when semantic screening is unavailable", async () => {
  const novelSafetyProbes = [
    "She keeps hitting me and I don't know what to do.",
    "I'm better off gone.",
    "I have nothing left to live for.",
    "I could just disappear.",
    "I'll be waiting outside your office.",
    "I hope you get what is coming to you.",
    "I want to hurt my sister.",
    "You will regret this, I promise you that.",
  ];

  for (const draft of novelSafetyProbes) {
    const response = await dispatch(
      new Request("http://localhost/api/selah", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post: "A highly emotional exchange.", draft }),
      }),
    );

    assert.ok([422, 503].includes(response.status), draft);
    const payload = await response.json();
    assert.ok(
      ["HIGH_RISK", "LIVE_SAFETY_UNAVAILABLE"].includes(payload.code),
      draft,
    );
    assert.equal(payload.source, undefined, draft);
    assert.equal(payload.reflection, undefined, draft);
    assert.equal(payload.passage, undefined, draft);
  }
});

test("stops a live semantic-risk result before Scripture retrieval", async () => {
  const upstreamCalls = [];

  await withLiveCredentials(
    async (input) => {
      const url = String(input);
      upstreamCalls.push(url);
      if (url === "https://platform.ai.gloo.com/oauth2/token") {
        return Response.json({ access_token: "test-token", expires_in: 300 });
      }
      if (url === "https://platform.ai.gloo.com/ai/v2/chat/completions") {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  theme: "not-a-theme",
                  temperature: "unknown",
                  underlyingNeed: "",
                  risk: { level: "urgent", category: "abuse" },
                }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected upstream call: ${url}`);
    },
    async () => {
      const response = await dispatch(
        new Request("http://localhost/api/selah", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "semantic-risk-test",
          },
          body: JSON.stringify({
            post: "A highly emotional exchange.",
            draft: "She keeps hitting me and I don't know what to do.",
          }),
        }),
      );

      assert.equal(response.status, 422);
      const payload = await response.json();
      assert.equal(payload.code, "HIGH_RISK");
      assert.equal(payload.supportUrl, "https://findahelpline.com/");
      assert.deepEqual(upstreamCalls, [
        "https://platform.ai.gloo.com/oauth2/token",
        "https://platform.ai.gloo.com/ai/v2/chat/completions",
      ]);
    },
  );
});

test("rejects an empty assessment need before Scripture retrieval", async () => {
  const upstreamCalls = [];

  await withLiveCredentials(
    async (input) => {
      const url = String(input);
      upstreamCalls.push(url);
      if (url === "https://platform.ai.gloo.com/oauth2/token") {
        return Response.json({ access_token: "test-token", expires_in: 300 });
      }
      if (url === "https://platform.ai.gloo.com/ai/v2/chat/completions") {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  theme: "listen",
                  temperature: "Low heat",
                  underlyingNeed: "To",
                  risk: { level: "none", category: "none" },
                }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected upstream call: ${url}`);
    },
    async () => {
      const originalConsoleError = console.error;
      console.error = () => {};
      let response;
      try {
        response = await dispatch(
          new Request("http://localhost/api/selah", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "cf-connecting-ip": "empty-need-test",
            },
            body: JSON.stringify({
              post: "A difficult public conversation.",
              draft: "I disagree, but I want to answer carefully.",
            }),
          }),
        );
      } finally {
        console.error = originalConsoleError;
      }

      assert.equal(response.status, 502);
      assert.deepEqual(upstreamCalls, [
        "https://platform.ai.gloo.com/oauth2/token",
        "https://platform.ai.gloo.com/ai/v2/chat/completions",
      ]);
    },
  );
});
