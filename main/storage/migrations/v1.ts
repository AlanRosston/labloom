import type { WorkspaceMigration } from "./runner";

// The original workspace format, also used as the baseline for new databases.
export const v1: WorkspaceMigration = {
    from: 0,
    to: 1,
    up(database) {
        database.exec(`
            CREATE TABLE workspace_meta (
                id          TEXT PRIMARY KEY NOT NULL,
                name        TEXT NOT NULL,
                created_at  TEXT NOT NULL
            );
        `);
    }
};