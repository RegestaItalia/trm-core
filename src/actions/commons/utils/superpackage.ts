import { Logger } from "trm-commons";
import type { DEVCLASS } from "../../../client";
import { SystemConnector } from "../../../systemConnector";

function normalize(devclass?: string): string {
    return `${devclass || ''}`.trim().toUpperCase();
}

/**
 * Whether TDEVC already has `superpackage` (none, when empty) as the superpackage of `devclass`.
 * A package that can't be read (missing, read error) is reported as not having it, so the caller writes it.
 */
export async function hasSuperpackage(devclass: DEVCLASS, superpackage?: DEVCLASS): Promise<boolean> {
    try {
        const tdevc = await SystemConnector.getDevclass(devclass);
        if (!tdevc) {
            return false;
        }
        const current = normalize(tdevc.parentcl);
        if (current === normalize(superpackage)) {
            Logger.log(`Superpackage of ${devclass} is already ${current || '(none)'}: unchanged`, true);
            return true;
        }
    } catch (error) {
        Logger.log(`Couldn't read superpackage of ${devclass} (${error instanceof Error ? error.message : String(error)}): writing it`, true);
    }
    return false;
}

/**
 * Sets the superpackage of an SAP package, or removes it when `superpackage` is empty, unless TDEVC
 * already has it: the package API is called only for a real change. Where the API can't run
 * (e.g. SAP_BASIS 700, whose package save sends a dialog), an unchanged hierarchy then needs no manual step.
 *
 * A package that can't be read (missing, read error) is written as before: the write reports the error.
 */
export async function applySuperpackage(devclass: DEVCLASS, superpackage?: DEVCLASS): Promise<void> {
    if (await hasSuperpackage(devclass, superpackage)) {
        return;
    }
    if (normalize(superpackage)) {
        await SystemConnector.setPackageSuperpackage(devclass, superpackage);
    } else {
        await SystemConnector.clearPackageSuperpackage(devclass);
    }
}
