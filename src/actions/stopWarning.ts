import { Logger } from "trm-commons";

export function stopWarning(action: string): void {
    Logger.warning(`Starting ${action}!! Do not interrupt the process as it may leave inconsistencies!`);
}