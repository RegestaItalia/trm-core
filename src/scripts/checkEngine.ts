import { readFileSync } from "fs";
import { resolve } from "path";
import { satisfies } from "semver";

const currentVersion = process.version;

const pkgPath = resolve(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const requiredRange = pkg.engines && pkg.engines.node;

if (!requiredRange) {
  console.warn('No "engines.node" field in package.json. Skipping Node version check.');
  process.exit(0);
}


if (!satisfies(currentVersion, requiredRange)) {
    console.error(
        `\nERROR: This package requires Node.js ${requiredRange}, but you are using ${currentVersion}.\n`
    );
    process.exit(1);
}