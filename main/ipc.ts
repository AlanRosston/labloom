import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";

// Handlers live on one window's webContents and only answer its top-level page.
function fromMainFrame(contents: WebContents, event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return event.senderFrame === contents.mainFrame;
}

// Arguments come from the renderer, so they stay unknown until the handler validates them.
export function handle(contents: WebContents, channel: string, listener: (...args: unknown[]) => unknown): void {
    contents.ipc.handle(channel, (event, ...args: unknown[]) => {
        if (!fromMainFrame(contents, event)) throw new Error("Rejected an IPC request from outside the main frame.");
        return listener(...args);
    });
}

export function on(contents: WebContents, channel: string, listener: (...args: unknown[]) => void): void {
    contents.ipc.on(channel, (event, ...args: unknown[]) => {
        if (fromMainFrame(contents, event)) listener(...args);
    });
}