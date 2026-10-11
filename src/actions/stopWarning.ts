import { Logger } from "trm-commons";
import chalk from "chalk";

/**
 * Logs the standard warning shown before a state-changing action starts.
 *
 * @param action Human-readable action name included in the warning.
 */
export function stopWarning(action: string): void {
    Logger.warning(`Starting ${chalk.bold(action)}!! Do not interrupt the process as it may leave inconsistencies!`);
}
