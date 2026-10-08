import { Logger } from "trm-commons";
import { ZTRM_DIRTY } from "../../../client";

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
        o.as4Text || '',
        `${o.pgmid} ${o.object} ${o.objName}`
    ]));
}
