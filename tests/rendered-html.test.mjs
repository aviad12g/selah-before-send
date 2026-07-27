import assert from "node:assert/strict";
import test from "node:test";

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
        post: "A tense public post.",
        draft: "This is a defensive reply that should pause.",
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
    assert.match(payload.error, /cannot safely offer a Scripture reflection/, draft);
  }
});

test("does not block ordinary discussion of abuse as a topic", async () => {
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

    assert.equal(response.status, 200, draft);
    assert.equal((await response.json()).source, "curated-demo", draft);
  }
});
