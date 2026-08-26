import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport, TrmTransportIdentifier } from "../../transport";
import { stopWarning } from "../stopWarning";

/**
 * Import CUST Transport. For each customizing:
 * 
 * 1- generate dummy transport (if registry is not local)
 * 
 * 2- upload transport binaries
 * 
 * 3- import transport
 * 
*/
export const importCustTransport: Step<InstallWorkflowContext> = {
    name: 'import-cust-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.import.noCust) {
            Logger.log(`Skipping import CUST transport (user input)`, true);
            return false;
        } else {
            if (context.runtime.transports.cust.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping import CUST transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        var index = 0;
        for (var cust of context.runtime.transports.cust) {
            index++;
            const loggerTransportName = context.runtime.transports.cust.length > 1 ? `(${index}/${context.runtime.transports.cust.length}) customizing` : `customizing`;
            //1- generate dummy transport (if registry is not local)
            //checking if binaries are already loaded in context instead of checking registry local
            //is equivalent, but better for possible changes in the future
            //binaries for local registry are loaded in the checkTransports step
            if (!cust.binaries.binaries) {
                Logger.loading(`Generating ${loggerTransportName} transport...`);
                const dummy = await Transport.createToc({
                    text: context.runtime.package.data.transports.find(o => o.trkorr === cust.binaries.trkorr)?.description || `CUST ${index} ${context.rawInput.packageData.name}`,
                    target: SystemConnector.getDest(),
                    trmIdentifier: TrmTransportIdentifier.CUST
                });
                await dummy.release(false, true);
                try {
                    //saving dummy binaries for a possible revert
                    context.revert.transports.cust.push({
                        trkorr: dummy.trkorr,
                        entries: undefined,
                        binaries: (await dummy.download()).binaries
                    });
                } catch (e) {
                    Logger.error(`Unable to dowload dummy transport!`, true);
                    Logger.error(e.toString(), true);
                    Logger.error(`On failure, revert won't be possible!`, true);
                }
                cust.binaries.binaries = await context.rawInput.packageData.registry.transport(cust.binaries.trkorr, dummy.trkorr);
            }

            //2- upload transport binaries
            Logger.loading(`Uploading ${loggerTransportName} transport...`);
            cust.instance = await Transport.upload(
                cust.binaries.trkorr, {
                binary: cust.binaries.binaries,
                trTarget: SystemConnector.getDest()
            });

            //3- import transport
            const originalLPrefix = Logger.getPrefix();
            const originalIPrefix = Inquirer.getPrefix();
            const prefix = `(${Transport.getTransportIcon()}  Workbench) `;
            if (originalLPrefix) {
                Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
            } else {
                Logger.setPrefix(prefix);
            }
            if (originalIPrefix) {
                Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
            } else {
                Inquirer.setPrefix(prefix);
            }
            Logger.loading(`Importing ${cust.binaries.trkorr}`, true);
            await cust.instance.import();
            Logger.success(`Transport ${cust.binaries.trkorr} imported`, true);
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);

            //replace context instance with current instance
            context.runtime.transports.cust[index-1] = cust;
        }
    }
}