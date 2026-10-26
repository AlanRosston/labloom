export type Workspace = {
    id: string;
    name: string;
    path: string;
};

export type WorkspaceAction = "create" | "open";

// Plain data survives Electron IPC, including errors raised before the renderer starts.
export type WorkspaceUpgradeFailure = {
    workspacePath: string;
    fromVersion: number;
    toVersion: number;
    stage: "backup" | "migration";
    backupPath?: string;
    error: { name: string; message: string; stack?: string; code?: string; };
};

export type StartupState =
    | { status: "ready"; workspace: Workspace; }
    | {
        status: "needs-workspace";
        lastWorkspace: Workspace | null;
        canChoose: boolean;
        error?: string;
        notice?: string;
        upgradeFailure?: WorkspaceUpgradeFailure;
    };