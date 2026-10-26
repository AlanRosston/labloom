import type Database from "better-sqlite3";
import type { WorkspaceMigration } from "./runner";

// Published migration: keep its SQL and helpers independent of later schema changes.
const workspaceMetaSchema = `
    CREATE TABLE workspace_meta (
        id                TEXT PRIMARY KEY NOT NULL,
        name              TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        last_modified_at  TEXT NOT NULL,
        settings          TEXT NOT NULL DEFAULT '{}'
                          CHECK (json_valid(settings) AND json_type(settings) = 'object')
    ) STRICT;
`;

const coreSchema = `
    CREATE TABLE blocks (
        id        TEXT PRIMARY KEY NOT NULL,
        type      TEXT NOT NULL,
        content   TEXT,
        children  TEXT NOT NULL DEFAULT '[]'
                  CHECK (json_valid(children) AND json_type(children) = 'array')
    ) STRICT;

    CREATE TABLE pages (
        id              TEXT PRIMARY KEY NOT NULL,
        kind            TEXT NOT NULL,
        title_block_id  TEXT NOT NULL REFERENCES blocks(id),
        children        TEXT NOT NULL DEFAULT '[]'
                        CHECK (json_valid(children) AND json_type(children) = 'array')
    ) STRICT;

    CREATE TABLE attrs (
        id        TEXT PRIMARY KEY NOT NULL,
        type      TEXT NOT NULL,
        metadata  TEXT NOT NULL DEFAULT '{}'
                  CHECK (json_valid(metadata) AND json_type(metadata) = 'object')
    ) STRICT;

    CREATE TABLE page_attrs (
        page_id  TEXT NOT NULL REFERENCES pages(id),
        attr_id  TEXT NOT NULL REFERENCES attrs(id),
        value    ANY DEFAULT NULL,

        PRIMARY KEY (page_id, attr_id)
    ) STRICT;

    CREATE INDEX page_attrs_by_value ON page_attrs(attr_id, value);

    CREATE TABLE block_uses (
        container_kind  TEXT NOT NULL CHECK (container_kind IN ('page', 'block')),
        container_id    TEXT NOT NULL,
        slot            TEXT NOT NULL CHECK (slot IN ('title', 'children')),
        position        INTEGER NOT NULL CHECK (position >= 0),
        block_id        TEXT NOT NULL,

        PRIMARY KEY (container_kind, container_id, slot, position),
        CHECK (slot != 'title' OR (container_kind = 'page' AND position = 0))
    ) STRICT;

    CREATE INDEX block_uses_by_block ON block_uses(block_id);
`;

const blockUseColumns = "container_kind, container_id, slot, position, block_id";

function installBlockUseTriggers(database: Database.Database): void {
    for (const kind of ["page", "block"] as const) {
        const table = kind === "page" ? "pages" : "blocks";
        const columns = kind === "page" ? ["id", "title_block_id", "children"] : ["id", "children"];
        const insertUses = `
            SELECT RAISE(ABORT, 'children must contain block ID strings')
            WHERE EXISTS (SELECT 1 FROM json_each(NEW.children) WHERE type != 'text');

            ${kind === "page" ? `
                INSERT INTO block_uses (${blockUseColumns})
                VALUES ('page', NEW.id, 'title', 0, NEW.title_block_id);
            ` : ""}

            INSERT INTO block_uses (${blockUseColumns})
            SELECT '${kind}', NEW.id, 'children', key, value FROM json_each(NEW.children);
        `;

        database.exec(`
            CREATE TRIGGER ${table}_uses_insert AFTER INSERT ON ${table}
            BEGIN
                ${insertUses}
            END;

            CREATE TRIGGER ${table}_uses_update AFTER UPDATE OF ${columns.join(", ")} ON ${table}
            WHEN ${columns.map(column => `NEW.${column} IS NOT OLD.${column}`).join(" OR ")}
            BEGIN
                DELETE FROM block_uses WHERE container_kind = '${kind}' AND container_id = OLD.id;
                ${insertUses}
            END;

            CREATE TRIGGER ${table}_uses_delete AFTER DELETE ON ${table}
            BEGIN
                DELETE FROM block_uses WHERE container_kind = '${kind}' AND container_id = OLD.id;
            END;
        `);
    }
}

function installLastModifiedTriggers(database: Database.Database): void {
    const touch = "UPDATE workspace_meta SET last_modified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');";
    const tables = {
        pages: ["id", "kind", "title_block_id", "children"],
        blocks: ["id", "type", "content", "children"],
        attrs: ["id", "type", "metadata"],
        page_attrs: ["page_id", "attr_id", "value"]
    };

    // Derived index writes are deliberately excluded from modification tracking.
    for (const [table, columns] of Object.entries(tables)) {
        for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
            const condition = operation === "UPDATE"
                ? `WHEN ${columns.map(column => `NEW.${column} IS NOT OLD.${column}`).join(" OR ")}`
                : "";
            database.exec(`
                CREATE TRIGGER ${table}_modified_${operation.toLowerCase()} AFTER ${operation} ON ${table}
                ${condition}
                BEGIN
                    ${touch}
                END;
            `);
        }
    }

    database.exec(`
        CREATE TRIGGER workspace_meta_modified AFTER UPDATE OF name, settings ON workspace_meta
        WHEN NEW.name IS NOT OLD.name OR NEW.settings IS NOT OLD.settings
        BEGIN
            ${touch}
        END;
    `);
}

function installCoreSchema(database: Database.Database): void {
    database.exec(coreSchema);
    installBlockUseTriggers(database);
    installLastModifiedTriggers(database);
}

export const v2: WorkspaceMigration = {
    from: 1,
    to: 2,
    up(database) {
        database.exec(`
            ALTER TABLE workspace_meta RENAME TO workspace_meta_v1;
            ${workspaceMetaSchema}
            INSERT INTO workspace_meta (id, name, created_at, last_modified_at)
            SELECT id, name, created_at, created_at FROM workspace_meta_v1;
            DROP TABLE workspace_meta_v1;
        `);
        installCoreSchema(database);
    }
};