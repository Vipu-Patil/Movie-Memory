"use client";

import { useCallback, useEffect, useState } from "react";
import type { FactErrorResponse, FactResponse } from "@/app/api/fact/route";

type State =
  | { status: "loading"; previous?: FactResponse }
  | { status: "ready"; data: FactResponse }
  | { status: "error"; message: string };

export function FactCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState((current) => ({
      status: "loading",
      previous: current.status === "ready" ? current.data : undefined,
    }));

    try {
      const response = await fetch("/api/fact", { cache: "no-store" });

      if (response.status === 401) {
        // Session expired in this tab: go back to the login page.
        window.location.assign("/");
        return;
      }

      const body = (await response.json()) as FactResponse | FactErrorResponse;
      if (!response.ok || "error" in body) {
        setState({
          status: "error",
          message:
            "error" in body ? body.error : "Something went wrong. Try again.",
        });
        return;
      }
      setState({ status: "ready", data: body });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Check your connection and retry.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown =
    state.status === "ready"
      ? state.data
      : state.status === "loading"
        ? state.previous
        : undefined;

  return (
    <div className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm uppercase tracking-[0.3em] text-marquee">
          Fun fact
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.status === "loading"}
          className="rounded-full border border-line px-4 py-1.5 text-sm text-muted transition hover:border-muted hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marquee disabled:opacity-50"
        >
          {state.status === "loading" ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 min-h-20" aria-live="polite">
        {state.status === "error" && (
          <p role="alert" className="text-red-300">
            {state.message}
          </p>
        )}

        {!shown && state.status === "loading" && (
          <div className="space-y-2" aria-label="Loading a fun fact">
            <div className="h-4 w-full animate-pulse rounded bg-line" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-line" />
          </div>
        )}

        {shown && (
          <>
            <p
              className={`text-lg leading-relaxed ${
                state.status === "loading" ? "opacity-50" : ""
              }`}
            >
              {shown.fact.content}
            </p>
            <p className="mt-3 text-xs text-muted">
              {sourceNote(shown.source)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function sourceNote(source: FactResponse["source"]) {
  switch (source) {
    case "generated":
      return "Freshly generated. A new fact is available after 60 seconds.";
    case "cache":
      return "Generated within the last minute. A new fact is available after 60 seconds.";
    case "stale":
      return "We couldn't get a new fact just now, so here's your most recent one.";
  }
}
