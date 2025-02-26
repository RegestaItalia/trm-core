import { getNodePackage } from "./getNodePackage";

export function getCoreTrmDependencies(): {
    [key: string]: string;
} {
    const nodePackage = getNodePackage();
    return nodePackage.trmDependencies;
}