import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  FolderOpen,
  RefreshCw,
  Server,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  buildRepositorySourceTree,
  registeredRepositoryFor,
  repositoryReadiness,
  type RepositorySourceTreeNode,
} from "../lib/repositorySources";
import { relativeTime } from "../lib/format";
import type {
  Registry,
  RepositorySourceRecord,
  SourceCatalog,
} from "../types";
import { CliSpinner } from "./CliSpinner";

export function RepositorySourceTree({
  registry,
  scanning,
  errors,
  onOpen,
  onRescan,
  onRemove,
}: {
  registry: Registry;
  scanning: Set<string>;
  errors: Record<string, string>;
  onOpen: (sourceId: string, relativePath: string) => Promise<void>;
  onRescan: (sourceId: string) => Promise<void>;
  onRemove: (source: RepositorySourceRecord) => void;
}) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    () => new Set(registry.repositorySources.map((source) => source.id)),
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedSources((current) => {
      const next = new Set(current);
      for (const source of registry.repositorySources) next.add(source.id);
      return next;
    });
  }, [registry.repositorySources]);

  function toggleSource(sourceId: string) {
    setExpandedSources((current) => toggled(current, sourceId));
  }

  function toggleFolder(key: string) {
    setExpandedFolders((current) => toggled(current, key));
  }

  if (registry.repositorySources.length === 0) return null;

  return (
    <section className="repository-sources" aria-label="Repository sources">
      <h3>Repository Sources</h3>
      {registry.repositorySources.map((source) => {
        const catalog = registry.sourceCatalogs[source.id];
        const expanded = expandedSources.has(source.id);
        const sourceScanning = scanning.has(source.id);
        const sourceDisconnected =
          source.location.kind === "ssh" && Boolean(errors[source.id]);
        return (
          <div className="repository-source" key={source.id}>
            <div className="repository-source-heading">
              <button
                type="button"
                className="repository-source-toggle"
                aria-expanded={expanded}
                onClick={() => toggleSource(source.id)}
                title={sourceLocation(source)}
              >
                {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                {source.location.kind === "local" ? <Database aria-hidden="true" /> : <Server aria-hidden="true" />}
                <span>{source.displayName}</span>
                <div className="source-summary">
                  <strong>{catalog?.repositories.length ?? 0}</strong>
                  {sourceDisconnected && (
                    <i
                      className="source-disconnected"
                      aria-label="Disconnected"
                      title={
                        catalog
                          ? "Disconnected · showing cached repositories"
                          : "Disconnected"
                      }
                    >
                      <Unplug aria-hidden="true" />
                    </i>
                  )}
                </div>
              </button>
              <button
                type="button"
                className="source-action"
                aria-label={`Rescan ${source.displayName}`}
                title={catalog ? `Last scanned ${relativeTime(catalog.scannedAt)}` : "Scan source"}
                disabled={sourceScanning}
                onClick={() => void onRescan(source.id)}
              >
                <RefreshCw className={sourceScanning ? "spinning" : ""} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="source-action danger"
                aria-label={`Remove ${source.displayName} source`}
                title="Remove source from jjcat"
                onClick={() => onRemove(source)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            {expanded && (
              <SourceContents
                source={source}
                catalog={catalog}
                registry={registry}
                expandedFolders={expandedFolders}
                error={errors[source.id]}
                scanning={sourceScanning}
                onToggleFolder={toggleFolder}
                onOpen={onOpen}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function SourceContents({
  source,
  catalog,
  registry,
  expandedFolders,
  error,
  scanning,
  onToggleFolder,
  onOpen,
}: {
  source: RepositorySourceRecord;
  catalog: SourceCatalog | undefined;
  registry: Registry;
  expandedFolders: Set<string>;
  error: string | undefined;
  scanning: boolean;
  onToggleFolder: (key: string) => void;
  onOpen: (sourceId: string, relativePath: string) => Promise<void>;
}) {
  const tree = useMemo(
    () => buildRepositorySourceTree(catalog?.repositories ?? []),
    [catalog?.repositories],
  );
  if (scanning && !catalog) {
    return (
      <p className="source-empty activity-copy">
        <CliSpinner />
        <span>Scanning repositories…</span>
      </p>
    );
  }
  if (error && !catalog) return <p className="source-error">{error}</p>;
  if (tree.length === 0) {
    return (
      <p className="source-empty">
        {catalog
          ? "No Jujutsu or Git repositories found."
          : "Scan this source to discover repositories."}
      </p>
    );
  }
  return (
    <div className="source-tree" role="tree">
      {error && <p className="source-error">Latest scan failed · showing cached results</p>}
      {tree.map((node) => (
        <SourceNode
          node={node}
          depth={0}
          source={source}
          registry={registry}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onOpen={onOpen}
          key={`${node.kind}:${node.relativePath}`}
        />
      ))}
    </div>
  );
}

function SourceNode({
  node,
  depth,
  source,
  registry,
  expandedFolders,
  onToggleFolder,
  onOpen,
}: {
  node: RepositorySourceTreeNode;
  depth: number;
  source: RepositorySourceRecord;
  registry: Registry;
  expandedFolders: Set<string>;
  onToggleFolder: (key: string) => void;
  onOpen: (sourceId: string, relativePath: string) => Promise<void>;
}) {
  const key = `${source.id}:${node.relativePath}`;
  if (node.kind === "folder") {
    const expanded = expandedFolders.has(key);
    return (
      <>
        <button
          type="button"
          className="source-tree-row folder"
          style={{ "--tree-depth": depth } as CSSProperties}
          aria-expanded={expanded}
          onClick={() => onToggleFolder(key)}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          {expanded ? <FolderOpen aria-hidden="true" /> : <Folder aria-hidden="true" />}
          <span>{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <SourceNode
              node={child}
              depth={depth + 1}
              source={source}
              registry={registry}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onOpen={onOpen}
              key={`${child.kind}:${child.relativePath}`}
            />
          ))}
      </>
    );
  }
  const registered = registeredRepositoryFor(registry.repositories, node.repository);
  const open = registered ? registry.openRepositoryIds.includes(registered.id) : false;
  const gitOnly = repositoryReadiness(registered ?? node.repository) === "gitOnly";
  return (
    <button
      type="button"
      className={`source-tree-row repository ${open ? "open" : ""} ${gitOnly ? "git-only" : ""}`}
      style={{ "--tree-depth": depth } as CSSProperties}
      title={`${node.relativePath}\n${
        gitOnly
          ? "Double-click or press Enter to set up Jujutsu"
          : "Double-click or press Enter to open"
      }`}
      onDoubleClick={() => void onOpen(source.id, node.relativePath)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void onOpen(source.id, node.relativePath);
        }
      }}
    >
      <span className="tree-spacer" />
      <Database aria-hidden="true" />
      <span>{node.name}</span>
      {gitOnly ? (
        <i className="git-only" aria-label="Git repository; Jujutsu setup available">
          Git · Set up JJ
        </i>
      ) : (
        open && <i aria-label="Open in a tab">Open</i>
      )}
    </button>
  );
}

function toggled(current: Set<string>, key: string) {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function sourceLocation(source: RepositorySourceRecord) {
  return source.location.kind === "local"
    ? source.location.path
    : `${source.location.host}:${source.location.path}`;
}
