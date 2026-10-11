import { DEVCLASS } from "../client";
import { getPackageNamespace } from "./getPackageNamespace";

/**
 * Returns the namespace of a set of SAP packages: the root package namespace, or the only
 * reserved (/NAMESPACE/) namespace used by a subpackage when the root uses Z or Y.
 *
 * Only one reserved namespace is supported: a TRM package carries a single namespace and repair
 * license. Z and Y need no namespace object and can be mixed with it.
 */
export function getPackagesNamespace(rootDevclass: DEVCLASS, devclasses: DEVCLASS[]): string {
    const reservedNamespaces = [...new Set([rootDevclass, ...devclasses].map(getPackageNamespace).filter(ns => ns[0] === '/'))];
    if (reservedNamespaces.length > 1) {
        throw new Error(`SAP packages must use at most one namespace, found: ${reservedNamespaces.join(', ')}.`);
    }
    const rootNamespace = getPackageNamespace(rootDevclass);
    return rootNamespace[0] === '/' || reservedNamespaces.length === 0 ? rootNamespace : reservedNamespaces[0];
}
