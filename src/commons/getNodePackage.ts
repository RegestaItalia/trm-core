import * as fs from "fs";
import path from "path";
import { rootPath } from 'get-root-path';
import { Logger } from "trm-commons";
import { getStackTrace } from "get-stack-trace";

const _findPackageRoot = (startPath: string): string | null => {
    var currentPath = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
    while (true) {
        const packageJsonPath = path.join(currentPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            return currentPath;
        }
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            return null;
        }
        currentPath = parentPath;
    }
}

export function getNodePackage(): any {
    var file: Buffer;
    var packageData: any;
    Logger.log(`root path: ${rootPath}`, true);
    const stack = getStackTrace();
    var modules: {
        packageRoot: string,
        name: string
    }[] = [];
    stack.forEach(o => {
        var searchModule = true;
        modules.forEach(m => {
            if(o.fileName.startsWith(m.packageRoot)){
                searchModule = false;
            }
        });
        if(searchModule){
            try {
                const packageRoot = _findPackageRoot(o.fileName);
                const modulePackage = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json")).toString());
                if (modulePackage.name) {
                    modules.push({
                        name: modulePackage.name,
                        packageRoot
                    });
                }
            } catch (e) { }
        }
    });
    try {
        if (modules.length === 1) {
            file = fs.readFileSync(path.join(rootPath, "package.json"));
        } else {
            file = fs.readFileSync(path.join(modules[modules.length - 1].packageRoot, `/node_modules/trm-core/package.json`));
        }
    } catch (e) { }
    if (file) {
        packageData = JSON.parse(file.toString());
    }
    if (!packageData || packageData.name !== 'trm-core') {
        throw new Error(`package.json not found!`);
    }
    return packageData;
}