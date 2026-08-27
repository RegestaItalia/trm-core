import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { ClientError } from "../../client";

/**
 * Workflow step that verifies the connected user may call the TRM server APIs.
 *
 * Place this before steps that read or mutate the SAP system. The step propagates the
 * connector's `ClientError` when authorization is denied.
 */
export const checkServerAuth: Step<any> = {
    name: 'check-server-auth',
    run: async (): Promise<void> => {
        //1- check auth
        const auth = await SystemConnector.isServerApisAllowed();
        if (auth instanceof ClientError) {
            throw auth;
        }
    }
}
