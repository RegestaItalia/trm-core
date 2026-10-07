import type { E071K, PGMID, TROBJTYPE, TROBJ_NAME } from "../client";

/**
 * The E071 object a table key belongs to: its master object (e.g. table content or a view
 * maintenance entry), or the keyed table itself when no master is recorded.
 */
export function getE071KOwner(key: E071K): { pgmid: PGMID, object: TROBJTYPE, objName: TROBJ_NAME } {
    return {
        pgmid: key.pgmid,
        object: key.mastertype?.trim() ? key.mastertype : key.object,
        objName: key.mastername?.trim() ? key.mastername : key.objname
    };
}
