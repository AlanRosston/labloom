import type { WorkspaceMigration } from "./runner";

// Freeze this version's builtin definitions and page kinds here. Later additions
// belong in a new migration, not in imports from the current builtin registry.
export const v3: WorkspaceMigration = {
    from: 2,
    to: 3,
    up(database) {
        const previous = database.prepare<[], { last_modified_at: string; }>("SELECT last_modified_at FROM workspace_meta").get();
        const existing = database.prepare<[], { type: string; }>("SELECT type FROM attrs WHERE id = 'deleted'").get();
        if (existing && existing.type !== "boolean") {
            throw new Error("The existing Labloom 'deleted' attribute has an incompatible type. The upgrade cannot continue.");
        }
        const invalid = database.prepare(`
            SELECT 1 FROM page_attrs
            WHERE attr_id = 'deleted' AND value IS NOT NULL
                AND NOT (typeof(value) IN ('integer', 'real') AND value IN (0, 1))
            LIMIT 1
        `).get();
        if (invalid) {
            throw new Error("An existing Labloom 'deleted' value is invalid. Expected NULL, 0, or 1.");
        }

        database.exec(`
            INSERT INTO attrs (id, type, metadata) VALUES ('deleted', 'boolean', '{}')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO page_attrs (page_id, attr_id, value)
            SELECT id, 'deleted', NULL FROM pages WHERE kind IN ('editable', 'paper')
            ON CONFLICT (page_id, attr_id) DO NOTHING;

            CREATE TRIGGER builtin_attrs_delete BEFORE DELETE ON attrs
            WHEN OLD.id = 'deleted'
            BEGIN
                SELECT RAISE(ABORT, 'Labloom builtin attributes cannot be deleted.');
            END;

            CREATE TRIGGER builtin_attrs_update BEFORE UPDATE OF id, type ON attrs
            WHEN (OLD.id = 'deleted' AND (NEW.id IS NOT OLD.id OR NEW.type IS NOT OLD.type))
                OR (NEW.id = 'deleted' AND NEW.type != 'boolean')
            BEGIN
                SELECT RAISE(ABORT, 'The ID and type of a Labloom builtin attribute cannot be changed.');
            END;

            CREATE TRIGGER builtin_attrs_insert BEFORE INSERT ON attrs
            WHEN NEW.id = 'deleted' AND NEW.type != 'boolean'
            BEGIN
                SELECT RAISE(ABORT, 'The Labloom deleted attribute must have type boolean.');
            END;

            CREATE TRIGGER pages_builtin_attrs_insert AFTER INSERT ON pages
            WHEN NEW.kind IN ('editable', 'paper')
            BEGIN
                INSERT INTO page_attrs (page_id, attr_id, value) VALUES (NEW.id, 'deleted', NULL);
            END;

            CREATE TRIGGER pages_builtin_attrs_update AFTER UPDATE OF kind ON pages
            WHEN NEW.kind IN ('editable', 'paper') AND NEW.kind IS NOT OLD.kind
            BEGIN
                INSERT INTO page_attrs (page_id, attr_id, value) VALUES (NEW.id, 'deleted', NULL)
                ON CONFLICT (page_id, attr_id) DO NOTHING;
            END;

            CREATE TRIGGER pages_attrs_delete AFTER DELETE ON pages
            BEGIN
                DELETE FROM page_attrs WHERE page_id = OLD.id;
            END;

            CREATE TRIGGER page_builtin_attrs_delete BEFORE DELETE ON page_attrs
            WHEN OLD.attr_id = 'deleted'
                AND EXISTS (SELECT 1 FROM pages WHERE id = OLD.page_id AND kind IN ('editable', 'paper'))
            BEGIN
                SELECT RAISE(ABORT, 'A Labloom page cannot remove a builtin attribute.');
            END;

            CREATE TRIGGER page_builtin_attrs_move BEFORE UPDATE OF page_id, attr_id ON page_attrs
            WHEN OLD.attr_id = 'deleted' AND (NEW.page_id IS NOT OLD.page_id OR NEW.attr_id IS NOT OLD.attr_id)
                AND EXISTS (SELECT 1 FROM pages WHERE id = OLD.page_id AND kind IN ('editable', 'paper'))
            BEGIN
                SELECT RAISE(ABORT, 'A Labloom page cannot remove a builtin attribute.');
            END;
        `);

        for (const operation of ["INSERT", "UPDATE"]) {
            database.exec(`
                CREATE TRIGGER page_deleted_value_${operation.toLowerCase()} BEFORE ${operation} ON page_attrs
                WHEN NEW.attr_id = 'deleted' AND NEW.value IS NOT NULL
                    AND NOT (typeof(NEW.value) IN ('integer', 'real') AND NEW.value IN (0, 1))
                BEGIN
                    SELECT RAISE(ABORT, 'The Labloom deleted attribute value must be NULL, 0, or 1.');
                END;
            `);
        }

        // Seeding definitions and empty values is an upgrade, not a user edit.
        if (previous) {
            database.prepare("UPDATE workspace_meta SET last_modified_at = ?").run(previous.last_modified_at);
        }
    }
};