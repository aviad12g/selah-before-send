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

test("stops high-risk language before the reflection path", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/selah", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        post: "You cannot stop me.",
        draft: "I am going to hurt you tonight.",
      }),
    }),
  );

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.code, "HIGH_RISK");
  assert.match(payload.error, /does not open a spiritual reflection/);
});
