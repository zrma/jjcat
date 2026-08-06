import { describe, expect, it } from "vitest";
import {
  INITIAL_TRANSIENT_NOTICE_STATE,
  reduceTransientNotice,
} from "./useTransientNotice";

describe("transient notice lifecycle", () => {
  it("assigns a new sequence when the same action runs again", () => {
    const first = reduceTransientNotice(INITIAL_TRANSIENT_NOTICE_STATE, {
      type: "show",
      message: "Show in Finder: src/file.ts",
    });
    const repeated = reduceTransientNotice(first, {
      type: "show",
      message: "Show in Finder: src/file.ts",
    });

    expect(repeated).toEqual({
      sequence: first.sequence + 1,
      message: first.message,
    });
  });

  it("expires only the notice owned by the current timer", () => {
    const first = reduceTransientNotice(INITIAL_TRANSIENT_NOTICE_STATE, {
      type: "show",
      message: "Copied path: src/first.ts",
    });
    const latest = reduceTransientNotice(first, {
      type: "show",
      message: "Copied path: src/latest.ts",
    });

    expect(
      reduceTransientNotice(latest, { type: "expire", sequence: first.sequence }),
    ).toBe(latest);
    expect(
      reduceTransientNotice(latest, { type: "expire", sequence: latest.sequence }),
    ).toEqual({ sequence: latest.sequence, message: null });
  });
});
