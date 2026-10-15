import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { CustomizingRow, planInstalledPackageCleanup } from "../commons/utils";
import { PackageHierarchy } from "../../commons";
import { TransportEntries } from "../../client";

function flattenDevclasses(pkg: PackageHierarchy): string[] {
    return [pkg.devclass, ...pkg.sub.flatMap(flattenDevclasses)];
}

/** Table content of customizing transport entries: its E071K keys, and the whole tables. */
export function customizingRows(entries: TransportEntries | any): CustomizingRow[] {
    const any: any = entries || {};
    // Registry entries are camel-cased: E071K becomes e071K.
    const keys: CustomizingRow[] = (any.e071K || any.e071k || []).map((key: any) => ({
        table: (key.objname || key.mastername || '').trim(),
        tabkey: (key.tabkey || '').trim()
    }));
    const wholeTables: CustomizingRow[] = (any.e071 || [])
        .filter((o: any) => (o.object || '').trim().toUpperCase() === 'TABU' && (o.objfunc || '').trim().toUpperCase() !== 'K')
        .map((o: any) => ({ table: (o.objName || '').trim() }));
    return [...keys, ...wholeTables];
}

/** Customizing of the incoming transports the user chose not to import: read only to keep the rows they ship. */
async function skippedCustomizingRows(context: InstallWorkflowContext): Promise<CustomizingRow[]> {
    const skipped = context.runtime.skippedCust || [];
    if (skipped.length === 0) {
        return [];
    }
    const manifest = context.runtime.package.data.manifest;
    if (context.runtime.isLocal) {
        const binaries = await (await context.rawInput.packageData.registry.downloadArtifact(manifest.name, manifest.version)).getTransportBinaries();
        return binaries.filter(o => skipped.includes(o.trkorr)).flatMap(o => customizingRows(o.entries));
    }
    const rows: CustomizingRow[] = [];
    for (const trkorr of skipped) {
        rows.push(...customizingRows(await context.rawInput.packageData.registry.transportEntries(manifest.name, manifest.version, trkorr)));
    }
    return rows;
}

/**
 * Workflow step that plans the cleanup of the installed release on upgrade (downgrade included), before
 * anything changes: what is backed up, kept and deleted. Every question is asked here.
 *
 * Objects the incoming release ships are never deleted: its import updates them. The rest of the installed
 * release (objects, SAP packages left empty, namespace, customizing) is deleted by deletion transports
 * imported with the incoming release (see prepare-deletion), and copied into the landscape transport.
 */
export const planUpdateCleanup: Step<InstallWorkflowContext> = {
    name: 'plan-update-cleanup',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.update) {
            return true;
        }
        Logger.log(`Skipping cleanup of previous release (first install?)`, true);
        return false;
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const installDevclass = context.rawInput.installData.installDevclass;
        const noCust = !!context.rawInput.installData.import?.noCust;
        const imported = (context.runtime.transports.cust || []).flatMap(cust => customizingRows(cust.binaries?.entries));
        const skipped = noCust ? [] : await skippedCustomizingRows(context);
        context.runtime.cleanupPlan = await planInstalledPackageCleanup(context, {
            incomingObjects: context.runtime.transports.tadir.binaries.entries.tadir || [],
            keptDevclasses: installDevclass.keepOriginal
                ? flattenDevclasses(context.runtime.package.hierarchy)
                : installDevclass.replacements.map(replacement => replacement.installDevclass),
            // trm-server/trm-rest may have been installed with abapGit, without transport
            liveObjectsArePrevious: context.runtime.selfUpdate,
            prefix: `(${Transport.getTransportIcon()}  Upgrade cleanup) `,
            actionName: 'Update',
            // Without customizing import, the installed customizing is kept as it is.
            keepCustomizing: noCust,
            incomingCustomizing: [...imported, ...skipped],
            skippedCustomizing: skipped
        });
    }
};

/** Registry transports of the incoming release whose content is never deleted, by type. */
export function incomingRegistryTransports(context: InstallWorkflowContext, type: TrmTransportIdentifier): string[] {
    return (context.runtime.package.data.transports || []).filter(o => o.type === type).map(o => o.trkorr);
}
