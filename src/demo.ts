import type {
  AppError,
  BookmarkRef,
  CachedProjection,
  RegistrySnapshot,
  RepositoryDraft,
  RepositoryRecord,
  HandoffTarget,
  FileDiffRequest,
  FileDiffProjection,
  OperationLogProjection,
} from "./types";

const LOCAL_ID = "e21c6676-690c-5847-b407-137074516f66";
const SSH_ID = "60223841-0e65-5848-9ba8-35f071629176";

function change(
  changeId: string,
  commitId: string,
  summary: string,
  ageMinutes: number,
  options: Partial<{
    parents: string[];
    bookmarks: BookmarkRef[];
    workingCopy: boolean;
    empty: boolean;
    files: { status: string; path: string }[];
    conflict: boolean;
  }> = {},
) {
  return {
    changeId,
    commitId,
    summary,
    author: "Avery Clark",
    updatedAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
    bookmarks: options.bookmarks ?? [],
    parents: options.parents ?? [],
    files: options.files ?? [],
    conflict: options.conflict ?? false,
    workingCopy: options.workingCopy ?? false,
    empty: options.empty ?? false,
  };
}

function projection(repositoryId: string, cachedAt: string): CachedProjection {
  const fixtureHistory = Array.from({ length: 153 }, (_, index) => {
    const sequence = index + 16;
    const changeId = sequence.toString(16).padStart(12, "0");
    const commitId = (sequence + 4_096).toString(16).padStart(12, "0");
    return change(changeId, commitId, `chore: fixture history row ${sequence}`, 360 + index * 12, {
      parents: [
        index === 152
          ? "000000000000"
          : (sequence + 1).toString(16).padStart(12, "0"),
      ],
    });
  });
  const rows = [
    change("7f3a2b1c9d8e", "8b1c2d3e4f5a", "feat: add repository identity", 0, {
      parents: ["6a7b8c9d0e1f"],
      bookmarks: [
        { name: "main", remote: null },
        { name: "main", remote: "git" },
        { name: "main", remote: "origin" },
        { name: "review-ready", remote: null },
      ],
      workingCopy: true,
      files: [
        { status: "A", path: "src-tauri/src/domain.rs" },
        { status: "M", path: "src/App.tsx" },
        { status: "A", path: "src-tauri/tests/driver_integration.rs" },
      ],
    }),
    change("6a7b8c9d0e1f", "6b7c8d9e0f1a", "test: cover SSH timeout", 18, {
      parents: ["5e6f7a8b9c0d"],
    }),
    change("5e6f7a8b9c0d", "5f6a7b8c9d0e", "docs: define P0 boundary", 120, {
      parents: ["4d5e6f7a8b9c"],
      conflict: true,
    }),
    change("4d5e6f7a8b9c", "4e5f6a7b8c9d", "refactor: split config loader", 300, {
      parents: ["3c4d5e6f7a8b", "2b3c4d5e6f7a"],
    }),
    change("3c4d5e6f7a8b", "3d4e5f6a7b8c", "feat: list SSH repositories", 1440, {
      parents: ["2b3c4d5e6f7a"],
    }),
    change("2b3c4d5e6f7a", "2c3d4e5f6a7b", "chore: initialize jjcat", 2880, {
      parents: ["000000000010"],
    }),
    ...fixtureHistory,
    change("000000000000", "000000000000", "(root)", 2880, { empty: true }),
  ];
  return {
    cachedAt,
    projection: {
      repositoryId,
      refreshedAt: cachedAt,
      capability: {
        detectedVersion: "0.43.0",
        minimumVersion: "0.30.0",
        supported: true,
      },
      changes: rows,
      conflicts: 1,
      workingCopyHasChanges: true,
      syncStatus: {
        available: true,
        remoteHeads: 1,
        outgoing: repositoryId === LOCAL_ID ? 3 : 1,
        behind: repositoryId === LOCAL_ID ? 1 : 0,
        basis: "lastFetched",
      },
    },
  };
}

export class DemoBridge {
  private snapshot: RegistrySnapshot;
  private active = new Map<string, AbortController>();

  constructor() {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 18 * 60_000).toISOString();
    this.snapshot = {
      recoveryNotice: null,
      registry: {
        schemaVersion: 2,
        selectedRepository: LOCAL_ID,
        openRepositoryIds: [LOCAL_ID, SSH_ID],
        repositories: [
          {
            id: LOCAL_ID,
            displayName: "jjcat",
            location: { kind: "local", path: "/fixtures/jjcat" },
            pinned: false,
            lastOpenedAt: now,
          },
          {
            id: SSH_ID,
            displayName: "infra-lab",
            location: { kind: "ssh", host: "fixture-host", path: "~/fixtures/infra-lab" },
            pinned: true,
            lastOpenedAt: stale,
          },
        ],
        cachedProjections: {
          [LOCAL_ID]: projection(LOCAL_ID, now),
          [SSH_ID]: projection(SSH_ID, stale),
        },
      },
    };
  }

  async loadRegistry() {
    return structuredClone(this.snapshot);
  }

  async loadFileDiff(request: FileDiffRequest): Promise<FileDiffProjection> {
    const selected = this.snapshot.registry.cachedProjections[request.repositoryId]?.projection.changes
      .find((candidate) => candidate.changeId === request.changeId && candidate.commitId === request.commitId);
    const file = selected?.files.find((candidate) => candidate.path === request.path);
    if (!file) {
      throw { kind: "notFound", message: "The selected file is not in this change." } satisfies AppError;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const fileName = file.path.split("/").pop() ?? file.path;
    const whitespaceLine = request.whitespaceMode === "preserve"
      ? [{ kind: "addition" as const, oldLine: null, newLine: 4, content: "  const spacing = true;" }]
      : [];
    return {
      repositoryId: request.repositoryId,
      changeId: request.changeId,
      commitId: request.commitId,
      file,
      whitespaceMode: request.whitespaceMode,
      binary: false,
      truncated: false,
      additions: 2 + whitespaceLine.length,
      deletions: 1,
      hunks: [
        {
          header: `@@ -1,3 +1,${3 + whitespaceLine.length} @@ ${fileName}`,
          lines: [
            { kind: "context", oldLine: 1, newLine: 1, content: `// ${fileName}` },
            { kind: "deletion", oldLine: 2, newLine: null, content: "const mode = \"legacy\";" },
            { kind: "addition", oldLine: null, newLine: 2, content: "const mode = \"jjcat\";" },
            { kind: "addition", oldLine: null, newLine: 3, content: "const remoteReady = true;" },
            ...whitespaceLine,
            { kind: "context", oldLine: 3, newLine: 3 + whitespaceLine.length, content: "export { mode };" },
          ],
        },
      ],
    };
  }

  async loadOperationLog(repositoryId: string): Promise<OperationLogProjection> {
    if (!this.snapshot.registry.repositories.some((repository) => repository.id === repositoryId)) {
      throw { kind: "notFound", message: "Repository is not registered." } satisfies AppError;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const now = Date.now();
    return {
      repositoryId,
      undoTarget: "f1e2d3c4b5a6",
      operations: [
        {
          id: "f1e2d3c4b5a6",
          description: "describe commit fixture",
          startedAt: new Date(now - 60_000).toISOString(),
          snapshot: false,
          current: true,
          undoEligible: true,
        },
        {
          id: "e2d3c4b5a697",
          description: "snapshot working copy",
          startedAt: new Date(now - 4 * 60_000).toISOString(),
          snapshot: true,
          current: false,
          undoEligible: false,
        },
        {
          id: "d3c4b5a69788",
          description: "new empty commit",
          startedAt: new Date(now - 12 * 60_000).toISOString(),
          snapshot: false,
          current: false,
          undoEligible: false,
        },
      ],
    };
  }

  async registerRepository(draft: RepositoryDraft) {
    const repository: RepositoryRecord = {
      id: crypto.randomUUID(),
      displayName: draft.displayName,
      location: draft.location,
      pinned: false,
      lastOpenedAt: new Date().toISOString(),
    };
    this.snapshot.registry.repositories.push(repository);
    this.snapshot.registry.selectedRepository = repository.id;
    this.snapshot.registry.openRepositoryIds.push(repository.id);
    return this.loadRegistry();
  }

  async removeRepository(repositoryId: string) {
    const index = this.snapshot.registry.repositories.findIndex(
      (repository) => repository.id === repositoryId,
    );
    if (index < 0) {
      throw { kind: "notFound", message: "Repository is not registered." } satisfies AppError;
    }
    this.snapshot.registry.repositories.splice(index, 1);
    delete this.snapshot.registry.cachedProjections[repositoryId];
    const openIndex = this.snapshot.registry.openRepositoryIds.indexOf(repositoryId);
    this.snapshot.registry.openRepositoryIds = this.snapshot.registry.openRepositoryIds.filter(
      (candidate) => candidate !== repositoryId,
    );
    if (this.snapshot.registry.selectedRepository === repositoryId) {
      this.snapshot.registry.selectedRepository =
        this.snapshot.registry.openRepositoryIds[openIndex] ??
        this.snapshot.registry.openRepositoryIds[openIndex - 1] ??
        null;
    }
    return this.loadRegistry();
  }

  async listSshHosts() {
    return ["fixture-host", "staging-fixture"];
  }

  async listRemoteDirectories(_host: string, path: string) {
    const normalized = path === "~/" ? "/fixtures/remote" : path.replace(/\/$/, "") || "/";
    const fixtures: Record<string, string[]> = {
      "/fixtures/remote": ["/fixtures/remote/projects", "/fixtures/remote/sandboxes"],
      "/fixtures/remote/projects": [
        "/fixtures/remote/projects/infra-lab",
        "/fixtures/remote/projects/product-app",
      ],
    };
    const parent =
      normalized === "/"
        ? null
        : normalized.slice(0, normalized.lastIndexOf("/")) || "/";
    return {
      path: normalized,
      parent,
      directories: fixtures[normalized] ?? [],
    };
  }

  async selectRepository(repositoryId: string) {
    const repository = this.snapshot.registry.repositories.find(
      (candidate) => candidate.id === repositoryId,
    );
    if (!repository) {
      throw { kind: "notFound", message: "Repository is not registered." } satisfies AppError;
    }
    if (!this.snapshot.registry.openRepositoryIds.includes(repositoryId)) {
      this.snapshot.registry.openRepositoryIds.push(repositoryId);
    }
    this.snapshot.registry.selectedRepository = repositoryId;
    repository.lastOpenedAt = new Date().toISOString();
    return this.loadRegistry();
  }

  async updateOpenRepositories(openRepositoryIds: string[], selectedRepository: string | null) {
    const known = new Set(this.snapshot.registry.repositories.map((repository) => repository.id));
    if (
      new Set(openRepositoryIds).size !== openRepositoryIds.length ||
      openRepositoryIds.some((repositoryId) => !known.has(repositoryId)) ||
      (selectedRepository !== null && !openRepositoryIds.includes(selectedRepository))
    ) {
      throw { kind: "invalidInput", message: "Open repository state is invalid." } satisfies AppError;
    }
    this.snapshot.registry.openRepositoryIds = [...openRepositoryIds];
    this.snapshot.registry.selectedRepository = selectedRepository;
    if (selectedRepository) {
      const selected = this.snapshot.registry.repositories.find(
        (repository) => repository.id === selectedRepository,
      );
      if (selected) selected.lastOpenedAt = new Date().toISOString();
    }
    return this.loadRegistry();
  }

  async setRepositoryPinned(repositoryId: string, pinned: boolean) {
    const repository = this.snapshot.registry.repositories.find(
      (candidate) => candidate.id === repositoryId,
    );
    if (!repository) {
      throw { kind: "notFound", message: "Repository is not registered." } satisfies AppError;
    }
    repository.pinned = pinned;
    return this.loadRegistry();
  }

  async refreshRepository(repositoryId: string, requestId: string) {
    const controller = new AbortController();
    this.active.set(requestId, controller);
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 650);
      controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject({ kind: "driver", message: "Repository refresh was cancelled." } satisfies AppError);
      });
    });
    this.active.delete(requestId);
    const repository = this.snapshot.registry.repositories.find((item) => item.id === repositoryId);
    if (repository?.location.kind === "ssh") {
      throw { kind: "driver", message: "SSH repository is disconnected; cached data is still available." } satisfies AppError;
    }
    const cached = projection(repositoryId, new Date().toISOString());
    this.snapshot.registry.cachedProjections[repositoryId] = cached;
    return structuredClone(cached);
  }

  async cancelRefresh(requestId: string) {
    const active = this.active.get(requestId);
    active?.abort();
    return Boolean(active);
  }

  async previewRepositoryHandoff(repositoryId: string, target: HandoffTarget) {
    const repository = this.repository(repositoryId);
    return {
      repositoryDisplayName: repository.displayName,
      target,
      actionLabel: target === "editor" ? "Open in VS Code" : "Open terminal",
    } as const;
  }

  async launchRepositoryHandoff(repositoryId: string, target: HandoffTarget) {
    return this.previewRepositoryHandoff(repositoryId, target);
  }

  private repository(repositoryId: string) {
    const repository = this.snapshot.registry.repositories.find(
      (candidate) => candidate.id === repositoryId,
    );
    if (!repository) {
      throw { kind: "notFound", message: "Repository is not registered." } satisfies AppError;
    }
    return repository;
  }
}
