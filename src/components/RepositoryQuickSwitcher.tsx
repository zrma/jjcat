import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Pin, Search, Server } from "lucide-react";
import { filterRepositories, repositoryLocationText } from "../lib/repositories";
import type { RepositoryRecord } from "../types";

export function RepositoryQuickSwitcher({
  repositories,
  openRepositoryIds,
  onSelect,
  onClose,
}: {
  repositories: RepositoryRecord[];
  openRepositoryIds: string[];
  onSelect: (repositoryId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => filterRepositories(repositories, query), [query, repositories]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query]);

  function choose(repositoryId: string) {
    onClose();
    void onSelect(repositoryId);
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
            choose(matches[activeIndex].id);
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
            placeholder="Switch repository…"
            aria-label="Search repositories"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="quick-switcher-results" role="listbox">
          {matches.map((repository, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => choose(repository.id)}
              key={repository.id}
            >
              {repository.location.kind === "local" ? (
                <Database aria-hidden="true" />
              ) : (
                <Server aria-hidden="true" />
              )}
              <span>
                <strong>{repository.displayName}</strong>
                <small>{repositoryLocationText(repository)}</small>
              </span>
              {repository.pinned && <Pin aria-label="Pinned" />}
              <em>{openRepositoryIds.includes(repository.id) ? "Open" : "Reopen"}</em>
            </button>
          ))}
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
