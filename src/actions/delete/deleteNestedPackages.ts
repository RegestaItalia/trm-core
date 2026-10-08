import { Step } from "@simonegaffurini/sammarksworkflow";
import { Inquirer, Logger } from "trm-commons";
import type { DeleteWorkflowContext } from ".";
import { deleteWithRollback } from ".";
import { SystemConnector } from "../../systemConnector";
import { TrmPackage } from "../../trmPackage";
import { getPackagesInstalledIn } from "../commons/utils";
import { Transport } from "../../transport";
import { ZTRM_DIRTY } from "../../client";

function normalize(value: string): string {
    return value.trim().toUpperCase();
}

/**
 * Other TRM packages installed in the SAP packages of the deleted one, at any depth: the first
 * list holds the outermost ones, whose delete removes the packages installed under them.
 */
export async function getNestedPackages(
    systemPackages: TrmPackage[],
    installed: TrmPackage,
    installDevclasses: string[]
): Promise<{ outermost: TrmPackage[], all: TrmPackage[] }> {
    const roots = new Set<string>(installDevclasses);
    if (installed.getDevclass()) {
        roots.add(installed.getDevclass());
    }
    const subtree = new Set(Array.from(roots, normalize));
    const parents = new Map<string, string>();
    for (const devclass of roots) {
        for (const subpackage of await SystemConnector.getSubpackages(devclass)) {
            subtree.add(normalize(subpackage.devclass));
            if (subpackage.parentcl) {
                parents.set(normalize(subpackage.devclass), normalize(subpackage.parentcl));
            }
        }
    }
    const all = getPackagesInstalledIn(systemPackages, installed, subtree);
    const nestedDevclasses = new Set(all.map(pkg => normalize(pkg.getDevclass())));
    const outermost = all.filter(pkg => {
        const visited = new Set<string>();
        let parent = parents.get(normalize(pkg.getDevclass()));
        while (parent && !visited.has(parent)) {
            if (nestedDevclasses.has(parent)) {
                return false;
            }
            visited.add(parent);
            parent = parents.get(parent);
        }
        return true;
    });
    return { outermost, all };
}

/**
 * Dirty entries of the deleted package that belong to the TRM packages installed under it:
 * their installs (landscape transports) and their own changes, which their delete confirms.
 */
export async function withoutNestedDirtyEntries(entries: ZTRM_DIRTY[], nested: TrmPackage[]): Promise<ZTRM_DIRTY[]> {
    if (entries.length === 0 || nested.length === 0) {
        return entries;
    }
    const nestedNames = new Set(nested.map(pkg => pkg.packageName));
    const nestedEntries = new Set(nested.flatMap(pkg => pkg.getDirtyEntries())
        .map(o => `${o.trkorr}|${o.pgmid}|${o.object}|${o.objName}`));
    const nestedTransports = new Set<string>();
    for (const trkorr of new Set(entries.map(o => o.trkorr))) {
        if (nestedNames.has(await new Transport(trkorr).getTrmPackageName())) {
            nestedTransports.add(trkorr);
        }
    }
    return entries.filter(o => !nestedTransports.has(o.trkorr)
        && !nestedEntries.has(`${o.trkorr}|${o.pgmid}|${o.object}|${o.objName}`));
}

/**
 * Workflow step that deletes the TRM packages installed in the SAP packages of the deleted one.
 *
 * Their SAP packages are deleted with the package anyway: running the delete action for each
 * also removes their customizing and records, and forwards their deletion. Their rollbacks are
 * retained, so a later failure restores them too.
 *
*/
export const deleteNestedPackages: Step<DeleteWorkflowContext> = {
    name: 'delete-nested-packages',
    filter: async (context: DeleteWorkflowContext): Promise<boolean> => {
        if (context.runtime.nestedPackages.all.length === 0) {
            Logger.log(`Skipping nested packages delete (no TRM packages installed under ${context.runtime.update.packageName})`, true);
            return false;
        }
        return true;
    },
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        const { outermost, all } = context.runtime.nestedPackages;
        Logger.warning(`${all.length} TRM package(s) installed in the SAP packages of ${context.runtime.update.packageName} will be deleted too: ${all.map(pkg => pkg.packageName).join(', ')}.`, { important: true });
        const deletingPackages = [...(context.deletingPackages || []), context.runtime.update, ...all];
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        let counter = 0;
        for (const nested of outermost) {
            counter++;
            const prefix = `(${counter}/${outermost.length}) `;
            try {
                Logger.setPrefix(originalLPrefix ? `${originalLPrefix}-> ${prefix}` : `  ${prefix}`);
                Inquirer.setPrefix(originalIPrefix ? `${originalIPrefix}-> ${prefix}` : `  ${prefix}`);
                Logger.loading(`Getting ready to delete nested package "${nested.packageName}"...`);
                const result = await deleteWithRollback({
                    contextData: {
                        noInquirer: context.rawInput.contextData.noInquirer,
                        systemPackages: [...context.rawInput.contextData.systemPackages]
                    },
                    packageData: {
                        name: nested.packageName,
                        registry: nested.registry
                    },
                    deleteData: {
                        checks: { ...context.rawInput.deleteData.checks },
                        landscapeTransport: { ...context.rawInput.deleteData.landscapeTransport }
                    }
                }, deletingPackages.filter(pkg => pkg !== nested), context.lockScope);
                context.runtime.nestedRollbacks.push(result.rollback);
                context.runtime.nestedReleases.push(result.release);
            } finally {
                Logger.setPrefix(originalLPrefix);
                Inquirer.setPrefix(originalIPrefix);
            }
        }
        // The cleanup must not see them as installed anymore.
        context.rawInput.contextData.systemPackages = context.rawInput.contextData.systemPackages
            .filter(pkg => !all.includes(pkg));
    },
    revert: async (context: DeleteWorkflowContext): Promise<void> => {
        let firstError: unknown;
        for (const rollback of [...(context.runtime.nestedRollbacks || [])].reverse()) {
            try {
                await rollback();
            } catch (error) {
                firstError ||= error;
            }
        }
        context.runtime.nestedRollbacks = [];
        if (firstError) {
            throw firstError;
        }
    }
}
