import { useEffect, useState } from "react";
import { Cable, FolderOpen, Laptop, Server, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { bridge, isTauriRuntime } from "../bridge";
import type { AppError, RepositorySourceDraft } from "../types";
import { CliSpinner } from "./CliSpinner";

export function AddRepositorySourceDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (draft: RepositorySourceDraft) => Promise<void>;
}) {
  const [kind, setKind] = useState<"local" | "ssh">("local");
  const [displayName, setDisplayName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [host, setHost] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [hostsError, setHostsError] = useState<string | null>(null);
  const [scanDepth, setScanDepth] = useState(3);
  const [nameEdited, setNameEdited] = useState(false);
  const [browsingLocal, setBrowsingLocal] = useState(false);
  const [browsingRemote, setBrowsingRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    bridge
      .listSshHosts()
      .then((aliases) => {
        if (!current) return;
        setHosts(aliases);
        setHost((selected) => selected || aliases[0] || "");
      })
      .catch((hostError: AppError) => {
        if (current) setHostsError(hostError.message);
      })
      .finally(() => {
        if (current) setHostsLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  function suggestName(selectedPath: string, selectedHost = host) {
    if (nameEdited) return;
    const folder = selectedPath.replace(/\/+$/, "").split("/").pop() || "Repositories";
    setDisplayName(kind === "ssh" && selectedHost ? `${selectedHost} · ${folder}` : folder);
  }

  async function browseLocal() {
    setBrowsingLocal(true);
    setError(null);
    try {
      const selectedPath = isTauriRuntime
        ? await open({
            directory: true,
            multiple: false,
            title: "Choose a folder containing Git or Jujutsu repositories",
          })
        : "/fixtures";
      if (!selectedPath || Array.isArray(selectedPath)) return;
      setLocalPath(selectedPath);
      suggestName(selectedPath);
    } catch (browseError) {
      setError((browseError as AppError).message ?? "The local folder could not be opened.");
    } finally {
      setBrowsingLocal(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const location =
      kind === "local"
        ? { kind, path: localPath }
        : { kind, host, path: remotePath };
    try {
      await onSubmit({ displayName, location, scanDepth });
    } catch (submitError) {
      setError((submitError as AppError).message);
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="repository-dialog source-dialog"
        aria-labelledby="add-source-title"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="add-source-title">Add repository source</h2>
            <p>
              Scan one local or SSH folder and keep its Git and Jujutsu
              repositories in a tree.
            </p>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="transport-toggle" aria-label="Repository source location type">
          <button
            type="button"
            className={kind === "local" ? "selected" : ""}
            onClick={() => setKind("local")}
          >
            <Laptop aria-hidden="true" /> Local
          </button>
          <button
            type="button"
            className={kind === "ssh" ? "selected" : ""}
            onClick={() => setKind("ssh")}
          >
            <Server aria-hidden="true" /> SSH
          </button>
        </div>
        <label>
          Display name
          <input
            autoFocus
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setNameEdited(true);
            }}
            placeholder={kind === "local" ? "Local projects" : "Dev box projects"}
            required
            maxLength={80}
          />
        </label>
        {kind === "ssh" && (
          <label>
            OpenSSH host alias
            <select
              value={host}
              onChange={(event) => {
                setHost(event.target.value);
                if (!nameEdited && remotePath) suggestName(remotePath, event.target.value);
              }}
              required
              disabled={hostsLoading || hosts.length === 0}
            >
              {hostsLoading && <option value="">Reading OpenSSH config…</option>}
              {!hostsLoading && hosts.length === 0 && (
                <option value="">No explicit host aliases found</option>
              )}
              {hosts.map((alias) => (
                <option value={alias} key={alias}>
                  {alias}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {hostsError ?? "Aliases come from your machine-local OpenSSH config."}
            </span>
          </label>
        )}
        <label>
          Source folder
          <span className="path-input">
            <input
              value={kind === "local" ? localPath : remotePath}
              onChange={(event) =>
                kind === "local"
                  ? setLocalPath(event.target.value)
                  : setRemotePath(event.target.value)
              }
              placeholder="~/code/src"
              required
            />
            <button
              type="button"
              aria-label={kind === "local" ? "Browse local folders" : "Browse folders over SSH"}
              title={kind === "local" ? "Browse local folders" : "Browse folders over SSH"}
              onClick={() =>
                kind === "local" ? void browseLocal() : setBrowsingRemote(true)
              }
              disabled={kind === "local" ? browsingLocal : !host}
            >
              {kind === "local" ? <FolderOpen aria-hidden="true" /> : <Cable aria-hidden="true" />}
            </button>
          </span>
        </label>
        <label>
          Scan depth
          <select value={scanDepth} onChange={(event) => setScanDepth(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((depth) => (
              <option value={depth} key={depth}>
                {depth} folder {depth === 1 ? "level" : "levels"}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Scanning stops inside a repository and skips hidden and generated folders.
          </span>
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? (
              <span className="button-activity">
                <CliSpinner /> Adding…
              </span>
            ) : (
              "Add and scan"
            )}
          </button>
        </footer>
      </form>
      {browsingRemote && (
        <RemoteSourceFolderDialog
          host={host}
          initialPath={remotePath || "~/"}
          onClose={() => setBrowsingRemote(false)}
          onChoose={(selectedPath) => {
            setRemotePath(selectedPath);
            suggestName(selectedPath);
            setBrowsingRemote(false);
          }}
        />
      )}
    </div>
  );
}

function RemoteSourceFolderDialog({
  host,
  initialPath,
  onClose,
  onChoose,
}: {
  host: string;
  initialPath: string;
  onClose: () => void;
  onChoose: (path: string) => void;
}) {
  const [pathInput, setPathInput] = useState(initialPath);
  const [listing, setListing] = useState<Awaited<
    ReturnType<typeof bridge.listRemoteDirectories>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(path: string) {
    setLoading(true);
    setError(null);
    try {
      const next = await bridge.listRemoteDirectories(host, path);
      setListing(next);
      setPathInput(next.path);
    } catch (loadError) {
      setError((loadError as AppError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(initialPath);
    // The dialog is remounted when its source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="dialog-backdrop remote-browser-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="remote-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-folder-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="source-folder-title">Choose source folder</h2>
            <span><Server aria-hidden="true" /> {host}</span>
          </div>
          <button type="button" aria-label="Close remote folder browser" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <form
          className="remote-path-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void load(pathInput);
          }}
        >
          <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} />
          <button type="submit" disabled={loading}>Go</button>
        </form>
        <div className="remote-folder-list">
          {listing?.parent && (
            <button type="button" onClick={() => void load(listing.parent!)}>
              <FolderOpen aria-hidden="true" /> ..
            </button>
          )}
          {listing?.directories.map((directory) => (
            <button type="button" onDoubleClick={() => void load(directory)} onClick={() => setPathInput(directory)} key={directory}>
              <FolderOpen aria-hidden="true" />
              <span>{directory.split("/").pop()}</span>
            </button>
          ))}
          {loading && (
            <p className="activity-copy">
              <CliSpinner />
              <span>Reading folders…</span>
            </p>
          )}
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <footer>
          <span className="remote-current-path">{pathInput}</span>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            onClick={() => onChoose(pathInput)}
            disabled={!pathInput || loading}
          >
            Choose folder
          </button>
        </footer>
      </section>
    </div>
  );
}
