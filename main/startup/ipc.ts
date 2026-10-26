import { dialog, type BrowserWindow } from "electron";
import { startupChannels } from "../../shared/ipc";
import { handle } from "../ipc";
import type { Startup } from "./startup";

// One folder dialog at a time across windows, since they share one startup state.
let choosingWorkspace = false;

export function registerStartupIPCs(window: BrowserWindow, startup: Startup): void {
    const contents = window.webContents;
    handle(contents, startupChannels.getState, () => startup.state);
    handle(contents, startupChannels.retry, () => choosingWorkspace ? startup.state : startup.restore());
    handle(contents, startupChannels.chooseWorkspace, async action => {
        if (action !== "create" && action !== "open") throw new Error("Invalid workspace action.");
        if (choosingWorkspace || startup.state.status === "ready" || !startup.state.canChoose) return startup.state;
        choosingWorkspace = true;
        try {
            const result = await dialog.showOpenDialog(window, {
                title: action === "create" ? "Select an empty folder to create a workspace" : "Select an existing workspace",
                buttonLabel: action === "create" ? "Create here" : "Open workspace",
                defaultPath: startup.state.lastWorkspace?.path,
                properties: ["openDirectory", "createDirectory"]
            });
            if (result.canceled || !result.filePaths[0] || window.isDestroyed()) return startup.state;
            return startup.choose(result.filePaths[0], action);
        }
        finally {
            choosingWorkspace = false;
        }
    });
}