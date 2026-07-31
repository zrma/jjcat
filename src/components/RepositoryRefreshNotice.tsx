import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { AppError } from "../types";
import { CliSpinner } from "./CliSpinner";

export interface RepositoryRefreshNoticeModel {
  tone: "activity" | "warning";
  message: string;
  cacheLabel: string | null;
  retryLabel: string | null;
}

export function repositoryRefreshNoticeModel({
  error,
  hasCache,
  retryAt,
  now,
}: {
  error: AppError;
  hasCache: boolean;
  retryAt?: number;
  now: number;
}): RepositoryRefreshNoticeModel {
  const waiting = error.kind === "busy";
  const retrySeconds = retryAt
    ? Math.max(1, Math.ceil((retryAt - now) / 1_000))
    : null;
  return {
    tone: waiting ? "activity" : "warning",
    message: waiting
      ? "Refresh waiting for repository operation."
      : error.message,
    cacheLabel: hasCache ? "Showing cached data." : null,
    retryLabel:
      retrySeconds === null
        ? null
        : waiting
          ? `Retrying in ${retrySeconds}s.`
          : `Background retry in ${retrySeconds}s.`,
  };
}

export function RepositoryRefreshNotice({
  error,
  hasCache,
  retryAt,
}: {
  error: AppError;
  hasCache: boolean;
  retryAt?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const model = repositoryRefreshNoticeModel({
    error,
    hasCache,
    retryAt,
    now,
  });
  return (
    <div
      className={`notice ${model.tone === "activity" ? "activity-notice" : "error-notice"}`}
      role="status"
      aria-live="polite"
    >
      {model.tone === "activity" ? (
        <CliSpinner />
      ) : (
        <AlertTriangle aria-hidden="true" />
      )}
      <span>{model.message}</span>
      {model.cacheLabel && (
        <span className="notice-tail">{model.cacheLabel}</span>
      )}
      {model.retryLabel && (
        <span className="notice-tail">{model.retryLabel}</span>
      )}
    </div>
  );
}
