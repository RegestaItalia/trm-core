import { RFCClient } from "../client";
import { Login } from "../client/Login";
import { RFCConnection } from "./RFCConnection";
import { RFCSystemConnector } from "./RFCSystemConnector";

/**
 * RFC system connector that uses open-rfc (SDK-free) instead of node-rfc.
 * Currently not supported (crashes, open-rfc is not declared in package.json), needs more checks
 * For internal use only.
 */
export class OpenRFCSystemConnector extends RFCSystemConnector {

    protected createClient(rfcClientArgs: RFCConnection & Login, cLangu: string, traceDir?: string): RFCClient {
        return new RFCClient(rfcClientArgs, cLangu, traceDir, undefined, () => import("open-rfc"));
    }

}
