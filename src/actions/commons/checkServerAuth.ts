import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Workflow step that verifies the connected user may call the TRM server APIs.
 *
 * Place this before steps that read or mutate the SAP system. The step fails closed: it throws
 * the connector's `ClientError` when authorization is denied, and propagates any other error
 * raised while checking it.
 */
export const checkServerAuth: Step<any> = {
    name: 'check-server-auth',
    run: async (): Promise<void> => {
        //1- check auth
        const auth = await SystemConnector.isServerApisAllowed();
        if (auth !== true) {
            throw auth instanceof Error ? auth : new Error(`TRM server APIs authorization check failed.`);
        }
    }
}
