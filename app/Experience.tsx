"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  SAMPLE_DRAFT as sampleDraft,
  SAMPLE_POST as samplePost,
} from "./selah-fixture";

type SelahResponse = {
  assessment: {
    temperature: string;
    underlyingNeed: string;
    risk: {
      level: "none" | "concerning" | "urgent";
      category: "none" | "self-harm" | "threat" | "abuse" | "immediate-danger";
    };
  };
  passage: {
    content: string;
    context: string;
    reference: string;
    contextReference: string;
    version: string;
    copyright: string;
  };
  reflection: {
    question: string;
    editPrompt: string;
    threeMoves: [string, string, string];
  };
  source: "curated-demo" | "live";
};

function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function Experience() {
  const [draft, setDraft] = useState(sampleDraft);
  const [result, setResult] = useState<SelahResponse | null>(null);
  const [phase, setPhase] = useState<
    "compose" | "loading" | "pause" | "editing" | "held" | "sent"
  >("compose");
  const [showContext, setShowContext] = useState(false);
  const [error, setError] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [safetyStopped, setSafetyStopped] = useState(false);
  const [heldUntil, setHeldUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(10 * 60);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (phase !== "pause") return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "held" || heldUntil === null) return;
    const update = () => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((heldUntil - Date.now()) / 1_000)),
      );
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [heldUntil, phase]);

  async function pauseBeforeSend(event: FormEvent) {
    event.preventDefault();
    if (draft.trim().length < 8) {
      setError("Write the reply that is actually trying to leave your hands.");
      return;
    }
    setError("");
    setSupportUrl("");
    setPhase("loading");
    try {
      const response = await fetch("/api/selah", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post: samplePost, draft: draft.trim() }),
      });
      const payload = (await response.json()) as SelahResponse & {
        error?: string;
        supportUrl?: string;
        code?: string;
      };
      if (!response.ok) {
        setSupportUrl(payload.supportUrl ?? "");
        if (payload.code === "HIGH_RISK") setSafetyStopped(true);
        throw new Error(payload.error || "Selah could not open.");
      }
      setSafetyStopped(false);
      setResult(payload);
      setShowContext(false);
      setPhase("pause");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The pause did not open. Nothing was posted; your draft remains in this browser.",
      );
      setPhase("compose");
    }
  }

  function editInOwnWords() {
    setPhase("editing");
    setShowContext(false);
  }

  function holdDraft() {
    const until = Date.now() + 10 * 60 * 1_000;
    setHeldUntil(until);
    setRemainingSeconds(10 * 60);
    setPhase("held");
  }

  function sendAnyway() {
    setPhase("sent");
  }

  function reset() {
    setDraft(sampleDraft);
    setResult(null);
    setShowContext(false);
    setError("");
    setSupportUrl("");
    setSafetyStopped(false);
    setHeldUntil(null);
    setRemainingSeconds(10 * 60);
    setPhase("compose");
  }

  const composerOpen = phase === "compose" || phase === "loading" || phase === "editing";

  return (
    <main className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Selah Before Send home">
          <span className="wordmark-mark" aria-hidden="true">
            ||
          </span>
          <span>SELAH / BEFORE SEND</span>
        </Link>
        <div className="header-note">
          <span className="pulse" aria-hidden="true" />
          private-facing · never auto-posts
        </div>
      </header>

      <section className="product-intro">
        <div className="eyebrow">
          <span>01</span>
          <span>A pause inside the conversation</span>
        </div>
        <h1>
          Before it leaves
          <br />
          <em>your hands.</em>
        </h1>
        <p>
          Selah meets you where conflict already happens. It never inserts
          model-written text into your reply or posts a verse. It creates one
          private-facing beat to listen, reflect, and choose again.
        </p>
      </section>

      <section className="demo-shell" aria-label="Selah social reply prototype">
        <div className="social-window">
          <div className="window-bar">
            <div className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>Conversation</span>
            <div className="selah-status">
              <b aria-hidden="true">S</b>
              Selah on
            </div>
          </div>

          <article className="post-card">
            <div className="avatar" aria-hidden="true">
              M
            </div>
            <div className="post-body">
              <div className="post-meta">
                <strong>Mara Chen</strong>
                <span>@marach · 2m</span>
              </div>
              <p>{samplePost}</p>
              <div className="post-actions" aria-label="Post engagement">
                <span>◌ 18</span>
                <span>↗ 7</span>
                <span>♡ 63</span>
              </div>
            </div>
          </article>

          {composerOpen ? (
            <form className="reply-composer" onSubmit={pauseBeforeSend}>
              <div className="avatar is-you" aria-hidden="true">
                Y
              </div>
              <div className="composer-body">
                <label htmlFor="reply">Reply to Mara</label>
                <textarea
                  id="reply"
                  value={draft}
                  rows={5}
                  maxLength={500}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={phase === "loading"}
                />

                {phase === "editing" && result ? (
                  <div className="edit-coach" role="note">
                    <span>KEEP IT YOURS</span>
                    <p>{result.reflection.editPrompt}</p>
                    <ol>
                      {result.reflection.threeMoves.map((move) => (
                        <li key={move}>{move}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                <p className="processing-note">
                  In live mode, pausing sends this post and draft to Gloo AI
                  Studio for processing under its{" "}
                  <a
                    href="https://gloo.com/legal/ai-studio-supplemental-terms-of-service"
                    target="_blank"
                    rel="noreferrer"
                  >
                    provider terms
                  </a>
                  . Without live credentials, only the supplied sample can
                  replay the labeled preview; edited drafts receive no
                  reflection. Selah never posts to the social network.
                </p>

                <div className="composer-actions">
                  <span>{draft.length}/500</span>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={sendAnyway}
                    disabled={phase === "loading"}
                  >
                    {safetyStopped ? "Send without Selah" : "Send without pause"}
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={phase === "loading"}
                  >
                    <span>
                      {phase === "loading"
                        ? "Opening Selah"
                        : safetyStopped
                          ? "Recheck this draft"
                          : "Pause before sending"}
                    </span>
                    <span aria-hidden="true">{phase === "loading" ? "•••" : "||"}</span>
                  </button>
                </div>
                {error ? (
                  <div className="form-error" role="alert">
                    <p>{error}</p>
                    {supportUrl ? (
                      <a href={supportUrl} target="_blank" rel="noreferrer">
                        Find a verified helpline in your country
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </form>
          ) : null}

          {phase === "held" ? (
            <div className="outcome-card held-card" role="status">
              <span className="outcome-icon" aria-hidden="true">
                ||
              </span>
              <div>
                <span>DRAFT HELD</span>
                <h2>{formatRemaining(remainingSeconds)} remaining.</h2>
                <p>Your words are still yours. This app did not save or post them.</p>
                <button type="button" onClick={editInOwnWords}>
                  Return to the draft now
                </button>
              </div>
            </div>
          ) : null}

          {phase === "sent" ? (
            <div className="outcome-card sent-card" role="status">
              <span className="outcome-icon" aria-hidden="true">
                ↗
              </span>
              <div>
                <span>YOUR CHOICE REMAINS YOURS</span>
                <h2>Your final words stay yours.</h2>
                <p>
                  This prototype does not connect to a real social account, so
                  nothing was posted.
                </p>
                <button type="button" onClick={reset}>
                  Reset the demo
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside
          ref={panelRef}
          className={`selah-panel ${phase === "pause" ? "is-open" : ""}`}
          tabIndex={-1}
          aria-live="polite"
        >
          {phase !== "pause" || !result ? (
            <>
              <div className="panel-index">WHY THIS MOMENT</div>
              <h2>Scripture as conversation, not broadcast.</h2>
              <p className="panel-lede">
                The most consequential digital moments are often measured in
                seconds. Selah brings Scripture into that threshold—privately,
                without hijacking the user’s voice.
              </p>
              <div className="principles">
                <div>
                  <span>01</span>
                  <p>
                    Displayed Bible text comes only from YouVersion or the pinned
                    exact preview fixture.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <p>Never auto-post Scripture into someone else’s feed.</p>
                </div>
                <div>
                  <span>03</span>
                  <p>Always leave the final words and decision with you.</p>
                </div>
              </div>
              <div className="api-line">
                <span>Powered by</span>
                <strong>YouVersion Platform</strong>
                <i>+</i>
                <strong>Gloo AI Studio</strong>
              </div>
            </>
          ) : (
            <>
              <div className="panel-topline">
                <span>
                  {result.source === "live"
                    ? "LIVE API PATH"
                    : "CURATED OFFLINE PREVIEW"}
                </span>
                <button type="button" onClick={() => setPhase("compose")}>
                  Close
                </button>
              </div>

              <div className="assessment">
                <div>
                  <span>CONVERSATION TEMPERATURE</span>
                  <strong>{result.assessment.temperature}</strong>
                </div>
                <div>
                  <span>WHAT THE DRAFT IS PROTECTING</span>
                  <strong>{result.assessment.underlyingNeed}</strong>
                </div>
              </div>

              <blockquote>
                <p>“{result.passage.content}”</p>
                <footer>
                  <cite>{result.passage.reference}</cite>
                  <span>{result.passage.version}</span>
                </footer>
              </blockquote>

              <button
                className="context-toggle"
                type="button"
                onClick={() => setShowContext((value) => !value)}
                aria-expanded={showContext}
                aria-controls="passage-context"
              >
                {showContext ? "Hide passage context" : "Read passage context"}
                <span aria-hidden="true">{showContext ? "−" : "+"}</span>
              </button>

              {showContext ? (
                <div className="passage-context" id="passage-context">
                  <span>{result.passage.contextReference}</span>
                  <p>{result.passage.context}</p>
                </div>
              ) : null}

              <div className="private-question">
                <span>A PRIVATE QUESTION</span>
                <h2>{result.reflection.question}</h2>
              </div>

              <div className="decision-buttons">
                <button className="primary-button" type="button" onClick={editInOwnWords}>
                  <span>Edit in my own words</span>
                  <span aria-hidden="true">↙</span>
                </button>
                <button type="button" onClick={holdDraft}>
                  Pause 10 minutes
                </button>
                <button type="button" onClick={sendAnyway}>
                  Send anyway
                </button>
              </div>
              <p className="copyright">{result.passage.copyright}</p>
            </>
          )}
        </aside>
      </section>

      <section className="architecture-strip" aria-label="How Selah works">
        <span>THE PROVENANCE CHAIN</span>
        <div>
          <article>
            <b>01</b>
            <h3>Read the temperature</h3>
            <p>
              Gloo classifies tension, underlying need, and a bounded semantic
              risk signal. Any risk stops the reflection path.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Retrieve, never invent</h3>
            <p>YouVersion returns the exact passage, context, version, and attribution.</p>
          </article>
          <article>
            <b>03</b>
            <h3>Reflect, never replace</h3>
            <p>
              Gloo is instructed to ground one private question in that text. No
              model text is inserted into the reply.
            </p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <p>
          An opt-in interaction prototype for <strong>Scripture in New Frontiers</strong>.
          No account. Selah does not persist drafts or post messages.
        </p>
        <span>SELAH / 2026</span>
      </footer>
    </main>
  );
}
