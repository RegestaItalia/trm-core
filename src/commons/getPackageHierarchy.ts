import { TDEVC } from "../client";
import { PackageHierarchy } from "./PackageHierarchy";

export function getPackageHierarchy(input: TDEVC[]): PackageHierarchy {
    const map = new Map<string, PackageHierarchy>();

    // Build a mapping of devclass to its children
    input.forEach(item => {
        map.set(item.devclass, {
            devclass: item.devclass,
            sub: []
        });
    });

    const roots = [];

    // Populate the 'sub' arrays based on parentcl
    input.forEach(item => {
        const child = map.get(item.devclass);
        const parent = map.get(item.parentcl);

        if (child && parent) {
            parent.sub.push(child);
        } else if (child && !parent) {
            roots.push(child);
        }
    });

    if (roots.length === 0) {
        throw new Error(`No root found in package hierarchy.`);
    } else if (roots.length > 1) {
        throw new Error(`Multiple roots found in package hierarchy.`);
    }

    return roots[0];
}