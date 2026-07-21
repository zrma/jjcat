import type {
  AppError,
  CachedProjection,
  RegistrySnapshot,
  RepositoryDraft,
  RepositoryRecord,
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
    bookmarks: string[];
    workingCopy: boolean;
    empty: boolean;
    files: { status: string; path: string }[];
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
    conflict: false,
    workingCopy: options.workingCopy ?? false,
    empty: options.empty ?? false,
  };
}

function projection(repositoryId: string, cachedAt: string): CachedProjection {
  const rows = [
    change("7f3a2b1c9d8e", "8b1c2d3e4f5a", "feat: add repository identity", 0, {
      parents: ["6a7b8c9d0e1f"],
      bookmarks: ["main"],
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
    }),
    change("4d5e6f7a8b9c", "4e5f6a7b8c9d", "refactor: split config loader", 300, {
      parents: ["3c4d5e6f7a8b", "2b3c4d5e6f7a"],
    }),
    change("3c4d5e6f7a8b", "3d4e5f6a7b8c", "feat: list SSH repositories", 1440, {
      parents: ["2b3c4d5e6f7a"],
    }),
    change("2b3c4d5e6f7a", "2c3d4e5f6a7b", "chore: initialize jjcat", 2880, {
      parents: ["000000000000"],
    }),
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
      conflicts: 0,
      workingCopyHasChanges: true,
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
        schemaVersion: 1,
        selectedRepository: LOCAL_ID,
        repositories: [
          {
            id: LOCAL_ID,
            displayName: "jjcat",
            location: { kind: "local", path: "/fixtures/jjcat" },
            pinned: true,
          },
          {
            id: SSH_ID,
            displayName: "infra-lab",
            location: { kind: "ssh", host: "fixture-host", path: "~/fixtures/infra-lab" },
            pinned: true,
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

  async registerRepository(draft: RepositoryDraft) {
    const repository: RepositoryRecord = {
      id: crypto.randomUUID(),
      displayName: draft.displayName,
      location: draft.location,
      pinned: false,
    };
    this.snapshot.registry.repositories.push(repository);
    this.snapshot.registry.selectedRepository = repository.id;
    return this.loadRegistry();
  }

  async selectRepository(repositoryId: string) {
    this.snapshot.registry.selectedRepository = repositoryId;
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
}
