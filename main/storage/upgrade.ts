import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { WorkspaceUpgradeFailure } from "../../shared/types/startup";
import { migrateWorkspaceSchema, workspaceFormatVersion } from "./schema";

export class WorkspaceUpgradeError extends Error {
    readonly failure: WorkspaceUpgradeFailure;

    constructor(context: Omit<WorkspaceUpgradeFailure, "error">, cause: unknown) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        super(`Labloom could not upgrade the workspace: ${error.message}`, { cause });
        this.name = "WorkspaceUpgradeError";
        const code = (error as NodeJS.ErrnoException).code;
        this.failure = {
            ...context,
            error: { name: error.name, message: error.message, stack: error.stack, code }
        };
    }
}

function backupDatabase(database: Database.Database, root: string, version: number): string {
    const directory = join(root, "backups");
    mkdirSync(directory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(directory, `workspace-v${version}-${timestamp}-${randomUUID()}.sqlite`);
    const partial = `${path}.partial`;
    closeSync(openSync(partial, "wx"));
    try {
        // SQLite makes a consistent standalone snapshot, including committed WAL data.
        // Do not copy workspace.sqlite directly or run this inside a transaction.
        database.prepare("VACUUM INTO ?").run(partial);
        const backup = new Database(partial, { readonly: true, fileMustExist: true });
        try {
            const checks = backup.pragma("quick_check") as { quick_check: string; }[];
            if (checks.length !== 1 || checks[0].quick_check !== "ok"
                || backup.pragma("application_id", { simple: true }) !== database.pragma("application_id", { simple: true })
                || backup.pragma("user_version", { simple: true }) !== version) {
                throw new Error("The Labloom workspace backup failed validation. The upgrade has not started.");
            }
        }
        finally {
            backup.close();
        }
        renameSync(partial, path);
        return path;
    }
    catch (error) {
        try {
            unlinkSync(partial);
        }
        catch {
            // Retain the original backup error; any leftover .partial file is unusable.
        }
        throw error;
    }
}

export function upgradeWorkspace(database: Database.Database, root: string, fromVersion: number): void {
    let stage: WorkspaceUpgradeFailure["stage"] = "backup";
    let backupPath: string | undefined;
    try {
        backupPath = backupDatabase(database, root, fromVersion);
        stage = "migration";
        migrateWorkspaceSchema(database);
    }
    catch (error) {
        throw new WorkspaceUpgradeError({ workspacePath: root, fromVersion, toVersion: workspaceFormatVersion, stage, backupPath }, error);
    }
}