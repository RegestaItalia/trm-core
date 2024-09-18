import { exec } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";
import { promisify } from "util";

export async function listExitModules(): Promise<string[]> {
    var modules: string[] = [];
    const execPromise = promisify(exec);
    const { stdout } = await execPromise(`npm config get prefix`);
    const prefixPath = stdout.replace(/\n$/, '');
    const nodeModulesPath = path.join(prefixPath, 'node_modules');
    if(existsSync(nodeModulesPath)){
        const nodeModulesContent = readdirSync(nodeModulesPath);
        nodeModulesContent.forEach(moduleName => {
            if(/^(@[a-zA-Z0-9-_]+\/)?trm-exit-[a-zA-Z0-9-_]+/g.test(moduleName)){
                modules.push(path.join(nodeModulesPath, moduleName));
            }
        })
        return [...new Set(modules)];
    }
    return modules;
}