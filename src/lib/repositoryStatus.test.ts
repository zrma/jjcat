import { describe, expect, it } from "vitest";
import {
  compactStateLabel,
  isDisconnectedState,
  repositoryState,
  stateLabel,
} from "./repositoryStatus";
import type { CachedProjection } from "../types";

const cache = {
  cachedAt: new Date().toISOString(),
} as CachedProjection;

describe("repositoryState", () => {
  it("marks an unreachable SSH repository as disconnected", () => {
    expect(
      repositoryState(
        "remote",
        "ssh",
        undefined,
        new Set(),
        {},
        { remote: { kind: "driver", message: "connection failed" } },
      ),
    ).toBe("disconnected");
  });

  it("preserves the cached distinction for a disconnected SSH repository", () => {
    expect(
      repositoryState(
        "remote",
        "ssh",
        cache,
        new Set(),
        {},
        { remote: { kind: "driver", message: "connection failed" } },
      ),
    ).toBe("disconnected-cached");
  });

  it("does not describe a local refresh failure as disconnected", () => {
    expect(
      repositoryState(
        "local",
        "local",
        cache,
        new Set(),
        {},
        { local: { kind: "driver", message: "refresh failed" } },
      ),
    ).toBe("failed-cached");
  });

  it("classifies a busy refresh as visible waiting activity", () => {
    expect(
      repositoryState(
        "local",
        "local",
        cache,
        new Set(),
        {},
        { local: { kind: "busy", message: "repository mutation is active" } },
      ),
    ).toBe("waiting-cached");
    expect(stateLabel("waiting-cached")).toBe("Waiting to refresh");
    expect(compactStateLabel("waiting-cached")).toBe("Waiting");
  });

  it("keeps disconnected labels explicit", () => {
    expect(stateLabel("disconnected")).toBe("Disconnected");
    expect(compactStateLabel("disconnected-cached")).toBe(
      "Disconnected · Cached",
    );
    expect(isDisconnectedState("disconnected-cached")).toBe(true);
    expect(isDisconnectedState("failed-cached")).toBe(false);
  });
});
