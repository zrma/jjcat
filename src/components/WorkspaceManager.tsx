import {
  AlertTriangle,
  Check,
  FileDiff,
  FolderGit2,
  HardDrive,
  Trash2,
} from "lucide-react";
import { relativeTime } from "../lib/format";
import type { WorkspaceRow } from "../types";

interface WorkspaceManagerProps {
  workspaces: WorkspaceRow[];
  onReviewChange: (workspace: WorkspaceRow) => void;
  onRemove: (workspace: WorkspaceRow) => void;
}

function workspaceState(workspace: WorkspaceRow) {
  if (workspace.conflict) return "Conflicted";
  if (workspace.empty) return "Empty";
  return `${workspace.fileCount} changed ${workspace.fileCount === 1 ? "file" : "files"}`;
}

export function WorkspaceManager({
  workspaces,
  onReviewChange,
  onRemove,
}: WorkspaceManagerProps) {
  return (
    <section className="workspace-manager" aria-label="Jujutsu workspaces">
      <header className="workspace-manager-header">
        <div>
          <FolderGit2 aria-hidden="true" />
          <div>
            <h1>Workspaces</h1>
            <p>
              Review or remove working directories registered to this repository. Removing a
              workspace also deletes its directory and files.
            </p>
          </div>
        </div>
        <span>{workspaces.length} registered</span>
      </header>

      <div className="workspace-table" role="table" aria-label="Registered workspaces">
        <div className="workspace-table-head" role="row">
          <span role="columnheader">Workspace</span>
          <span role="columnheader">Working copy</span>
          <span role="columnheader">State</span>
          <span role="columnheader">Updated</span>
          <span role="columnheader" aria-label="Actions" />
        </div>
        {workspaces.map((workspace) => (
          <article
            className={`workspace-row ${workspace.current ? "current" : ""}`}
            role="row"
            key={workspace.name}
          >
            <div className="workspace-identity" role="cell">
              <span className="workspace-icon">
                {workspace.current ? <Check aria-hidden="true" /> : <HardDrive aria-hidden="true" />}
              </span>
              <span>
                <strong>{workspace.name}</strong>
                <code title={workspace.root || "Workspace path is not recorded by jj"}>
                  {workspace.root || "Path unavailable"}
                </code>
              </span>
              {workspace.current && <em>Current</em>}
            </div>
            <div className="workspace-change" role="cell">
              <strong>{workspace.summary || "(no description)"}</strong>
              <code>{workspace.changeId}</code>
            </div>
            <div className="workspace-health" role="cell">
              {workspace.conflict && <AlertTriangle aria-hidden="true" />}
              <span className={workspace.conflict ? "conflicted" : workspace.empty ? "empty" : ""}>
                {workspaceState(workspace)}
              </span>
            </div>
            <time dateTime={workspace.updatedAt} role="cell">
              {relativeTime(workspace.updatedAt)}
            </time>
            <div className="workspace-actions" role="cell">
              <button type="button" onClick={() => onReviewChange(workspace)}>
                <FileDiff aria-hidden="true" />
                Review
              </button>
              <button
                type="button"
                className="remove-workspace"
                onClick={() => onRemove(workspace)}
                disabled={workspace.current || !workspace.empty}
                title={
                  workspace.current
                    ? "The current workspace cannot be removed"
                    : !workspace.empty
                      ? "Review or empty this working copy before removing the workspace"
                      : "Abandon the empty working-copy change, unregister this workspace, and delete its directory"
                }
              >
                <Trash2 aria-hidden="true" />
                Remove…
              </button>
            </div>
          </article>
        ))}
      </div>

      <footer className="workspace-manager-note">
        Current and non-empty workspaces stay protected. Removing an empty workspace also clears
        its working-copy change after you review the exact target.
      </footer>
    </section>
  );
}
