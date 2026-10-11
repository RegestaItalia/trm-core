import { RFCConnect } from "trm-commons";
import { ISystemConnector, OpenRFCSystemConnector } from "../systemConnector";

/**
 * Connection to an SAP system through RFC (open-rfc).
 *
 * Same connection data as {@link RFCConnect}, but the system connector
 * uses open-rfc instead of node-rfc.
 */
export class OpenRFCConnect extends RFCConnect {

    name = 'OPENRFC';
    description = 'RFC (Uses open-rfc)';

    public getSystemConnector(): ISystemConnector {
        const data = this.getData();
        return new OpenRFCSystemConnector(data, data);
    }

}
