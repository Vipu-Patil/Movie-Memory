import { NextResponse } from "next/server";
import {
  FactUnavailableError,
  NoFavoriteMovieError,
  factService,
} from "@/lib/facts";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Shape returned to the browser. Deliberately excludes userId. */
export type FactResponse = {
  fact: { id: string; movie: string; content: string; createdAt: string };
  source: "cache" | "generated" | "stale";
  cachedUntil: string;
};

export type FactErrorResponse = { error: string; code: string };

const noStore = { "Cache-Control": "no-store" };

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json<FactErrorResponse>(
    { error, code },
    { status, headers: noStore },
  );
}

/**
 * GET /api/fact - a fun fact about the signed-in user's favorite movie.
 *
 * The endpoint takes no parameters: the user comes from the session cookie
 * and nothing in the request can point it at a different user's data.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return errorResponse(401, "UNAUTHENTICATED", "Please sign in.");
  }

  try {
    const { fact, source, cachedUntil } = await factService.getFact(userId);
    return NextResponse.json<FactResponse>(
      {
        fact: {
          id: fact.id,
          movie: fact.movie,
          content: fact.content,
          createdAt: fact.createdAt.toISOString(),
        },
        source,
        cachedUntil: cachedUntil.toISOString(),
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof NoFavoriteMovieError) {
      return errorResponse(
        409,
        "NO_FAVORITE_MOVIE",
        "Pick a favorite movie first.",
      );
    }
    if (error instanceof FactUnavailableError) {
      return errorResponse(
        503,
        "FACT_UNAVAILABLE",
        "We couldn't come up with a fact right now. Please try again in a moment.",
      );
    }
    console.error("[api/fact] unexpected error:", error);
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
    );
  }
}
