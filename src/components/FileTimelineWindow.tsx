import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AlertTriangle,
  Binary,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  FileClock,
  GitCommitHorizontal,
} from "lucide-react";
import { bridge, isTauriRuntime } from "../bridge";
import { absoluteTime, relativeTime } from "../lib/format";
import {
  buildFileTimelineScale,
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

function monthAndYear(timestamp: string | undefined) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function timelineAlignment(position: number) {
  if (position < 18) return "start";
  if (position > 82) return "end";
  return "center";
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
  const [rulerWidth, setRulerWidth] = useState(960);
  const [previewClusterId, setPreviewClusterId] = useState<string | null>(null);
  const [openClusterId, setOpenClusterId] = useState<string | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);

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
  const timelineScale = useMemo(
    () => buildFileTimelineScale(history, rulerWidth),
    [history, rulerWidth],
  );
  const activePoint = timelineScale?.points.find(
    (point) => point.entry.commitId === activeRevision.commitId,
  );
  const previewCluster = timelineScale?.clusters.find(
    (cluster) => cluster.id === (previewClusterId ?? openClusterId),
  );
  const openCluster = timelineScale?.clusters.find(
    (cluster) => cluster.id === openClusterId,
  );
  const previewEntry = previewCluster?.entries.find(
    (entry) => entry.commitId === activeRevision.commitId,
  ) ?? previewCluster?.entries[0];
  const tickLabelStep = Math.max(
    1,
    Math.ceil((timelineScale?.ticks.length ?? 0) / Math.max(1, Math.floor(rulerWidth / 30))),
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
    const ruler = rulerRef.current;
    if (!ruler) return;
    const updateWidth = () => setRulerWidth(Math.max(1, ruler.clientWidth));
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(ruler);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (openClusterId && !openCluster) setOpenClusterId(null);
  }, [openCluster, openClusterId]);

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
        <div
          className={`file-timeline-ruler-summary ${previewEntry ? "previewing" : ""}`}
          aria-live="polite"
        >
          {previewEntry && previewCluster ? (
            <>
              <GitCommitHorizontal aria-hidden="true" />
              <strong>{previewEntry.summary || "(no description)"}</strong>
              <span>{previewEntry.author} · {absoluteTime(previewEntry.timestamp)}</span>
              <code>{shortCommit(previewEntry.commitId)}</code>
              {previewCluster.entries.length > 1 ? (
                <em>+{previewCluster.entries.length - 1} nearby</em>
              ) : null}
            </>
          ) : (
            <>
              <span>
                <strong>{history.length}</strong> file revision{history.length === 1 ? "" : "s"}
              </span>
              <span>
                {monthAndYear(timelineScale?.points[0]?.entry.timestamp)}
                {timelineScale && timelineScale.points.length > 1 ? " — " : ""}
                {monthAndYear(timelineScale?.points.at(-1)?.entry.timestamp)}
              </span>
              <span>Hover to preview · Click to navigate</span>
            </>
          )}
        </div>
        <div
          className="file-timeline-scale"
          ref={rulerRef}
          onClick={() => {
            setOpenClusterId(null);
            setPreviewClusterId(null);
          }}
          onPointerLeave={() => setPreviewClusterId(null)}
        >
          <div className="file-timeline-axis" aria-hidden="true" />
          {timelineScale?.ticks.map((tick, index) => (
            <span
              className={`file-timeline-tick ${tick.major ? "major" : ""}`}
              key={tick.key}
              style={{ "--timeline-position": `${tick.position}%` } as CSSProperties}
              aria-hidden="true"
            >
              {tick.major || index % tickLabelStep === 0 ? tick.label : ""}
            </span>
          ))}
          {timelineScale?.years.map((year) => (
            <span
              className="file-timeline-year"
              key={year.year}
              style={{ "--timeline-position": `${year.position}%` } as CSSProperties}
              aria-hidden="true"
            >
              {year.year}
            </span>
          ))}
          {activePoint ? (
            <span
              className="file-timeline-selection-cursor"
              style={{ "--timeline-position": `${activePoint.position}%` } as CSSProperties}
              aria-hidden="true"
            />
          ) : null}
          {timelineScale?.clusters.map((cluster) => {
            const active = cluster.entries.some(
              (entry) => entry.commitId === activeRevision.commitId,
            );
            const clustered = cluster.entries.length > 1;
            const label = clustered
              ? `${cluster.entries.length} nearby file revisions`
              : `${shortCommit(cluster.entries[0].commitId)}: ${cluster.entries[0].summary}`;
            return (
              <button
                type="button"
                className={`file-timeline-marker ${active ? "active" : ""} ${clustered ? "clustered" : ""}`}
                key={cluster.id}
                style={{ "--timeline-position": `${cluster.position}%` } as CSSProperties}
                aria-label={label}
                aria-haspopup={clustered ? "menu" : undefined}
                aria-expanded={clustered ? openClusterId === cluster.id : undefined}
                disabled={loading}
                onPointerEnter={() => setPreviewClusterId(cluster.id)}
                onPointerLeave={() => setPreviewClusterId(null)}
                onFocus={() => setPreviewClusterId(cluster.id)}
                onBlur={() => setPreviewClusterId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (clustered) {
                    setOpenClusterId((current) => current === cluster.id ? null : cluster.id);
                  } else {
                    setOpenClusterId(null);
                    selectRevision(cluster.entries[0]);
                  }
                }}
              >
                {clustered ? (
                  <span aria-hidden="true">{cluster.entries.length}</span>
                ) : active ? (
                  <CircleDot aria-hidden="true" />
                ) : (
                  <Circle aria-hidden="true" />
                )}
              </button>
            );
          })}
          {openCluster && openCluster.entries.length > 1 ? (
            <div
              className={`file-timeline-cluster-menu ${timelineAlignment(openCluster.position)}`}
              style={{ "--timeline-position": `${openCluster.position}%` } as CSSProperties}
              role="menu"
              aria-label="Nearby file revisions"
              onClick={(event) => event.stopPropagation()}
            >
              {openCluster.entries.map((entry) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={entry.commitId === activeRevision.commitId}
                  key={entry.commitId}
                  onClick={() => {
                    setOpenClusterId(null);
                    selectRevision(entry);
                  }}
                >
                  <span>
                    <strong>{entry.summary || "(no description)"}</strong>
                    <small>{entry.author} · {relativeTime(entry.timestamp)}</small>
                  </span>
                  <code>{shortCommit(entry.commitId)}</code>
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
