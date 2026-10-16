import { Logger } from "trm-commons";
import { ZTRM_OBJ_LOCK } from "../../../client";

/**
 * Reports the objects locked in SAP transport requests as a single table,
 * so the user can tell at a glance which requests must be released.
 */
export function logObjectsLocks(locks: ZTRM_OBJ_LOCK[]): void {
    if (locks.length === 0) {
        return;
    }
    Logger.error(`${locks.length} object${locks.length === 1 ? ' is' : 's are'} currently locked in transport requests`, { important: true });
    Logger.table(['Transport', 'PGMID', 'Object', 'Object name'], [...locks]
        .sort((a, b) => a.trkorr.localeCompare(b.trkorr))
        .map(lock => [lock.trkorr, lock.pgmid, lock.object, lock.objName]));
}
