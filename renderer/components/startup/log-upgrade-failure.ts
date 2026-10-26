import type { StartupState } from "../../../shared/types/startup";

export function logUpgradeFailure(state: StartupState): void {
    if (state.status !== "needs-workspace" || !state.upgradeFailure) return;
    const failure = state.upgradeFailure;
    const warning = failure.stage === "backup"
        ? "Labloom could not create the workspace backup. The upgrade has not started. Check the error below before trying again."
        : "Labloom could not upgrade the workspace. The workspace was not opened. Keep the backup and check the error below before trying again.";
    console.log(`[Labloom] WARNING: ${warning}`, {
        workspacePath: failure.workspacePath,
        fromVersion: failure.fromVersion,
        toVersion: failure.toVersion,
        stage: failure.stage,
        backupPath: failure.backupPath
    });
    console.log("[Labloom] Workspace upgrade error:", failure.error);
}