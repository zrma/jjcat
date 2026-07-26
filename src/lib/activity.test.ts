import { describe, expect, it } from "vitest";
import {
  activityDurationMs,
  appendActivity,
  finishActivity,
  preferredActivity,
  type ActivityEntry,
} from "./activity";

function entry(
  id: string,
  state: ActivityEntry["state"] = "running",
  repositoryId = "repository-a",
  category: ActivityEntry["category"] = "user",
): ActivityEntry {
  return {
    id,
    repositoryId,
    repositoryName: repositoryId,
    title: "Refresh repository",
    detail: "Refresh repository projection",
    category,
    state,
    startedAt: "2026-07-26T00:00:00.000Z",
    finishedAt: state === "running" ? null : "2026-07-26T00:00:01.000Z",
    outcome: null,
    cancellable: state === "running",
    requestId: null,
  };
}

describe("activity history", () => {
  it("keeps newest entries first and bounded", () => {
    const result = appendActivity(
      [entry("previous", "success")],
      entry("latest"),
      1,
    );
    expect(result.map((item) => item.id)).toEqual(["latest"]);
  });

  it("finishes one entry without changing the rest", () => {
    const result = finishActivity(
      [entry("latest"), entry("previous")],
      "latest",
      "success",
      "Repository is up to date",
      "2026-07-26T00:00:02.000Z",
    );
    expect(result[0]).toMatchObject({
      state: "success",
      outcome: "Repository is up to date",
      cancellable: false,
    });
    expect(result[1].state).toBe("running");
  });

  it("prefers a running activity for the selected repository", () => {
    const result = preferredActivity(
      [
        entry("background", "running", "repository-b", "background"),
        entry("selected", "running", "repository-a", "background"),
      ],
      "repository-a",
    );
    expect(result?.id).toBe("selected");
  });

  it("keeps the latest selected user action ahead of background completions", () => {
    const result = preferredActivity(
      [
        entry("background", "success", "repository-a", "background"),
        entry("user", "success", "repository-a", "user"),
      ],
      "repository-a",
    );
    expect(result?.id).toBe("user");
  });

  it("still surfaces a running background task over completed work", () => {
    const result = preferredActivity(
      [
        entry("background", "running", "repository-b", "background"),
        entry("user", "success", "repository-a", "user"),
      ],
      "repository-a",
    );
    expect(result?.id).toBe("background");
  });

  it("computes a stable finished duration", () => {
    expect(activityDurationMs(entry("finished", "success"))).toBe(1_000);
  });
});
