import { useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AlertTriangle,
  Binary,
  ChevronLeft,
  ChevronRight,
  FileClock,
  GitCommitHorizontal,
} from "lucide-react";
import { bridge, isTauriRuntime } from "../bridge";
import { absoluteTime, relativeTime } from "../lib/format";
import {
  groupAnnotationLines,
  mergeFileHistory,
  type FileTimelineRequest,
} from "../lib/fileTimeline";
import type { FileHistoryEntry, FileTimelineProjection } from "../types";
import { CliSpinner } from "./CliSpinner";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function shortCommit(commitId: string) {
  return commitId.slice(0, 8);
}

export function FileTimelineWindow({ request }: { request: FileTimelineRequest }) {
  const [activeRevision, setActiveRevision] = useState({
    changeId: request.changeId,
    commitId: request.commitId,
  });
  const [projection, setProjection] = useState<FileTimelineProjection | null>(null);
  const [historyCatalog, setHistoryCatalog] = useState<FileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Blame · ${request.path} — ${request.repositoryName}`;
  }, [request.path, request.repositoryName]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void bridge
      .loadFileTimeline({
        repositoryId: request.repositoryId,
        changeId: activeRevision.changeId,
        commitId: activeRevision.commitId,
        path: request.path,
      })
      .then((next) => {
        if (!active) return;
        setProjection(next);
        setHistoryCatalog((current) => mergeFileHistory(current, next.history));
      })
      .catch((nextError: unknown) => {
        if (active) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeRevision.changeId, activeRevision.commitId, request.path, request.repositoryId]);

  const history = historyCatalog;
  const currentIndex = Math.max(
    0,
    history.findIndex((entry) => entry.commitId === activeRevision.commitId),
  );
  const chronological = useMemo(
    () => [...history].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)),
    [history],
  );
  const chronologicalIndex = Math.max(
    0,
    chronological.findIndex((entry) => entry.commitId === activeRevision.commitId),
  );
  const groups = useMemo(
    () => groupAnnotationLines(projection?.lines ?? []),
    [projection?.lines],
  );

  const selectRevision = (entry: FileHistoryEntry | undefined) => {
    if (!entry || entry.commitId === activeRevision.commitId) return;
    setActiveRevision({ changeId: entry.changeId, commitId: entry.commitId });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, select, textarea, [contenteditable='true'], [role='textbox']")
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (isTauriRuntime) void getCurrentWebviewWindow().close();
        else window.close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectRevision(history[currentIndex + 1]);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectRevision(history[currentIndex - 1]);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  return (
    <main className="file-timeline-window">
      <header className="file-timeline-header">
        <FileClock aria-hidden="true" />
        <strong title={request.path}>Blame · {request.path}</strong>
        <span>{request.repositoryName}</span>
        <div className="file-timeline-revision-controls">
          <button
            type="button"
            title="Older file revision (←)"
            aria-label="Show older file revision"
            disabled={!history[currentIndex + 1] || loading}
            onClick={() => selectRevision(history[currentIndex + 1])}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Newer file revision (→)"
            aria-label="Show newer file revision"
            disabled={!history[currentIndex - 1] || loading}
            onClick={() => selectRevision(history[currentIndex - 1])}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <select
            aria-label="File revision"
            value={activeRevision.commitId}
            disabled={history.length === 0}
            onChange={(event) =>
              selectRevision(history.find((entry) => entry.commitId === event.target.value))
            }
          >
            {history.map((entry) => (
              <option key={entry.commitId} value={entry.commitId}>
                {shortCommit(entry.commitId)} · {entry.summary} · {relativeTime(entry.timestamp)}
              </option>
            ))}
          </select>
        </div>
      </header>
      <section className="file-timeline-ruler" aria-label="File history timeline">
        <div>
          <span>{chronological[0] ? new Date(chronological[0].timestamp).getFullYear() : ""}</span>
          <span>
            {chronological.at(-1) ? new Date(chronological.at(-1)!.timestamp).getFullYear() : ""}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, chronological.length - 1)}
          value={chronologicalIndex}
          disabled={chronological.length < 2 || loading}
          aria-label="Select file revision on timeline"
          onChange={(event) => selectRevision(chronological[Number(event.target.value)])}
        />
      </section>
      {loading ? (
        <section className="file-timeline-state" aria-live="polite">
          <CliSpinner />
          Loading line provenance…
        </section>
      ) : error ? (
        <section className="file-timeline-state error" role="alert">
          <AlertTriangle aria-hidden="true" />
          {error}
        </section>
      ) : projection?.binary ? (
        <section className="file-timeline-state">
          <Binary aria-hidden="true" />
          Binary files do not have a line timeline.
        </section>
      ) : (
        <section className="file-blame-surface" aria-label="Line provenance">
          {projection?.truncated ? (
            <p className="file-timeline-notice">Only the bounded beginning of this file is shown.</p>
          ) : null}
          {groups.length ? (
            groups.map((group, groupIndex) => {
              const sourceRevision = history.find((entry) => entry.commitId === group.commitId);
              const current = group.commitId === activeRevision.commitId;
              return (
                <article
                  className={`file-blame-group ${current ? "current" : ""}`}
                  key={`${group.commitId}:${group.lines[0]?.lineNumber ?? groupIndex}`}
                >
                  <button
                    type="button"
                    className="file-blame-provenance"
                    disabled={!sourceRevision || current}
                    onClick={() => selectRevision(sourceRevision)}
                    title={`${group.summary}\n${absoluteTime(group.timestamp)}`}
                  >
                    <GitCommitHorizontal aria-hidden="true" />
                    <span>
                      <strong>{group.summary || "(no description)"}</strong>
                      <small>{group.author} · {relativeTime(group.timestamp)}</small>
                    </span>
                    <code>{shortCommit(group.commitId)}</code>
                  </button>
                  <ol start={group.lines[0]?.lineNumber ?? 1}>
                    {group.lines.map((line) => (
                      <li key={line.lineNumber}>
                        <code>{line.content.replace(/\n$/, "") || " "}</code>
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })
          ) : (
            <div className="file-timeline-state">This file is empty in the selected revision.</div>
          )}
        </section>
      )}
    </main>
  );
}
