import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { ClientError } from "../../client";

/**
 * This action should be the first step for any flow that requires user auth to system
 * 
 * 1- check auth
 * 
*/
export const checkServerAuth: Step<any> = {
    name: 'check-server-auth',
    run: async (): Promise<void> => {
        Logger.log('Check server auth step', true);

        //1- check auth
        const auth = await SystemConnector.isServerApisAllowed();
        if (auth instanceof ClientError) {
            throw auth;
        }
    }
}