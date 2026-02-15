import { getNodePackage } from "./getNodePackage";

export function getCoreTrmDependencies(): {
    [key: string]: string;
} {
    const nodePackage = getNodePackage("trm-core");
    return nodePackage.trmDependencies || {};
}