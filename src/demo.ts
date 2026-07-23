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
  ExecuteMutationRequest,
  MutationExecution,
  MutationIntent,
  MutationPreview,
  ChangeRow,
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
    parentCommitIds: string[];
    bookmarks: BookmarkRef[];
    workingCopy: boolean;
    empty: boolean;
    files: { status: string; path: string; displayPath?: string }[];
    conflict: boolean;
    description: string;
  }> = {},
) {
  const updatedAt = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  return {
    changeId,
    commitId,
    summary,
    description: options.description ?? summary,
    author: "Avery Clark",
    authorEmail: "avery@example.invalid",
    authorTimestamp: new Date(Date.parse(updatedAt) - 45_000).toISOString(),
    committer: "Jordan Lee",
    committerEmail: "jordan@example.invalid",
    committerTimestamp: updatedAt,
    updatedAt,
    bookmarks: options.bookmarks ?? [],
    parents: options.parents ?? [],
    parentCommitIds: options.parentCommitIds ?? [],
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
    change(
      "7f3a2b1c9d8e",
      "8b1c2d3e4f5a60718293a4b5c6d7e8f901234567",
      "feat: add repository identity",
      0,
      {
      parents: ["6a7b8c9d0e1f"],
      parentCommitIds: ["6b7c8d9e0f1a2031425364758697a8b9c0d1e2f3"],
      bookmarks: [
        { name: "main", remote: null },
        { name: "main", remote: "git" },
        { name: "main", remote: "origin" },
        { name: "review-ready", remote: null },
      ],
      workingCopy: true,
      description:
        "feat: add repository identity\n\nKeep local and SSH repository identity stable across restarts.\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>",
      files: [
        { status: "A", path: "src-tauri/src/domain.rs" },
        { status: "M", path: "src/App.tsx" },
        {
          status: "R",
          path: "src-tauri/tests/driver_integration.rs",
          displayPath:
            "src-tauri/tests/{legacy_driver.rs => driver_integration.rs}",
        },
      ],
      },
    ),
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
  private mutationPreviews = new Map<
    string,
    { repositoryId: string; intent: MutationIntent; preview: MutationPreview }
  >();

  constructor() {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 18 * 60_000).toISOString();
    this.snapshot = {
      recoveryNotice: null,
      registry: {
        schemaVersion: 3,
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
            {
              kind: "context",
              oldLine: 1,
              newLine: 1,
              content:
                `// ${fileName}: long context remains independently scrollable in both comparison panes`,
            },
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

  async previewMutation(
    repositoryId: string,
    intent: MutationIntent,
  ): Promise<MutationPreview> {
    const projection =
      this.snapshot.registry.cachedProjections[repositoryId]?.projection;
    const repository = this.snapshot.registry.repositories.find(
      (candidate) => candidate.id === repositoryId,
    );
    if (!projection || !repository) {
      throw {
        kind: "notFound",
        message: "Repository is not registered.",
      } satisfies AppError;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const candidates =
      intent.kind === "pruneEmpty"
        ? projection.changes
            .filter(
              (change) =>
                change.empty &&
                !change.workingCopy &&
                !/^0+$/.test(change.commitId) &&
                change.bookmarks.length === 0,
            )
            .map((change) => ({
              changeId: change.changeId,
              commitId: change.commitId,
              summary: change.summary,
            }))
        : [];
    const content = mutationPreviewContent(intent, projection.changes);
    const token = crypto.randomUUID();
    const preview: MutationPreview = {
      token,
      repositoryId,
      repositoryDisplayName: repository.displayName,
      kind: intent.kind,
      expectedOperationId: "f1e2d3c4b5a697887766554433221100",
      candidates,
      ...content,
    };
    this.mutationPreviews.set(token, { repositoryId, intent, preview });
    return structuredClone(preview);
  }

  async executeMutation(
    request: ExecuteMutationRequest,
  ): Promise<MutationExecution> {
    const stored = this.mutationPreviews.get(request.token);
    if (!stored) {
      throw {
        kind: "stale",
        message: "Mutation preview is missing, expired, or already used.",
      } satisfies AppError;
    }
    if (
      !request.confirmed ||
      (stored.preview.requiresTypedConfirmation &&
        request.confirmation !== stored.preview.confirmationPhrase)
    ) {
      throw {
        kind: "confirmation",
        message: "Confirm the exact mutation preview before execution.",
      } satisfies AppError;
    }
    this.mutationPreviews.delete(request.token);
    const cached = this.snapshot.registry.cachedProjections[stored.repositoryId];
    applyDemoMutation(cached.projection.changes, stored.intent, stored.preview.candidates);
    const now = new Date().toISOString();
    cached.cachedAt = now;
    cached.projection.refreshedAt = now;
    const operationLog = await this.loadOperationLog(stored.repositoryId);
    return {
      previewToken: request.token,
      repositoryId: stored.repositoryId,
      kind: stored.intent.kind,
      previousOperationId: stored.preview.expectedOperationId,
      operationId: "a1b2c3d4e5f607182736455463728190",
      message: `${stored.preview.title} completed`,
      recoveryRequired: false,
      projection: structuredClone(cached.projection),
      operationLog,
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

function mutationPreviewContent(
  intent: MutationIntent,
  changes: ChangeRow[],
): Omit<
  MutationPreview,
  | "token"
  | "repositoryId"
  | "repositoryDisplayName"
  | "kind"
  | "expectedOperationId"
  | "candidates"
> {
  const target = (label: string, commitId: string) => ({
    label,
    value: commitId,
    commitId,
  });
  const details: Record<
    MutationIntent["kind"],
    { title: string; effect: string; risk: MutationPreview["risk"] }
  > = {
    new: {
      title: "Create change",
      effect: "Create a new working-copy change on the selected parent.",
      risk: "workingCopy",
    },
    edit: {
      title: "Edit change",
      effect: "Move the working copy to the selected change.",
      risk: "workingCopy",
    },
    describe: {
      title: "Describe change",
      effect: "Replace the full description of the selected change.",
      risk: "workingCopy",
    },
    fetch: {
      title: "Fetch remote",
      effect: "Contact the Git remote and refresh stored remote bookmarks.",
      risk: "network",
    },
    rebase: {
      title: "Rebase change",
      effect: "Rewrite the source change onto the exact destination.",
      risk: "rewrite",
    },
    squash: {
      title: "Squash change",
      effect: "Move the source diff into the selected destination.",
      risk: "rewrite",
    },
    split: {
      title: "Split change",
      effect: "Move the selected paths into a new change.",
      risk: "rewrite",
    },
    abandon: {
      title: "Abandon change",
      effect: "Remove the selected change while preserving descendants.",
      risk: "destructive",
    },
    pruneEmpty: {
      title: "Prune empty changes",
      effect:
        "Abandon only mutable, unreferenced empty changes; current, root, and bookmarked changes stay protected.",
      risk: "destructive",
    },
    undo: {
      title: "Undo operation",
      effect: "Undo the exact current repository operation.",
      risk: "recovery",
    },
    bookmarkMove: {
      title: "Move bookmark",
      effect: "Move the local bookmark to the exact selected change.",
      risk: "rewrite",
    },
    push: {
      title: "Push bookmark",
      effect: "Update the remote bookmark using Jujutsu safety checks.",
      risk: "remoteWrite",
    },
  };
  let targets: MutationPreview["targets"] = [];
  switch (intent.kind) {
    case "new":
      targets = intent.parentCommitIds.map((id) => target("Parent", id));
      break;
    case "edit":
    case "describe":
      targets = [target("Change", intent.targetCommitId)];
      break;
    case "fetch":
      targets = [{ label: "Remote", value: intent.remote ?? "Configured default", commitId: null }];
      break;
    case "rebase":
    case "squash":
      targets = [
        target("Source", intent.sourceCommitId),
        target("Destination", intent.destinationCommitId),
      ];
      break;
    case "split":
      targets = [
        target("Source", intent.sourceCommitId),
        ...intent.paths.map((path) => ({ label: "Path", value: path, commitId: null })),
      ];
      break;
    case "abandon":
      targets = intent.targetCommitIds.map((id) => target("Change", id));
      break;
    case "pruneEmpty":
      targets = [];
      break;
    case "undo":
      targets = [{ label: "Operation", value: intent.operationId, commitId: null }];
      break;
    case "bookmarkMove":
      targets = [
        { label: "Bookmark", value: intent.name, commitId: null },
        target("Destination", intent.targetCommitId),
      ];
      break;
    case "push":
      targets = [
        { label: "Bookmark", value: intent.name, commitId: null },
        { label: "Remote", value: intent.remote, commitId: null },
      ];
      break;
  }
  const candidateCount = changes.filter(
    (item) =>
      item.empty &&
      !item.workingCopy &&
      !/^0+$/.test(item.commitId) &&
      item.bookmarks.length === 0,
  ).length;
  const confirmationPhrase =
    intent.kind === "abandon"
      ? `Abandon ${intent.targetCommitIds.length} changes`
      : intent.kind === "pruneEmpty"
        ? `Prune ${candidateCount} empty changes`
        : intent.kind === "undo"
          ? "Undo current operation"
          : intent.kind === "push"
            ? `Push ${intent.name}`
            : "Confirm";
  return {
    ...details[intent.kind],
    targets,
    requiresTypedConfirmation: ["abandon", "pruneEmpty", "undo", "push"].includes(intent.kind),
    confirmationPhrase,
  };
}

function applyDemoMutation(
  changes: ChangeRow[],
  intent: MutationIntent,
  candidates: MutationPreview["candidates"],
) {
  const find = (commitId: string) =>
    changes.find((candidate) => candidate.commitId === commitId);
  switch (intent.kind) {
    case "edit":
      changes.forEach((item) => {
        item.workingCopy = item.commitId === intent.targetCommitId;
      });
      break;
    case "describe": {
      const selected = find(intent.targetCommitId);
      if (selected) {
        selected.description = intent.message;
        selected.summary = intent.message.split("\n")[0] || "(no description)";
      }
      break;
    }
    case "rebase": {
      const source = find(intent.sourceCommitId);
      const destination = find(intent.destinationCommitId);
      if (source && destination) {
        source.parents = [destination.changeId];
        source.parentCommitIds = [destination.commitId];
      }
      break;
    }
    case "squash":
    case "abandon": {
      const removed =
        intent.kind === "squash"
          ? new Set([intent.sourceCommitId])
          : new Set(intent.targetCommitIds);
      for (let index = changes.length - 1; index >= 0; index -= 1) {
        if (removed.has(changes[index].commitId)) changes.splice(index, 1);
      }
      break;
    }
    case "pruneEmpty": {
      const removed = new Set(candidates.map((candidate) => candidate.commitId));
      for (let index = changes.length - 1; index >= 0; index -= 1) {
        if (removed.has(changes[index].commitId)) changes.splice(index, 1);
      }
      break;
    }
    case "bookmarkMove": {
      changes.forEach((item) => {
        item.bookmarks = item.bookmarks.filter(
          (bookmark) => bookmark.remote !== null || bookmark.name !== intent.name,
        );
      });
      find(intent.targetCommitId)?.bookmarks.push({ name: intent.name, remote: null });
      break;
    }
    case "push": {
      const local = changes.find((item) =>
        item.bookmarks.some(
          (bookmark) => bookmark.name === intent.name && bookmark.remote === null,
        ),
      );
      if (
        local &&
        !local.bookmarks.some(
          (bookmark) =>
            bookmark.name === intent.name && bookmark.remote === intent.remote,
        )
      ) {
        local.bookmarks.push({ name: intent.name, remote: intent.remote });
      }
      break;
    }
    case "new":
    case "fetch":
    case "split":
    case "undo":
      break;
  }
}
