import type { AppAPI } from "../shared/app";

declare global {
    interface Window {
        api: AppAPI;
    }
}