import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { IActionContext } from "..";

/**
 * Set system packages: if not defined by input, search in target system
 * 
 * 1- set system packages
 * 
*/
export const setSystemPackages: Step<IActionContext> = {
    name: 'setSystemPackages',
    run: async (context: IActionContext): Promise<void> => {
        Logger.log('Set system packages step', true);
        
        //1- set system packages
        if(context.rawInput.contextData.systemPackages === undefined){
            Logger.loading(`Reading system data...`);
            context.rawInput.contextData.systemPackages = await SystemConnector.getInstalledPackages(true);
        }
    }
}