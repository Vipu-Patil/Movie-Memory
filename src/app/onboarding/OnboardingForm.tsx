"use client";

import { useActionState } from "react";
import { MOVIE_MAX_LENGTH } from "@/lib/validation";
import { saveFavoriteMovie, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    saveFavoriteMovie,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8" noValidate>
      <label htmlFor="movie" className="block text-sm text-muted">
        Favorite movie
      </label>
      <input
        id="movie"
        name="movie"
        type="text"
        required
        autoFocus
        autoComplete="off"
        // A hint for the browser only. The real check is on the server.
        maxLength={MOVIE_MAX_LENGTH}
        defaultValue={state.value ?? ""}
        placeholder="e.g. Spirited Away"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "movie-error" : undefined}
        className="mt-2 w-full rounded-lg border border-line bg-panel px-4 py-3 text-lg text-paper placeholder:text-muted/60 focus:border-marquee focus:outline-none"
      />
      {state.error && (
        <p id="movie-error" role="alert" className="mt-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-full bg-marquee px-6 py-3 font-medium text-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marquee disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
