import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { Inquirer } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Get transport entries and check. A TRM Package must have one DEVC (ABAP Package) and TADIR (Workbench objects) transports.
 * 
 * Optionally, one LANG (Translation) and one (or more) CUST (Customizing) transport.
 * 
 * 1- fill lang import
 * 
 * 2- fill cust import
 * 
 * 3- get entries of requested transports
 * 
 * 4- check devc and tadir existance
 * 
*/
export const createTransports: Step<InstallWorkflowContext> = {
    name: 'create-transports',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Create transports step', true);

        if(!context.runtime.packageTransports.devc.binaries.binaries && context.rawInput.installData.installDevclass.keepOriginal){
            Logger.loading(`Generating transport...`);
            const dummy = await Transport.createToc({
                text: context.runtime.remotePackageData.data.transports.find(o => o.trkorr === context.runtime.packageTransports.devc.binaries.trkorr)?.description || `${context.rawInput.packageData.name} DEVC`,
                target: SystemConnector.getDest(),
                trmIdentifier: TrmTransportIdentifier.DEVC
            });
            await dummy.release(false, true);
            context.runtime.packageTransports.devc.binaries.binaries = await context.rawInput.packageData.registry.transport(context.runtime.packageTransports.devc.binaries.trkorr, dummy.trkorr);
            
        }
    }
}