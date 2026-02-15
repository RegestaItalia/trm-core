import { pkgUpSync } from 'pkg-up';
import fs from 'node:fs';
import path from 'node:path';

export function getNodePackage(
    packageName: string,
    startDir: string = process.cwd()
) {
    let cwd = startDir;

    while (true) {
        const pkgPath = pkgUpSync({ cwd });

        if (!pkgPath) return null;

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        if (pkg.name === packageName) {
            return pkg;
        }

        // Move up one directory above the current package.json
        const parentDir = path.dirname(path.dirname(pkgPath));

        if (parentDir === cwd) return null;

        cwd = parentDir;
    }
}