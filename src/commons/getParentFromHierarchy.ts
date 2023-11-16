import { DEVCLASS } from "../rfc";
import { PackageHierarchy } from "./PackageHierarchy";

export function getParentFromHierarchy(hierarchy: PackageHierarchy, targetDevclass: DEVCLASS) {
    if (hierarchy.devclass === targetDevclass) {
        return null;
    }

    for (const subItem of hierarchy.sub || []) {
        if (subItem.devclass === targetDevclass) {
            return hierarchy.devclass;
        }

        const foundInSub = getParentFromHierarchy(subItem, targetDevclass);
        if (foundInSub) {
            return foundInSub;
        }
    }

    return null;
}