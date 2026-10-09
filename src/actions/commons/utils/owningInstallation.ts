import { SystemConnector } from "../../../systemConnector";
import { TrmPackage } from "../../../trmPackage";

function normalize(value: string): string {
    return value.trim().toUpperCase();
}

/**
 * Installed TRM package whose SAP packages contain `devclass`: its root package or one of the
 * root's subpackages, at any depth. `exclude` (e.g. the package being upgraded) is never returned.
 */
export async function getOwningInstallation(devclass: string, systemPackages: TrmPackage[], exclude?: TrmPackage): Promise<TrmPackage | undefined> {
    const excludedDevclass = normalize(exclude?.getDevclass() || '');
    const roots = new Map<string, TrmPackage>();
    systemPackages.forEach(pkg => {
        const root = normalize(pkg.getDevclass() || '');
        if (root && pkg !== exclude && root !== excludedDevclass) {
            roots.set(root, pkg);
        }
    });
    if (roots.size === 0) {
        return undefined;
    }
    const visited = new Set<string>();
    let current = devclass;
    while (current && !visited.has(normalize(current))) {
        const owner = roots.get(normalize(current));
        if (owner) {
            return owner;
        }
        visited.add(normalize(current));
        current = (await SystemConnector.getDevclass(current))?.parentcl;
    }
    return undefined;
}
