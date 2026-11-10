"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { parseMovie } from "@/lib/validation";

export type OnboardingState = { error?: string; value?: string };

/**
 * Save the favorite movie for the signed-in user.
 *
 * Server actions are public HTTP endpoints, so this re-checks the session
 * and re-validates the input itself rather than trusting the page or form.
 */
export async function saveFavoriteMovie(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const raw = formData.get("movie");
  const parsed = parseMovie(raw);
  if (!parsed.ok) {
    return {
      error: parsed.error,
      value: typeof raw === "string" ? raw.slice(0, 200) : "",
    };
  }

  // Scoped to the session user, and only while no movie is set: onboarding
  // is first-time only, so a replayed request cannot overwrite the movie.
  await prisma.user.updateMany({
    where: { id: userId, favoriteMovie: null },
    data: { favoriteMovie: parsed.value },
  });

  redirect("/dashboard");
}
