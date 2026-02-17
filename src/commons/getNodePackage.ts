import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getGlobalNodeModules } from 'trm-commons';

export function getNodePackage(packageName?: string) {
    const globalPath = getGlobalNodeModules();
    if (__dirname.includes(globalPath)) {
        //prod
        const parts = __dirname.split(sep);
        const index = parts.lastIndexOf("node_modules");
        if (packageName) {
            try {
                return JSON.parse(readFileSync(join(parts.slice(0, index + 1).join(sep), packageName, 'package.json'), 'utf8'));
            } catch { }
            // try up one folder
            try {
                const data = JSON.parse(readFileSync(join(resolve(parts.slice(0, index + 1).join(sep), '..'), 'package.json'), 'utf8'));
                if (data.name === packageName) {
                    return data;
                }
            } catch { }
        } else {
            try {
                return JSON.parse(readFileSync(join(parts.slice(0, index + 1).join(sep), 'trm-core', 'package.json'), 'utf8'));
            } catch { }
        }
    } else {
        //dev
        if(!packageName){
            packageName = 'trm-core';
        }
        //try current directory
        try {
            const data = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
            if (data.name === packageName) {
                return data;
            }
        } catch { }
        //try node_modules
        try {
            return JSON.parse(readFileSync(join(process.cwd(), 'node_modules', packageName, 'package.json'), 'utf8'));
        } catch { }
        //up one directory
        try {
            return JSON.parse(readFileSync(join(resolve(process.cwd(), ".."), packageName, 'package.json'), 'utf8'));
        } catch { }
        //up one directory, in node_modules
        try {
            return JSON.parse(readFileSync(join(resolve(process.cwd(), ".."), 'node_modules', packageName, 'package.json'), 'utf8'));
        } catch { }
    }
    throw new Error(`Couldn't find "${packageName}" package.json!`);
}