import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { TrmTransportIdentifier } from "../../transport";
import { Manifest } from "../../manifest";
import chalk from "chalk";

/**
 * Release install transports (if created and with entries)
 * 
 * 1- add comments, documentation and rename transport, release/delete install transports
 * 
*/
export const releaseInstallTransports: Step<InstallWorkflowContext> = {
    name: 'release-install-transports',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.installData.transports.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping release of install transports (no transports generated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Release install transports step', true);

        //1- add comments, documentation and rename transport, release/delete install transports
        var transportsStatus: {
            type: TrmTransportIdentifier,
            trkorr: string,
            len: number,
            success: boolean
        }[] = [];
        Logger.loading(`Releasing install transports...`);
        for (const transport of context.runtime.installData.transports) {
            var len;
            const index = (transportsStatus.push({
                type: transport.type,
                trkorr: transport.transport.trkorr,
                len: 0,
                success: false
            }) - 1);
            try {
                await transport.transport.removeComments();
                len = (await transport.transport.getE071()).length;
                transportsStatus[index].len = len;
                if (len === 0) {
                    await transport.transport.delete();
                } else {
                    await transport.transport.addComment(`name=${context.runtime.remotePackageData.manifest.name}`);
                    await transport.transport.addComment(`version=${context.runtime.remotePackageData.manifest.version}`);
                    await transport.transport.setDocumentation(new Manifest(context.runtime.remotePackageData.manifest).getAbapXml());
                    await transport.transport.rename(`@X1@TRM: ${context.runtime.remotePackageData.manifest.name} v${context.runtime.remotePackageData.manifest.version} ${transport.type === TrmTransportIdentifier.CUST ? '(C)' : ''}`.trim());
                    await transport.transport.release(true, true);
                }
                transportsStatus[index].success = true;
            } catch (e) {
                Logger.error(`Error on finalize step of transport ${transport.transport.trkorr}`, true);
                Logger.error(e.toString(), true);
                transportsStatus[index].success = false;
            }
        }
        transportsStatus.forEach(o => {
            if (o.success) {
                if (o.len > 0) {
                    Logger.success(`Use ${o.type === TrmTransportIdentifier.TADIR ? 'workbench' : 'customizing'} transport ${chalk.bold(o.trkorr)} in ${SystemConnector.getDest()} landscape transports.`);
                }
            } else {
                if (o.len > 0) {
                    Logger.error(`Error on release of ${o.type === TrmTransportIdentifier.TADIR ? 'workbench' : 'customizing'} transport ${chalk.bold(o.trkorr)}.`);
                    context.runtime.installData.transports = context.runtime.installData.transports.filter(o => o.transport.trkorr !== o.transport.trkorr);
                }
            }
        });
    }
}