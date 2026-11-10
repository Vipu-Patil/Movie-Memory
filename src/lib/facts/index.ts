import { generateMovieFact } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { createPrismaFactStore } from "./prisma-store";
import { createFactService } from "./service";

/** The production fact service: Postgres store + OpenAI generator. */
export const factService = createFactService({
  store: createPrismaFactStore(prisma),
  generate: generateMovieFact,
  onError: (error) => console.error("[facts] generation failed:", error),
});

export {
  FactUnavailableError,
  NoFavoriteMovieError,
  type FactResult,
  type FactSource,
} from "./service";
