import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import { Logger } from "../logger";

export async function getNpmGlobalPath() {
    Logger.loading(`Reading NPM global path...`);
    const execPromise = promisify(exec);
    const { stdout } = await execPromise(`npm config get prefix`);
    const prefixPath = stdout.replace(/\n$/, '');
    const globalPath = path.join(prefixPath, 'node_modules');
    Logger.log(`NPM Global path: ${globalPath}`, true);
    return globalPath;
}