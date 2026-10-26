import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { formatWithOptions } from "node:util";

const reportError = console.error.bind(console);
const formatOptions = { colors: false, depth: null, maxArrayLength: null, maxStringLength: null };

export type LogKind = "application";

export class LogFile {
    private descriptor: number | null;

    constructor(readonly path: string) {
        this.descriptor = openSync(path, "wx", 0o600);
    }

    write(text: string): void {
        if (this.descriptor === null) return;
        try {
            // Write each chunk immediately, including output beyond the UI's tail.
            // No pending stream buffer is lost when the window closes or crashes.
            appendFileSync(this.descriptor, text, "utf8");
        }
        catch (error) {
            reportError("Could not write log:", this.path, error);
            this.closeDescriptor();
        }
    }

    record(event: string, value?: unknown): void {
        this.write(`\n[${new Date().toISOString()}] ${event}\n${value === undefined ? "" : formatWithOptions(formatOptions, value) + "\n"}`);
    }

    close(status: string): void {
        this.record(`Finished: ${status}`);
        this.closeDescriptor();
    }

    private closeDescriptor(): void {
        const descriptor = this.descriptor;
        this.descriptor = null;
        if (descriptor === null) return;
        try {
            closeSync(descriptor);
        }
        catch (error) {
            reportError("Could not close log:", this.path, error);
        }
    }
}

export class LogDirectory {
    constructor(readonly path: string) {}

    create(kind: LogKind, id?: string): LogFile | null {
        try {
            mkdirSync(this.path, { recursive: true });
            // Task IDs are metadata only; never use IPC input as a filename.
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const log = new LogFile(join(this.path, `${timestamp}_${kind}_${randomUUID()}.log`));
            log.record("Started", { kind, id, pid: process.pid });
            return log;
        }
        catch (error) {
            reportError("Could not create log:", this.path, error);
            return null;
        }
    }
}

export function captureConsole(log: LogFile | null, target = console): () => void {
    const restore: (() => void)[] = [];
    for (const level of ["debug", "log", "info", "warn", "error"] as const) {
        const original = target[level];
        const capture = (...values: unknown[]): void => {
            log?.record(`main ${level}`, formatWithOptions(formatOptions, ...values));
            original.apply(target, values);
        };
        target[level] = capture;
        restore.push(() => {
            if (target[level] === capture) target[level] = original;
        });
    }
    return () => restore.forEach(restore => restore());
}