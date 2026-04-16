import { Logger } from "trm-commons";
import chalk from "chalk";

export function stopWarning(action: string): void {
    Logger.warning(`Starting ${chalk.bold(action)}!! Do not interrupt the process as it may leave inconsistencies!`);
}