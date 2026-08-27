import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { IActionContext } from "..";

/**
 * Workflow step that populates `contextData.systemPackages` from the target system.
 *
 * A caller-supplied package list is preserved, allowing workflows to reuse a cached
 * snapshot and avoid an additional system query.
 */
export const setSystemPackages: Step<IActionContext> = {
    name: 'set-system-packages',
    run: async (context: IActionContext): Promise<void> => {
        //1- set system packages
        if(!context.rawInput.contextData){ //guard
            context.rawInput.contextData = {};
        }
        if(context.rawInput.contextData.systemPackages === undefined){
            Logger.loading(`Reading system data...`);
            context.rawInput.contextData.systemPackages = await SystemConnector.getInstalledPackages(true);
        }
    }
}
