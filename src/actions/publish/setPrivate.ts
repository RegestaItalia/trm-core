import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";
import { PUBLIC_RESERVED_KEYWORD } from "../../registry";

export const setPrivate: Step<PublishWorkflowContext> = {
    name: 'set-private',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var localPrivate: boolean;
        var remotePrivate: boolean;
        try {
            const latestPublishedManifest = (await context.runtime.dummyPackage.fetchRemoteManifest('latest')).get();
            remotePrivate = latestPublishedManifest.private || false;
        } catch (e) {
            Logger.error(e.toString(), true);
            Logger.error(`Couldn't fetch latest remote version for private prompt`, true);
        }
        if (typeof (context.parsedInput.packagePrivate) !== 'boolean') {
            localPrivate = remotePrivate;
        } else {
            localPrivate = context.parsedInput.packagePrivate;
        }
        if (typeof (localPrivate) !== 'boolean') {
            if(context.parsedInput.silent){
                throw new Error(`Running in silent mode and private flag was not set.`);
            }
            const inq1 = await Inquirer.prompt([{
                type: "list",
                message: "Package type",
                name: "private",
                default: false,
                choices: [{
                    name: "Public (Visible to all users)",
                    value: false
                }, {
                    name: "Private (Visible to you and users in organization, if specified)",
                    value: true
                }]
            }]);
            localPrivate = inq1.private;
        }
        if (typeof (remotePrivate) === 'boolean' && localPrivate !== remotePrivate) {
            const localType = localPrivate ? 'private' : PUBLIC_RESERVED_KEYWORD;
            const remoteType = remotePrivate ? 'private' : PUBLIC_RESERVED_KEYWORD;
            Logger.warning(`Changing package visibility ${remoteType} -> ${localType}`);
        }
        context.runtime.manifest.private = localPrivate;
    }
}