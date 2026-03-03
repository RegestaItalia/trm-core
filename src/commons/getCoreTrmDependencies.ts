import { getNodePackage } from "./getNodePackage";

export function getCoreTrmDependencies(globalPath?: string): {
    [key: string]: string;
} {
    const nodePackage = getNodePackage(globalPath);
    return nodePackage.trmDependencies || {};
}