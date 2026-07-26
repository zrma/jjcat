import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Pin, Search, Server } from "lucide-react";
import { filterRepositories, repositoryLocationText } from "../lib/repositories";
import {
  registeredRepositoryFor,
  repositoryLocationKey,
} from "../lib/repositorySources";
import type {
  DiscoveredRepository,
  RepositoryRecord,
  RepositorySourceRecord,
  SourceCatalog,
} from "../types";

type SwitcherEntry =
  | {
      kind: "registered";
      repository: RepositoryRecord;
    }
  | {
      kind: "discovered";
      source: RepositorySourceRecord;
      repository: DiscoveredRepository;
    };

export function RepositoryQuickSwitcher({
  repositories,
  repositorySources,
  sourceCatalogs,
  openRepositoryIds,
  onSelect,
  onOpenDiscovered,
  onClose,
}: {
  repositories: RepositoryRecord[];
  repositorySources: RepositorySourceRecord[];
  sourceCatalogs: Record<string, SourceCatalog>;
  openRepositoryIds: string[];
  onSelect: (repositoryId: string) => Promise<void>;
  onOpenDiscovered: (sourceId: string, relativePath: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo<SwitcherEntry[]>(() => {
    const registered = filterRepositories(repositories, query).map(
      (repository): SwitcherEntry => ({ kind: "registered", repository }),
    );
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const discovered = repositorySources.flatMap((source) =>
      (sourceCatalogs[source.id]?.repositories ?? [])
        .filter(
          (repository) =>
            !registeredRepositoryFor(repositories, repository) &&
            (!normalizedQuery ||
              [
                repository.displayName,
                repository.relativePath,
                source.displayName,
              ].some((value) =>
                value.toLocaleLowerCase().includes(normalizedQuery),
              )),
        )
        .map(
          (repository): SwitcherEntry => ({
            kind: "discovered",
            source,
            repository,
          }),
        ),
    );
    return [...registered, ...discovered].sort(compareEntries);
  }, [query, repositories, repositorySources, sourceCatalogs]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query]);

  function choose(entry: SwitcherEntry) {
    onClose();
    if (entry.kind === "registered") {
      void onSelect(entry.repository.id);
    } else {
      void onOpenDiscovered(entry.source.id, entry.repository.relativePath);
    }
  }

  return (
    <div className="quick-switcher-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="quick-switcher"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-switcher-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === "Enter" && matches[activeIndex]) {
            event.preventDefault();
            choose(matches[activeIndex]);
          }
        }}
      >
        <h2 id="quick-switcher-title" className="sr-only">Switch repository</h2>
        <label className="quick-switcher-search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Open repository…"
            aria-label="Search registered and discovered repositories"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="quick-switcher-results" role="listbox">
          {matches.map((entry, index) => {
            const repository = entry.repository;
            const local = repository.location.kind === "local";
            const key =
              entry.kind === "registered"
                ? `registered:${entry.repository.id}`
                : `discovered:${entry.source.id}:${repositoryLocationKey(repository.location)}`;
            return (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(entry)}
                key={key}
              >
                {local ? <Database aria-hidden="true" /> : <Server aria-hidden="true" />}
                <span>
                  <strong>{repository.displayName}</strong>
                  <small>
                    {entry.kind === "registered"
                      ? repositoryLocationText(entry.repository)
                      : `${entry.source.displayName} · ${entry.repository.relativePath}`}
                  </small>
                </span>
                {entry.kind === "registered" && entry.repository.pinned && (
                  <Pin aria-label="Pinned" />
                )}
                <em>
                  {entry.kind === "registered"
                    ? openRepositoryIds.includes(entry.repository.id)
                      ? "Open"
                      : "Reopen"
                    : "Discovered"}
                </em>
              </button>
            );
          })}
          {matches.length === 0 && <p>No repositories match “{query}”.</p>}
        </div>
        <footer>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
        </footer>
      </section>
    </div>
  );
}

function compareEntries(left: SwitcherEntry, right: SwitcherEntry) {
  return left.repository.displayName.localeCompare(
    right.repository.displayName,
    undefined,
    { sensitivity: "base", numeric: true },
  );
}
