import { z } from "zod";

export const MOVIE_MIN_LENGTH = 1;
export const MOVIE_MAX_LENGTH = 100;

// Control characters have no place in a movie title and could be used to
// smuggle odd content into the OpenAI prompt.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Server-side validation for the favorite movie.
 * Normalises first (collapse whitespace runs, trim), then checks length, so
 * "   " is rejected as empty and "Blade   Runner" is stored as "Blade Runner".
 */
export const movieSchema = z
  .string({ error: "Please enter a movie title." })
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(MOVIE_MIN_LENGTH, "Please enter a movie title.")
      .max(
        MOVIE_MAX_LENGTH,
        `Movie title must be ${MOVIE_MAX_LENGTH} characters or fewer.`,
      )
      .refine((value) => !CONTROL_CHARS.test(value), {
        message: "Movie title contains invalid characters.",
      }),
  );

export type MovieParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseMovie(input: unknown): MovieParseResult {
  const result = movieSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues[0]?.message ?? "Invalid movie title.",
  };
}
