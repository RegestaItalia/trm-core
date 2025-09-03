import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "trm-commons";

export async function getNpmGlobalPath() {
    Logger.loading(`Reading NPM global path...`);
    const execPromise = promisify(exec);
    const { stdout } = await execPromise(`npm root -g`);
    const globalPath = stdout.replace(/\n$/, '');
    Logger.log(`NPM Global path: ${globalPath}`, true);
    return globalPath;
}