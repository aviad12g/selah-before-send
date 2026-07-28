#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SAFE_POST =
  "A project teammate wrote: The deadline moved. Please confirm which task you will finish today.";
const SAFE_DRAFT =
  "I am frustrated that the plan changed without warning, but I want to answer clearly and ask for one next step.";
const SAFETY_POST = "A fictional character wrote a highly emotional public reply.";
const SAFETY_DRAFT = "I want to kill myself.";
const FAULT_POST =
  "A project teammate wrote: Please reply when you have reviewed the updated plan.";
const FAULT_DRAFT =
  "I disagree with the change, but I want to respond carefully and keep the next step clear.";

const PASSAGES = {
  listen: {
    focusPassageId: "JAS.1.19-20",
    contextPassageId: "JAS.1.19-25",
  },
  gentleness: {
    focusPassageId: "PRO.15.1",
    contextPassageId: "PRO.15.1-4",
  },
  repair: {
    focusPassageId: "EPH.4.29",
    contextPassageId: "EPH.4.29-32",
  },
  judgment: {
    focusPassageId: "MAT.7.3-5",
    contextPassageId: "MAT.7.1-5",
  },
  burden: {
    focusPassageId: "GAL.6.2",
    contextPassageId: "GAL.6.1-5",
  },
};

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function assertNoGeneratedOutput(payload) {
  assert.equal(payload.source, undefined);
  assert.equal(payload.passage, undefined);
  assert.equal(payload.reflection, undefined);
}

function assertAllStages(value, expected) {
  assert.deepEqual(value, {
    glooAssessment: expected,
    youVersion: expected,
    glooReflection: expected,
  });
}

async function postJson(endpoint, body, headers = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "selah-redacted-production-validator/1",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  assert.match(
    contentType,
    /^application\/json\b/iu,
    `Expected JSON but received ${contentType || "no content type"}`,
  );
  return { response, payload: await response.json() };
}

async function validateLive(endpoint) {
  const { response, payload } = await postJson(endpoint, {
    post: SAFE_POST,
    draft: SAFE_DRAFT,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(payload.source, "live");
  assert.equal(typeof payload.passage?.content, "string");
  assert.ok(payload.passage.content.length > 0);
  assert.equal(typeof payload.passage?.context, "string");
  assert.ok(payload.passage.context.length > payload.passage.content.length);
  assert.equal(typeof payload.passage?.reference, "string");
  assert.ok(payload.passage.reference.length > 0);
  assert.equal(typeof payload.passage?.contextReference, "string");
  assert.ok(payload.passage.contextReference.length > 0);
  assert.equal(payload.passage.version, "BSB");
  assert.equal(typeof payload.passage?.copyright, "string");
  assert.ok(payload.passage.copyright.length > 0);

  const expectedIds = PASSAGES[payload.assessment?.theme];
  assert.ok(expectedIds, "Live assessment returned an unallowlisted theme");
  assert.deepEqual(payload.passage.provenance, {
    provider: "YouVersion Platform",
    bibleId: 3034,
    bibleVersion: "BSB",
    ...expectedIds,
  });
  assert.equal(payload.audit?.schemaVersion, 1);
  assert.equal(payload.audit?.decision, "completed-live");
  assertAllStages(payload.audit?.providerStagesAttempted, true);
  assertAllStages(payload.audit?.providerStagesCompleted, true);

  return {
    status: "passed",
    source: payload.source,
    theme: payload.assessment.theme,
    reference: payload.passage.reference,
    contextReference: payload.passage.contextReference,
    provenance: payload.passage.provenance,
    responseTextRedacted: true,
  };
}

async function validateDeterministicSafety(endpoint) {
  const { response, payload } = await postJson(endpoint, {
    post: SAFETY_POST,
    draft: SAFETY_DRAFT,
  });
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(payload.code, "HIGH_RISK");
  assert.equal(payload.supportUrl, "https://findahelpline.com/");
  assertNoGeneratedOutput(payload);
  assert.equal(payload.audit?.schemaVersion, 1);
  assert.equal(payload.audit?.decision, "blocked-deterministic");
  assertAllStages(payload.audit?.providerStagesAttempted, false);
  assertAllStages(payload.audit?.providerStagesCompleted, false);

  return {
    status: "passed",
    httpStatus: response.status,
    decision: payload.audit.decision,
    providerStagesAttempted: payload.audit.providerStagesAttempted,
    generatedOutputAbsent: true,
    testInputRedacted: true,
  };
}

async function validateProviderFailure(endpoint, secret) {
  assert.ok(
    secret && secret.length >= 32,
    "Set SELAH_VALIDATION_SECRET to the same 32+ character server-side secret used by the deployment.",
  );
  const timestamp = String(Date.now());
  const scenario = "provider-failure";
  const message = JSON.stringify({
    timestamp,
    scenario,
    post: FAULT_POST,
    draft: FAULT_DRAFT,
  });
  const signature = createHmac("sha256", secret).update(message).digest("hex");
  const { response, payload } = await postJson(
    endpoint,
    { post: FAULT_POST, draft: FAULT_DRAFT },
    {
      "x-selah-validation-scenario": scenario,
      "x-selah-validation-timestamp": timestamp,
      "x-selah-validation-signature": signature,
    },
  );
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(payload.code, "UPSTREAM_UNAVAILABLE");
  assertNoGeneratedOutput(payload);
  assert.equal(payload.audit?.schemaVersion, 1);
  assert.equal(payload.audit?.decision, "failed-closed");
  assert.deepEqual(payload.audit?.providerStagesAttempted, {
    glooAssessment: true,
    youVersion: false,
    glooReflection: false,
  });
  assertAllStages(payload.audit?.providerStagesCompleted, false);

  return {
    status: "passed",
    httpStatus: response.status,
    decision: payload.audit.decision,
    fault: "authenticated synthetic provider failure",
    downstreamScriptureAndReflectionStagesAttempted: false,
    generatedOutputAbsent: true,
    signatureAndTestInputRedacted: true,
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: SELAH_VALIDATION_SECRET=... npm run validate:production -- --base-url https://example.com",
    );
    return;
  }

  const baseUrl = argument("--base-url") ?? process.env.SELAH_BASE_URL;
  assert.ok(baseUrl, "Pass --base-url or set SELAH_BASE_URL.");
  const target = new URL(baseUrl);
  assert.ok(
    target.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(target.hostname),
    "Production validation requires HTTPS.",
  );
  const endpoint = new URL("/api/selah", target);

  const results = {
    schemaVersion: 1,
    targetOrigin: target.origin,
    executedAt: new Date().toISOString(),
    redaction: {
      credentialsPrinted: false,
      requestTextPrinted: false,
      scriptureContentPrinted: false,
      reflectionTextPrinted: false,
    },
    checks: {
      live: await validateLive(endpoint),
      deterministicSafety: await validateDeterministicSafety(endpoint),
      providerFailure: await validateProviderFailure(
        endpoint,
        process.env.SELAH_VALIDATION_SECRET,
      ),
    },
  };

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown validation error";
  console.error(`Production validation failed: ${message}`);
  process.exitCode = 1;
});
