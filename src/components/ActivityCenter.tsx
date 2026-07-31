import { createPortal } from "react-dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  CheckCircle2,
  CircleX,
  Clock3,
  LoaderCircle,
  Minus,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import {
  activityDurationMs,
  preferredActivity,
  type ActivityCategory,
  type ActivityEntry,
} from "../lib/activity";
import { relativeTime } from "../lib/format";
import { adjacentNavigationIndex } from "../lib/keyboardNavigation";
import { CliSpinner } from "./CliSpinner";

type ActivityFilter = "all" | ActivityCategory;

interface ActivityCenterProps {
  entries: ActivityEntry[];
  selectedRepositoryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (entry: ActivityEntry) => void;
  onClearCompleted: () => void;
  fallback?: ReactNode;
}

function statusLabel(entry: ActivityEntry) {
  switch (entry.state) {
    case "running":
      return "In progress";
    case "waiting":
      return "Waiting";
    case "success":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function statusIcon(entry: ActivityEntry) {
  switch (entry.state) {
    case "running":
      return <LoaderCircle className="spinning" aria-hidden="true" />;
    case "waiting":
      return <CliSpinner />;
    case "success":
      return <CheckCircle2 aria-hidden="true" />;
    case "failed":
      return <CircleX aria-hidden="true" />;
    case "cancelled":
      return <Minus aria-hidden="true" />;
  }
}

function durationLabel(entry: ActivityEntry, now: number) {
  const duration = activityDurationMs(entry, now);
  if (duration < 1_000) return `${duration}ms`;
  if (duration < 60_000) return `${(duration / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function ActivityCenter({
  entries,
  selectedRepositoryId,
  open,
  onOpenChange,
  onCancel,
  onClearCompleted,
  fallback = null,
}: ActivityCenterProps) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const activityListRef = useRef<HTMLDivElement>(null);
  const preferred = preferredActivity(entries, selectedRepositoryId);
  const filteredEntries = useMemo(
    () =>
      filter === "all"
        ? entries
        : entries.filter((entry) => entry.category === filter),
    [entries, filter],
  );
  const selected =
    filteredEntries.find((entry) => entry.id === selectedId) ??
    filteredEntries[0] ??
    null;

  useEffect(() => {
    if (!entries.some((entry) => entry.state === "running")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [entries]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const rows = Array.from(
        activityListRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-activity-id]",
        ) ?? [],
      );
      const selectedRow = rows.find(
        (row) => row.dataset.activityId === selected?.id,
      );
      (selectedRow ?? activityListRef.current)?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filter, open, selected?.id]);

  if (!preferred) return fallback;

  return (
    <>
      <div
        className={`activity-summary ${preferred.state}`}
        aria-live="polite"
      >
        <button
          type="button"
          className="activity-summary-main"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Open command activity"
          onClick={() => onOpenChange(!open)}
        >
          <span className="activity-summary-icon">
            {statusIcon(preferred)}
          </span>
          <span className="activity-summary-copy">
            <strong>{preferred.title}</strong>
            <small>
              {preferred.repositoryName} · {statusLabel(preferred)}
            </small>
          </span>
        </button>
        {preferred.state === "running" && preferred.cancellable ? (
          <button
            type="button"
            className="activity-summary-cancel"
            aria-label={`Cancel ${preferred.title}`}
            title="Cancel current task"
            onClick={() => onCancel(preferred)}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
        <span className="activity-progress" aria-hidden="true">
          <span />
        </span>
      </div>

      {open
        ? createPortal(
            <div
              className="activity-center-layer"
              role="presentation"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) onOpenChange(false);
              }}
            >
              <section
                className="activity-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby="activity-center-title"
              >
                <header className="activity-center-header">
                  <div>
                    <Activity aria-hidden="true" />
                    <span>
                      <h2 id="activity-center-title">Command activity</h2>
                      <small>Current session · safe summaries</small>
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="activity-clear"
                      onClick={onClearCompleted}
                      disabled={!entries.some((entry) => entry.state !== "running")}
                    >
                      <Trash2 aria-hidden="true" />
                      Clear completed
                    </button>
                    <button
                      type="button"
                      className="activity-close"
                      aria-label="Close command activity"
                      onClick={() => onOpenChange(false)}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div className="activity-center-body">
                  <aside className="activity-list-panel">
                    <div className="activity-filters" aria-label="Activity filters">
                      {(["all", "user", "background"] as const).map((value) => (
                        <button
                          type="button"
                          className={filter === value ? "selected" : ""}
                          aria-pressed={filter === value}
                          onClick={() => {
                            setFilter(value);
                            setSelectedId(null);
                          }}
                          key={value}
                        >
                          {value === "all"
                            ? "All"
                            : value === "user"
                              ? "User"
                              : "Background"}
                        </button>
                      ))}
                    </div>
                    <div
                      ref={activityListRef}
                      className="activity-list"
                      role="listbox"
                      aria-label="Command history"
                      tabIndex={0}
                      onPointerDown={(event) => {
                        const target = event.target;
                        const activityButton =
                          target instanceof Element
                            ? target.closest<HTMLButtonElement>(
                                "button[data-activity-id]",
                              )
                            : null;
                        if (activityButton) {
                          activityButton.focus({ preventScroll: true });
                          return;
                        }
                        event.currentTarget.focus({ preventScroll: true });
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowUp" &&
                          event.key !== "ArrowDown"
                        ) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        const currentIndex = filteredEntries.findIndex(
                          (entry) => entry.id === selected?.id,
                        );
                        const nextIndex = adjacentNavigationIndex(
                          filteredEntries.length,
                          currentIndex,
                          event.key === "ArrowDown" ? 1 : -1,
                        );
                        const next = filteredEntries[nextIndex];
                        if (!next) return;
                        setSelectedId(next.id);
                        const button = Array.from(
                          event.currentTarget.querySelectorAll<HTMLButtonElement>(
                            "button[data-activity-id]",
                          ),
                        ).find(
                          (row) => row.dataset.activityId === next.id,
                        );
                        button?.focus({ preventScroll: true });
                        button?.scrollIntoView({ block: "nearest" });
                      }}
                    >
                      {filteredEntries.length > 0 ? (
                        filteredEntries.map((entry) => (
                          <button
                            type="button"
                            className={[
                              "activity-list-row",
                              selected?.id === entry.id ? "selected" : "",
                              entry.state,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            role="option"
                            aria-selected={selected?.id === entry.id}
                            data-activity-id={entry.id}
                            onClick={() => setSelectedId(entry.id)}
                            key={entry.id}
                          >
                            <span className="activity-list-icon">
                              {statusIcon(entry)}
                            </span>
                            <span>
                              <strong>{entry.title}</strong>
                              <small>
                                {entry.repositoryName} · {statusLabel(entry)}
                              </small>
                            </span>
                            <time dateTime={entry.startedAt}>
                              {relativeTime(entry.startedAt)}
                            </time>
                          </button>
                        ))
                      ) : (
                        <p className="activity-empty">No activity in this view.</p>
                      )}
                    </div>
                  </aside>

                  <article className="activity-detail">
                    {selected ? (
                      <>
                        <header>
                          <span className={`activity-detail-icon ${selected.state}`}>
                            {statusIcon(selected)}
                          </span>
                          <span>
                            <h3>{selected.title}</h3>
                            <p>{statusLabel(selected)}</p>
                          </span>
                          {selected.state === "running" && selected.cancellable ? (
                            <button
                              type="button"
                              onClick={() => onCancel(selected)}
                            >
                              <X aria-hidden="true" />
                              Cancel
                            </button>
                          ) : null}
                        </header>
                        <dl>
                          <div>
                            <dt>Repository</dt>
                            <dd>{selected.repositoryName}</dd>
                          </div>
                          <div>
                            <dt>Source</dt>
                            <dd>
                              {selected.category === "user"
                                ? "User action"
                                : "Background task"}
                            </dd>
                          </div>
                          <div>
                            <dt>Started</dt>
                            <dd>{new Date(selected.startedAt).toLocaleString()}</dd>
                          </div>
                          <div>
                            <dt>Duration</dt>
                            <dd>{durationLabel(selected, now)}</dd>
                          </div>
                        </dl>
                        {selected.commands.length > 0 ? (
                          <section className="activity-command-output">
                            <h4>
                              <SquareTerminal aria-hidden="true" />
                              {selected.commands.length === 1
                                ? "Command"
                                : "Commands"}
                            </h4>
                            <pre>
                              {selected.commands
                                .map((command) => `$ ${command}`)
                                .join("\n")}
                            </pre>
                          </section>
                        ) : null}
                        <section className="activity-safe-output">
                          <h4>
                            <Clock3 aria-hidden="true" />
                            Status
                          </h4>
                          <p>{selected.outcome ?? selected.detail}</p>
                        </section>
                        <p className="activity-privacy-note">
                          Repository paths, SSH hosts, shell wrappers, and raw
                          output are intentionally omitted.
                        </p>
                      </>
                    ) : (
                      <p className="activity-empty">Select an activity to inspect.</p>
                    )}
                  </article>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
