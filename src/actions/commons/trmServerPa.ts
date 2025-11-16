import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { TRM_SERVER_PACKAGE_NAME } from "../../systemConnector";
import { IActionContext } from "..";
import { RegistryProvider } from "../../registry";
import { PostActivity } from "../../manifest";

/**
 * This action should be run AFTER system packages are set, and everytime trm-server is used to ensure post activities are executed
 * 
 * 1- get trm-server
 * 
 * 2- execute pa
 * 
*/
export const trmServerPa: Step<IActionContext> = {
    name: 'trm-server-pa',
    run: async (context: IActionContext): Promise<void> => {
        Logger.log('Run trm-server pa step', true);

        //1- get trm-server
        const trmServerPackage = context.rawInput.contextData?.systemPackages?.find(o => o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(RegistryProvider.getRegistry()));

        //2- execute pa
        if (trmServerPackage) {
            const pa = trmServerPackage.manifest?.get().postActivities;
            if (pa) {
                Logger.setPrefix(`Initialize trm-server v${trmServerPackage.manifest?.get().version} -> `);
                for (const data of pa) {
                    try {
                        const postActivity = new PostActivity(data);
                        await postActivity.execute();
                    } catch (e) {
                        Logger.error(e.toString(), true);
                    }
                }
                Logger.removePrefix();
            }
        }
    }
}