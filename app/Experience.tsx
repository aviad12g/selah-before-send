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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (phase !== "held" && phase !== "sent") return;
    const frame = requestAnimationFrame(() => outcomeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [phase]);

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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }

  function closePause() {
    setPhase("compose");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
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
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Selah Before Send home">
          <span className="wordmark-mark" aria-hidden="true">
            II
          </span>
          <span>
            SELAH
            <i>before send</i>
          </span>
        </Link>
        <div className="header-note">
          <span className="pulse" aria-hidden="true" />
          <span>Private by design</span>
          <b>Never auto-posts</b>
        </div>
      </header>

      <section className="opening" aria-labelledby="opening-title">
        <div className="opening-copy">
          <div className="eyebrow">
            <span>IN THE MOMENT</span>
            <span>The second before send</span>
          </div>
          <h1 id="opening-title">
            Before your words leave <em>your hands.</em>
          </h1>
          <p className="opening-lede">
            Selah opens one private pause inside a heated conversation.
            Scripture offers perspective; it never writes the reply.
          </p>
          <dl className="opening-trust">
            <div>
              <dt>Voice</dt>
              <dd>Always yours</dd>
            </div>
            <div>
              <dt>Scripture</dt>
              <dd>Exact, sourced text</dd>
            </div>
            <div>
              <dt>Posting</dt>
              <dd>Only by your choice</dd>
            </div>
          </dl>
        </div>

        <section className="demo-shell" aria-label="Selah social reply prototype">
          <div className="social-window">
            <div className="conversation-heading">
              <div>
                <span>DIRECT THREAD</span>
                <strong>Mara Chen</strong>
              </div>
              <span className="thread-time">2 minutes ago</span>
              <div className="selah-status">
                <b aria-hidden="true">II</b>
                Selah ready
              </div>
            </div>

            <article className="post-card">
              <div className="message-origin">
                <div className="avatar" aria-hidden="true">
                  M
                </div>
                <div className="post-meta">
                  <strong>Mara wrote</strong>
                  <span>@marach</span>
                </div>
              </div>
              <div className="post-body">
                <p>{samplePost}</p>
              </div>
              <span className="message-temperature" aria-label="Conversation tension is rising">
                tension rising
              </span>
            </article>

            {composerOpen ? (
              <form
                className="reply-composer"
                onSubmit={pauseBeforeSend}
                aria-busy={phase === "loading"}
              >
                <div className="composer-body">
                  <div className="draft-heading">
                    <label htmlFor="reply">Your reply</label>
                    <span>unsent · editable</span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    id="reply"
                    value={draft}
                    rows={5}
                    maxLength={500}
                    aria-describedby="draft-help draft-count"
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={phase === "loading"}
                  />
                  {phase === "loading" ? (
                    <span className="sr-only" role="status">
                      Selah is opening a private reflection. Nothing has been posted.
                    </span>
                  ) : null}
                  <p className="draft-help" id="draft-help">
                    Keep your voice. The pause only helps you decide what it should carry.
                  </p>

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

                  <details className="processing-note">
                    <summary>What happens when I pause?</summary>
                    <p>
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
                  </details>

                  <div className="composer-actions">
                    <span id="draft-count" aria-live="polite">
                      {draft.length} / 500
                    </span>
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
                      <span aria-hidden="true">{phase === "loading" ? "•••" : "II"}</span>
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
              <div
                ref={outcomeRef}
                className="outcome-card held-card"
                tabIndex={-1}
                aria-labelledby="held-title"
              >
                <span className="outcome-icon" aria-hidden="true">
                  II
                </span>
                <div>
                  <span>DRAFT HELD</span>
                  <h2 id="held-title">{formatRemaining(remainingSeconds)} remaining.</h2>
                  <p>Your words are still yours. This app did not save or post them.</p>
                  <button type="button" onClick={editInOwnWords}>
                    Return to the draft now
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "sent" ? (
              <div
                ref={outcomeRef}
                className="outcome-card sent-card"
                role="status"
                tabIndex={-1}
                aria-labelledby="sent-title"
              >
                <span className="outcome-icon" aria-hidden="true">
                  ↗
                </span>
                <div>
                  <span>YOUR CHOICE REMAINS YOURS</span>
                  <h2 id="sent-title">Your final words stay yours.</h2>
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
            aria-label="Selah reflection panel"
          >
            {phase !== "pause" || !result ? (
              <>
                <div className="panel-index">AT THIS THRESHOLD</div>
                <h2>A pause, not a ghostwriter.</h2>
                <p className="panel-lede">
                  Selah lets the tension be seen without letting technology take
                  over the conversation.
                </p>
                <div className="principles">
                  <div>
                    <span>LISTEN</span>
                    <p>Read the heat and the need beneath the draft.</p>
                  </div>
                  <div>
                    <span>RETRIEVE</span>
                    <p>Bring in exact Scripture from YouVersion—never invented text.</p>
                  </div>
                  <div>
                    <span>RETURN</span>
                    <p>Give the question and the final words back to you.</p>
                  </div>
                </div>
                <div className="api-line">
                  <span>Grounded through</span>
                  <strong>YouVersion Platform</strong>
                  <i aria-hidden="true">×</i>
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
                  <button type="button" onClick={closePause}>
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
      </section>

      <section className="architecture-strip" aria-labelledby="provenance-title">
        <div className="architecture-heading">
          <span>THE PROVENANCE CHAIN</span>
          <h2 id="provenance-title">
            Three bounded stages. One verified text. <em>Zero ghostwriting.</em>
          </h2>
        </div>
        <div className="architecture-steps">
          <article>
            <b>01 / READ</b>
            <h3>Notice what is happening</h3>
            <p>
              Gloo classifies tension, underlying need, and a bounded semantic
              risk signal. Any risk stops the reflection path.
            </p>
          </article>
          <article>
            <b>02 / RETRIEVE</b>
            <h3>Use the text as written</h3>
            <p>YouVersion returns the exact passage, context, version, and attribution.</p>
          </article>
          <article>
            <b>03 / REFLECT</b>
            <h3>Return choice to the person</h3>
            <p>
              Gloo grounds one private question in that text. No model text is
              inserted into the reply.
            </p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <p>
          An opt-in interaction prototype for <strong>Scripture in New Frontiers</strong>.
          No account. No draft storage. No automatic posting.
        </p>
        <span>SELAH / 2026</span>
      </footer>
    </main>
  );
}
