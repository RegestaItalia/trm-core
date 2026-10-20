import { dirname, resolve } from 'node:path';
import { findNodePackage, getGlobalNodeModulesPaths } from 'trm-commons';

/**
 * Returns the package.json of an installed package.
 *
 * The package is searched from the location of trm-core first, the same way node resolves modules, so the copy in
 * use is found whatever the install layout is (global, version managers, symlinks, bundled in an app...).
 * Then from the running script and the working directory (development), then in the global `node_modules`.
 * @param globalPath global `node_modules` path, searched before the other detected global folders
 * @param packageName package name (default `trm-core`)
 * @returns the parsed package.json
 */
export function getNodePackage(globalPath?: string, packageName?: string) {
    packageName = packageName || 'trm-core';
    const entry = process.argv[1] ? dirname(resolve(process.argv[1])) : undefined;
    const cwd = process.cwd();
    const found = findNodePackage(packageName, [__dirname, entry, cwd, resolve(cwd, '..', packageName)], {
        globalNodeModulesPaths: globalPath ? [globalPath, ...getGlobalNodeModulesPaths({ npm: false })] : undefined
    });
    if (!found) {
        throw new Error(`Couldn't find "${packageName}" package.json!`);
    }
    return found.packageJson;
}
