import { BrowserWindow, ipcMain, net, shell, type IpcMainInvokeEvent } from "electron";
import type { Startup } from "../startup";
import { fetchFeed } from "./parser";
import { FeedService } from "./service";

export function registerFeed(startup: Startup): void {
    let service: FeedService | undefined;
    function feed(event: IpcMainInvokeEvent): FeedService {
        if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) {
            throw new Error("无效的订阅请求。");
        }
        service ??= new FeedService(startup.getDatabase(), url => fetchFeed(url, net.fetch));
        return service;
    }

    ipcMain.handle("feed:get-state", (event, query) => feed(event).getState(query));
    ipcMain.handle("feed:save-source", (event, source) => feed(event).saveSource(source));
    ipcMain.handle("feed:remove-source", (event, id) => feed(event).removeSource(id));
    ipcMain.handle("feed:refresh", (event, sourceId) => feed(event).refresh(sourceId));
    ipcMain.handle("feed:set-read", (event, id, isRead) => feed(event).setRead(id, isRead));
    ipcMain.handle("feed:open-item", (event, id) => shell.openExternal(feed(event).itemURL(id)));
}