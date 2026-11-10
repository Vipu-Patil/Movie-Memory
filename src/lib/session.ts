import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The id of the signed-in user, or null. Read from the verified session
 * cookie only. This is the single source of identity for every data access.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/**
 * The signed-in user's row, or null if signed out (or if the row no longer
 * exists). Deduplicated per request with React `cache`.
 */
export const getCurrentUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      favoriteMovie: true,
    },
  });
});
