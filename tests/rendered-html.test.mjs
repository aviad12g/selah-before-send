import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const SAMPLE_POST =
  "I’m tired of you pretending this isn’t a choice. Stop calling it complicated.";
const SAMPLE_DRAFT =
  "You don’t get to decide what mattered to me. You have no idea what I was carrying—maybe stop making everything about you.";

function toolCompletion(name, args) {
  return Response.json({
    choices: [
      {
        message: {
          tool_calls: [
            {
              function: {
                name,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
  });
}

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

async function withValidationSecret(secret, callback) {
  const original = process.env.SELAH_VALIDATION_SECRET;
  process.env.SELAH_VALIDATION_SECRET = secret;
  try {
    return await callback();
  } finally {
    if (original === undefined) delete process.env.SELAH_VALIDATION_SECRET;
    else process.env.SELAH_VALIDATION_SECRET = original;
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
  assert.match(html, /aria-label="Selah Before Send home"/);
  assert.match(html, /Before your words leave/);
  assert.match(html, /Mara wrote/);
  assert.match(
    html,
    /I’m tired of you pretending this isn’t a choice\. Stop calling it complicated\./,
  );
  assert.match(html, /Pause before sending/);
  assert.match(html, /YouVersion Platform/);
  assert.match(html, /Gloo AI Studio/);
  assert.match(html, /In live mode, pausing sends this post and draft to Gloo/);
  assert.match(
    html,
    /property="og:image" content="http:\/\/localhost(?::3000)?\/og-editorial\.png"/,
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

test("returns exact YouVersion provenance and a completed live audit", async () => {
  const upstreamCalls = [];
  const completionRequests = [];
  let completionCount = 0;

  await withLiveCredentials(
    async (input, init) => {
      const url = String(input);
      upstreamCalls.push(url);
      if (url === "https://platform.ai.gloo.com/oauth2/token") {
        return Response.json({ access_token: "test-token", expires_in: 300 });
      }
      if (url === "https://platform.ai.gloo.com/ai/v2/chat/completions") {
        completionRequests.push(JSON.parse(init.body));
        completionCount += 1;
        if (completionCount === 1) {
          return toolCompletion("submit_selah_assessment", {
            theme: "listen",
            temperature: "Rising heat",
            underlyingNeed: "To be heard before deciding",
            risk: { level: "none", category: "none" },
          });
        }
        return toolCompletion("submit_selah_reflection", {
          question: "What can you acknowledge before making your request?",
          editPrompt:
            "Keep your point, name what you heard, then ask for one next step.",
          threeMoves: [
            "Name what you heard",
            "State your concern",
            "Ask one clear question",
          ],
        });
      }
      if (
        url ===
        "https://api.youversion.com/v1/bibles/3034/passages/JAS.1.19-20?format=text"
      ) {
        return Response.json({
          data: {
            content: "Be quick to listen, slow to speak, and slow to anger.",
            reference: "James 1:19–20",
          },
        });
      }
      if (
        url ===
        "https://api.youversion.com/v1/bibles/3034/passages/JAS.1.19-25?format=text"
      ) {
        return Response.json({
          data: {
            content:
              "Be quick to listen, slow to speak, and slow to anger. Continue as a doer of the word.",
            reference: "James 1:19–25",
          },
        });
      }
      if (url === "https://api.youversion.com/v1/bibles/3034") {
        return Response.json({
          data: { copyright: "Test BSB attribution." },
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
            "cf-connecting-ip": "live-provenance-test",
          },
          body: JSON.stringify({
            post: "A teammate asked for a clear update on the plan.",
            draft:
              "I am frustrated by the change, but I want to answer carefully and propose one next step.",
          }),
        }),
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.source, "live");
      assert.deepEqual(payload.passage.provenance, {
        provider: "YouVersion Platform",
        bibleId: 3034,
        bibleVersion: "BSB",
        focusPassageId: "JAS.1.19-20",
        contextPassageId: "JAS.1.19-25",
      });
      assert.deepEqual(payload.audit, {
        schemaVersion: 1,
        decision: "completed-live",
        providerStagesAttempted: {
          glooAssessment: true,
          youVersion: true,
          glooReflection: true,
        },
        providerStagesCompleted: {
          glooAssessment: true,
          youVersion: true,
          glooReflection: true,
        },
      });
      assert.equal(
        upstreamCalls.filter((url) =>
          url.includes("platform.ai.gloo.com/ai/v2/chat/completions"),
        ).length,
        2,
      );
      assert.equal(
        upstreamCalls.filter((url) => url.includes("api.youversion.com")).length,
        3,
      );
      assert.deepEqual(
        completionRequests.map((request) => ({
          toolChoice: request.tool_choice,
          toolName: request.tools?.[0]?.function?.name,
          maxTokens: request.max_tokens,
        })),
        [
          {
            toolChoice: "required",
            toolName: "submit_selah_assessment",
            maxTokens: 512,
          },
          {
            toolChoice: "required",
            toolName: "submit_selah_reflection",
            maxTokens: 512,
          },
        ],
      );
    },
  );
});

test("proves a deterministic safety stop makes zero provider calls", async () => {
  const upstreamCalls = [];

  await withLiveCredentials(
    async (input) => {
      upstreamCalls.push(String(input));
      throw new Error("No provider call is allowed for deterministic safety");
    },
    async () => {
      const response = await dispatch(
        new Request("http://localhost/api/selah", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "zero-provider-test",
          },
          body: JSON.stringify({
            post: "A fictional character wrote an emotional public reply.",
            draft: "I want to kill myself.",
          }),
        }),
      );

      assert.equal(response.status, 422);
      const payload = await response.json();
      assert.equal(payload.code, "HIGH_RISK");
      assert.deepEqual(payload.audit, {
        schemaVersion: 1,
        decision: "blocked-deterministic",
        providerStagesAttempted: {
          glooAssessment: false,
          youVersion: false,
          glooReflection: false,
        },
        providerStagesCompleted: {
          glooAssessment: false,
          youVersion: false,
          glooReflection: false,
        },
      });
      assert.deepEqual(upstreamCalls, []);
    },
  );
});

test("fails closed when a real provider adapter returns an error", async () => {
  const upstreamCalls = [];

  await withLiveCredentials(
    async (input) => {
      const url = String(input);
      upstreamCalls.push(url);
      if (url === "https://platform.ai.gloo.com/oauth2/token") {
        return Response.json({ access_token: "test-token", expires_in: 300 });
      }
      if (url === "https://platform.ai.gloo.com/ai/v2/chat/completions") {
        return Response.json({ error: "synthetic provider outage" }, { status: 503 });
      }
      throw new Error(`No downstream call was expected: ${url}`);
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
              "cf-connecting-ip": "provider-failure-test",
            },
            body: JSON.stringify({
              post: "A teammate asked for a clear update on the plan.",
              draft:
                "I disagree with the change, but I want to reply carefully and keep the next step clear.",
            }),
          }),
        );
      } finally {
        console.error = originalConsoleError;
      }

      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.equal(payload.code, "UPSTREAM_UNAVAILABLE");
      assert.equal(payload.source, undefined);
      assert.equal(payload.passage, undefined);
      assert.equal(payload.reflection, undefined);
      assert.deepEqual(payload.audit, {
        schemaVersion: 1,
        decision: "failed-closed",
        providerStagesAttempted: {
          glooAssessment: true,
          youVersion: false,
          glooReflection: false,
        },
        providerStagesCompleted: {
          glooAssessment: false,
          youVersion: false,
          glooReflection: false,
        },
      });
      assert.ok(
        upstreamCalls.some((url) =>
          url.includes("platform.ai.gloo.com/ai/v2/chat/completions"),
        ),
      );
      assert.equal(
        upstreamCalls.some((url) => url.includes("api.youversion.com")),
        false,
      );
    },
  );
});

test("fails closed when Gloo omits the required structured tool call", async () => {
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
                content:
                  '{"theme":"listen","temperature":"Low heat","underlyingNeed":',
              },
            },
          ],
        });
      }
      throw new Error(`No downstream call was expected: ${url}`);
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
              "cf-connecting-ip": "missing-tool-call-test",
            },
            body: JSON.stringify({
              post: "A teammate asked for a clear update on the plan.",
              draft:
                "I disagree with the change, but I want to reply carefully and keep the next step clear.",
            }),
          }),
        );
      } finally {
        console.error = originalConsoleError;
      }

      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.equal(payload.code, "UPSTREAM_UNAVAILABLE");
      assert.deepEqual(payload.audit.providerStagesCompleted, {
        glooAssessment: false,
        youVersion: false,
        glooReflection: false,
      });
      assert.deepEqual(upstreamCalls, [
        "https://platform.ai.gloo.com/oauth2/token",
        "https://platform.ai.gloo.com/ai/v2/chat/completions",
      ]);
    },
  );
});

test("accepts an HMAC-authenticated production fault without sending the secret", async () => {
  const upstreamCalls = [];
  const secret = "test-only-validation-secret-32-characters-long";
  const timestamp = String(Date.now());
  const scenario = "provider-failure";
  const post = "A teammate asked for a reply after reviewing the updated plan.";
  const draft =
    "I disagree with the change, but I want to respond carefully and keep the next step clear.";
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify({ timestamp, scenario, post, draft }))
    .digest("hex");

  await withValidationSecret(secret, async () => {
    await withLiveCredentials(
      async (input) => {
        upstreamCalls.push(String(input));
        throw new Error("Authenticated synthetic failure must not call a provider");
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
                "cf-connecting-ip": "signed-fault-test",
                "x-selah-validation-scenario": scenario,
                "x-selah-validation-timestamp": timestamp,
                "x-selah-validation-signature": signature,
              },
              body: JSON.stringify({ post, draft }),
            }),
          );
        } finally {
          console.error = originalConsoleError;
        }

        assert.equal(response.status, 502);
        const payload = await response.json();
        assert.equal(payload.code, "UPSTREAM_UNAVAILABLE");
        assert.equal(payload.source, undefined);
        assert.equal(payload.passage, undefined);
        assert.equal(payload.reflection, undefined);
        assert.deepEqual(payload.audit, {
          schemaVersion: 1,
          decision: "failed-closed",
          providerStagesAttempted: {
            glooAssessment: true,
            youVersion: false,
            glooReflection: false,
          },
          providerStagesCompleted: {
            glooAssessment: false,
            youVersion: false,
            glooReflection: false,
          },
        });
        assert.deepEqual(upstreamCalls, []);
      },
    );
  });
});

test("rejects an invalid production fault signature before any provider call", async () => {
  const upstreamCalls = [];
  const secret = "test-only-validation-secret-32-characters-long";

  await withValidationSecret(secret, async () => {
    await withLiveCredentials(
      async (input) => {
        upstreamCalls.push(String(input));
        throw new Error("An unauthorized request must not call a provider");
      },
      async () => {
        const response = await dispatch(
          new Request("http://localhost/api/selah", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "cf-connecting-ip": "invalid-signature-test",
              "x-selah-validation-scenario": "provider-failure",
              "x-selah-validation-timestamp": String(Date.now()),
              "x-selah-validation-signature": "0".repeat(64),
            },
            body: JSON.stringify({
              post: "A teammate asked for a reply after reviewing the plan.",
              draft:
                "I disagree with the change, but I want to reply carefully and keep the next step clear.",
            }),
          }),
        );

        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), {
          code: "VALIDATION_UNAUTHORIZED",
          error: "The production validation request was not authorized.",
        });
        assert.deepEqual(upstreamCalls, []);
      },
    );
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
        return toolCompletion("submit_selah_assessment", {
          theme: "not-a-theme",
          temperature: "unknown",
          underlyingNeed: "",
          risk: { level: "urgent", category: "abuse" },
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
        return toolCompletion("submit_selah_assessment", {
          theme: "listen",
          temperature: "Low heat",
          underlyingNeed: "To",
          risk: { level: "none", category: "none" },
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
