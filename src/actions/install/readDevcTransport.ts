import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TDEVC, TDEVCT } from "../../client";
import { normalize } from "../../commons";

export const readDevcTransport: Step<InstallWorkflowContext> = {
    name: 'read-devc-transport',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const r3trans = context.runtime.r3trans;
        const devcTransport = context.runtime.devcTransport;
        const transportData = devcTransport.binaries.data;
        
        
        Logger.loading(`Checking package content...`);
        const tdevc: TDEVC[] = normalize(await r3trans.getTableEntries(transportData, 'TDEVC'));
        const tdevct: TDEVCT[] = normalize(await r3trans.getTableEntries(transportData, 'TDEVCT'));
        if (tdevc.length === 0) {
            throw new Error(`Package has no devclass data.`);
        }

        context.runtime.tdevcData = tdevc;
        context.runtime.tdevctData = tdevct;
    }
}