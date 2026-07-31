import { describe, expect, it } from "vitest";
import { repositoryRefreshNoticeModel } from "./RepositoryRefreshNotice";

describe("repositoryRefreshNoticeModel", () => {
  it("presents a busy refresh as visible queued activity", () => {
    expect(
      repositoryRefreshNoticeModel({
        error: { kind: "busy", message: "repository mutation is active" },
        hasCache: true,
        retryAt: 25_000,
        now: 10_000,
      }),
    ).toEqual({
      tone: "activity",
      message: "Refresh waiting for repository operation.",
      cacheLabel: "Showing cached data.",
      retryLabel: "Retrying in 15s.",
    });
  });

  it("keeps actual refresh failures visually classified as warnings", () => {
    expect(
      repositoryRefreshNoticeModel({
        error: { kind: "driver", message: "connection failed" },
        hasCache: false,
        retryAt: 40_001,
        now: 10_000,
      }),
    ).toEqual({
      tone: "warning",
      message: "connection failed",
      cacheLabel: null,
      retryLabel: "Background retry in 31s.",
    });
  });
});
