import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readdirSync, realpathSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import type { Workspace } from "../../shared/types/startup";
import { createWorkspaceSchema, workspaceFormatVersion } from "./schema";
import { upgradeWorkspace } from "./upgrade";
import { validateBuiltinAttrs } from "./builtin-attrs";

const applicationId = 0x4c424c4d;

export type OpenWorkspace = {
    info: Workspace;
    database: Database.Database;
};

function directoryPath(path: string): string {
    const resolved = realpathSync(path);
    if (!statSync(resolved).isDirectory()) throw new Error("Select a workspace folder.");
    return resolved;
}

export function createWorkspace(path: string): OpenWorkspace {
    const root = directoryPath(path);
    if (readdirSync(root).length !== 0) {
        throw new Error("Creating a workspace requires an empty folder. To use an existing workspace, open it instead.");
    }

    const databasePath = join(root, "workspace.sqlite");
    const attachmentsPath = join(root, "attachments");
    // Reserve the database name exclusively; never overwrite an existing file.
    closeSync(openSync(databasePath, "wx"));
    let database: Database.Database | undefined;
    let createdAttachments = false;
    try {
        database = new Database(databasePath, { fileMustExist: true });
        database.pragma("foreign_keys = ON");
        mkdirSync(attachmentsPath);
        createdAttachments = true;
        const info = { id: randomUUID(), name: basename(root), path: root };
        database.transaction(() => {
            database!.pragma(`application_id = ${applicationId}`);
            createWorkspaceSchema(database!);
            validateBuiltinAttrs(database!);
            const now = new Date().toISOString();
            database!.prepare("INSERT INTO workspace_meta (id, name, created_at, last_modified_at) VALUES (?, ?, ?, ?)")
                .run(info.id, info.name, now, now);
        })();
        return { info, database };
    }
    catch (error) {
        database?.close();
        // Only remove files created by this attempt; never recursively delete a folder.
        unlinkSync(databasePath);
        if (createdAttachments) rmdirSync(attachmentsPath);
        throw error;
    }
}

export function openWorkspace(path: string, expectedId?: string): OpenWorkspace {
    const root = directoryPath(path);
    const database = new Database(join(root, "workspace.sqlite"), { fileMustExist: true });
    try {
        if (database.pragma("application_id", { simple: true }) !== applicationId) {
            throw new Error("This folder is not a valid Labloom workspace.");
        }
        const version = database.pragma("user_version", { simple: true }) as number;
        if (!Number.isInteger(version) || version < 1 || version > workspaceFormatVersion) {
            throw new Error("This workspace format is incompatible with this version of Labloom. Open it with a compatible version.");
        }
        const rows = database.prepare<[], { id: unknown; name: unknown; }>("SELECT id, name FROM workspace_meta").all();
        const row = rows[0];
        if (rows.length !== 1 || typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id)
            || typeof row.name !== "string" || row.name.length === 0) {
            throw new Error("The workspace metadata is corrupted. The workspace cannot be opened.");
        }
        if (expectedId && row.id !== expectedId) {
            throw new Error("The workspace at this location has changed. Select it again to open it.");
        }
        if (!statSync(join(root, "attachments")).isDirectory()) {
            throw new Error("The workspace attachments folder is unavailable.");
        }
        database.pragma("foreign_keys = ON");
        if (version < workspaceFormatVersion) upgradeWorkspace(database, root, version);
        validateBuiltinAttrs(database);
        return { info: { id: row.id, name: row.name, path: root }, database };
    }
    catch (error) {
        database.close();
        throw error;
    }
}