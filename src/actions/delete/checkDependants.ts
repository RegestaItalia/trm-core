import { Step } from "@simonegaffurini/sammarksworkflow";
import { Inquirer, Logger } from "trm-commons";
import { DeleteWorkflowContext } from ".";
import { getDependants } from "../install/checkDependants";
import { TrmPackage } from "../../trmPackage";

/**
 * Asks for confirmation before deleting a package that other installed packages depend on.
 * Without prompts, the delete is aborted. Packages deleted by the same run are not dependants.
 */
export const checkDependants: Step<DeleteWorkflowContext> = {
    name: 'check-dependants',
    filter: async (context: DeleteWorkflowContext): Promise<boolean> => {
        if (context.rawInput.deleteData.checks.noDependants) {
            Logger.log(`Skipping check dependants (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        const deletedPackage = context.runtime.update;
        // Packages deleted by the same run don't count: the ones this is installed under, and the nested ones.
        const deleting = [...(context.deletingPackages || []), ...context.runtime.nestedPackages.all];
        const dependants = getDependants(context.rawInput.contextData.systemPackages, deletedPackage)
            .filter(dependant => !deleting.some(pkg => TrmPackage.compare(pkg, dependant.package)));
        if (dependants.length === 0) {
            Logger.info(`No installed packages depend on "${deletedPackage.packageName}".`, true);
            return;
        }
        dependants.forEach(dependant => Logger.warning(
            `Dependant "${dependant.package.packageName}" requires "${deletedPackage.packageName}" ${dependant.range}.`
        ));
        let ignoreDependants = false;
        if (!context.rawInput.contextData.noInquirer) {
            ignoreDependants = (await Inquirer.prompt({
                message: `${dependants.length} installed package(s) depend on "${deletedPackage.packageName}" and might stop working. Continue with delete?`,
                type: 'confirm',
                default: false,
                name: 'ignoreDependants'
            })).ignoreDependants;
        }
        if (!ignoreDependants) {
            throw new Error(`Delete aborted: installed packages depend on "${deletedPackage.packageName}".`);
        }
    }
};
