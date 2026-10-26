import type Database from "better-sqlite3";
import { builtinAttrs } from "../../shared/attrs/builtins";

export function validateBuiltinAttrs(database: Database.Database): void {
    const select = database.prepare<[string], { type: string; }>("SELECT type FROM attrs WHERE id = ?");
    for (const [id, definition] of Object.entries(builtinAttrs)) {
        if (select.get(id)?.type !== definition.type) {
            throw new Error(`The Labloom builtin attribute '${id}' is missing or has an incompatible type.`);
        }
    }
}