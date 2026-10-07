import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector, TRM_REST_PACKAGE_NAME, TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { RegistryType } from "../../registry";
import { TrmPackage } from "../../trmPackage";
import { setLandscapeTarget } from "../commons/prompts";
import { getNestedPackages } from "./deleteNestedPackages";

/**
 * Workflow step that finds the installed package and initializes rollback state.
 *
 * 1- fill missing input data
 *
 * 2- find installed package and its TRM packages table record
 *
 * 3- check if package can be deleted
 *
 * 4- check/set system target
 *
 * 5- fill context data, including the TRM packages installed under the deleted one
 *
*/
export const init: Step<DeleteWorkflowContext> = {
    name: 'init',
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        const registry = context.rawInput.packageData.registry;

        //1- fill missing input data
        if (!context.rawInput.deleteData) {
            context.rawInput.deleteData = {};
        }
        if (!context.rawInput.deleteData.checks) {
            context.rawInput.deleteData.checks = {};
        }
        if (!context.rawInput.deleteData.landscapeTransport) {
            context.rawInput.deleteData.landscapeTransport = {};
        }

        //2- find installed package
        //the registry generates the deletion transport
        if (registry.getRegistryType() === RegistryType.LOCAL) {
            throw new Error(`Delete aborted. Deletion transports can't be generated from a local registry.`);
        }
        const installed = context.rawInput.contextData.systemPackages.find(o => o.manifest
            && TrmPackage.compare(o, new TrmPackage(context.rawInput.packageData.name, registry)));
        if (!installed) {
            throw new Error(`Package ${context.rawInput.packageData.name} is not installed in ${SystemConnector.getDest()}.`);
        }
        // Without its TRM packages table row the record would survive the delete:
        // the row is missing when the backend read failed, so read it again before changing anything.
        if (!installed.getMetadataSnapshot()) {
            Logger.loading(`Reading TRM data...`, true);
            const snapshot = (await SystemConnector.getInstalledPackages(true)).find(o => o.manifest
                && TrmPackage.compare(o, installed))?.getMetadataSnapshot();
            if (!snapshot) {
                throw new Error(`Delete aborted. The TRM packages table record of ${context.rawInput.packageData.name} could not be read from ${SystemConnector.getDest()}.`);
            }
            installed.setMetadataSnapshot(snapshot);
        }

        //3- check if package can be deleted
        if (registry.getRegistryType() === RegistryType.PUBLIC
            && (installed.packageName === TRM_SERVER_PACKAGE_NAME || installed.packageName === TRM_REST_PACKAGE_NAME)) {
            throw new Error(`Delete aborted. ${installed.packageName} is required by TRM and can't be deleted.`);
        }
        if (installed.isDirty() && !context.rawInput.deleteData.checks.ignoreDirty) {
            const reason = `${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be deleted`;
            if (context.rawInput.contextData.noInquirer) {
                throw new Error(`Delete aborted. ${reason}: set the ignoreDirty check to delete it without prompts.`);
            }
            Logger.warning(`${reason}!`);
            Logger.warning(`Consider analyzing dirty entries before delete.`);
            const { ignoreDirty } = await Inquirer.prompt({
                message: `Continue with delete?`,
                type: 'confirm',
                default: false,
                name: 'ignoreDirty'
            });
            if (!ignoreDirty) {
                throw new Error(`Delete aborted. ${reason}.`);
            }
        } else if (installed.isDirty()) {
            Logger.warning(`${context.rawInput.packageData.name} has changes made on ${SystemConnector.getDest()} that will be deleted!`, { important: true });
        }

        //4- check/set system target
        //objects of a temporary package only exist on this system
        if (!(installed.getDevclass() || '').trim().startsWith('$')) {
            context.rawInput.deleteData.landscapeTransport.targetSystem = await setLandscapeTarget(
                context.rawInput.contextData.noInquirer,
                context.rawInput.deleteData.landscapeTransport.targetSystem,
                "Deletion transport target",
                "Deletion transport won't be forwarded."
            );
        }

        //5- fill context data
        //install mappings are queried case-sensitively: use the stored name and registry, not the input
        const previousInstallPackages = await SystemConnector.getInstallPackages(
            installed.packageName,
            installed.registry
        );
        context.runtime = {
            update: installed,
            previousInstallPackages,
            previousInstallTransports: await SystemConnector.getInstallTransports(
                installed.packageName,
                installed.registry
            ),
            dele: undefined,
            stopWarningShown: false,
            nestedPackages: await getNestedPackages(
                context.rawInput.contextData.systemPackages,
                installed,
                previousInstallPackages.map(replacement => replacement.installDevclass)
            ),
            nestedRollbacks: [],
            nestedReleases: []
        };
        context.output = {
            manifest: installed.manifest.get(),
            transport: undefined,
            targetSystem: undefined
        };
        context.revert = {
            sapPackages: [],
            dele: undefined,
            deleImportStarted: false,
            deleInTargetTms: false,
            metadataRemoveStarted: false,
            metadataPreviousPackageRow: undefined
        };

        Logger.info(`Ready to delete ${installed.packageName} v${installed.manifest.get().version}.`);
    }
}
