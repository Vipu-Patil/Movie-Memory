import { describe, expect, it } from "vitest";
import { MOVIE_MAX_LENGTH, parseMovie } from "@/lib/validation";

describe("parseMovie", () => {
  it("trims and collapses whitespace", () => {
    expect(parseMovie("  Blade \t  Runner \n")).toEqual({
      ok: true,
      value: "Blade Runner",
    });
  });

  it("rejects empty and whitespace-only input", () => {
    expect(parseMovie("").ok).toBe(false);
    expect(parseMovie("     ").ok).toBe(false);
  });

  it("enforces the max length after trimming", () => {
    expect(parseMovie(` ${"a".repeat(MOVIE_MAX_LENGTH)} `).ok).toBe(true);
    expect(parseMovie("a".repeat(MOVIE_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it("rejects non-string input and control characters", () => {
    expect(parseMovie(null).ok).toBe(false);
    expect(parseMovie(42).ok).toBe(false);
    expect(parseMovie("Al\u0000ien").ok).toBe(false);
  });
});
