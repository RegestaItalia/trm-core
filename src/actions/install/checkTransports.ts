import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmTransportIdentifier } from "../../transport";

export const checkTransports: Step<InstallWorkflowContext> = {
    name: 'check-transports',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const r3trans = context.runtime.r3trans;
        const oArtifact = context.runtime.trmArtifact;
        Logger.loading(`Reading transports...`);
        const aTransports = await oArtifact.getTransportBinaries();
        Logger.log(`Package content: ${aTransports.map(o => {
            return {
                trkorr: o.trkorr,
                type: o.type
            }
        })}`, true);
        for (const transport of aTransports) {
            try {
                await r3trans.isTransportValid(transport.binaries.data);
                Logger.log(`Transport ${transport.trkorr} is valid.`, true);
            } catch (e) {
                throw new Error(`Package contains invalid transport.`);
            }
        }
        const aDevcTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.DEVC);
        const aTadirTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.TADIR);
        const aLangTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.LANG);
        if(aDevcTransports.length !== 1){
            throw new Error(`Unexpected declaration of devclass in package ${packageName}.`);
        }else{
            context.runtime.devcTransport = aDevcTransports[0];
            Logger.log(`DEVC transport is ${aDevcTransports[0].trkorr}.`, true);
        }
        if(aTadirTransports.length > 0){
            if(aTadirTransports.length !== 1){
                throw new Error(`Unexpected declaration of objects in package ${packageName}.`);
            }
            context.runtime.tadirTransport = aTadirTransports[0];
            Logger.log(`TADIR transport is ${aTadirTransports[0].trkorr}.`, true);
        }
        if(aLangTransports.length > 0){
            if(aLangTransports.length !== 1){
                throw new Error(`Unexpected declaration of translations in package ${packageName}.`);
            }
            context.runtime.langTransport = aLangTransports[0];
            Logger.log(`LANG transport is ${aLangTransports[0].trkorr}.`, true);
        }
    }
}