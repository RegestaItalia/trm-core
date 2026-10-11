import { Logger } from "trm-commons";
import { ZTRM_DIRTY } from "../../../client";
import { Transport } from "../../../transport";

/**
 * Lists the changes made on the target system to an installed package,
 * so the user can tell what a delete or an overwrite would discard.
 */
export function logDirtyEntries(entries: ZTRM_DIRTY[]): void {
    if (entries.length === 0) {
        return;
    }
    Logger.table(['Transport', 'Description', 'Object'], entries.map(o => [
        o.trkorr,
        // RFC rows are camel-cased (as4Text), REST rows keep the server field name (as4text)
        o.as4Text || (o as ZTRM_DIRTY & { as4text?: string }).as4text || '',
        `${o.pgmid} ${o.object} ${o.objName}`
    ]));
}

/**
 * Leaves out the entries of transports TRM generated for the package itself (its TRM comment rows name
 * it): e.g. the landscape transport of a release whose install was rolled back. They aren't changes
 * made on the system.
 */
export async function withoutOwnTrmTransports(entries: ZTRM_DIRTY[], packageName: string): Promise<ZTRM_DIRTY[]> {
    if (entries.length === 0) {
        return entries;
    }
    const own = new Set<string>();
    for (const trkorr of new Set(entries.map(o => o.trkorr))) {
        try {
            if ((await new Transport(trkorr).getTrmPackageName()) === packageName) {
                own.add(trkorr);
            }
        } catch {
            //unreadable: keep its entries
        }
    }
    return entries.filter(o => !own.has(o.trkorr));
}
