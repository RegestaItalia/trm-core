import { RFCConnect } from "trm-commons";
import { OpenRFCConnect } from ".";
import { OpenRFCSystemConnector } from "../systemConnector";

describe("OpenRFCConnect", () => {
    test("is the RFC connection, named OPENRFC", () => {
        const connect = new OpenRFCConnect();
        expect(connect).toBeInstanceOf(RFCConnect);
        expect(connect.name).toBe("OPENRFC");
        expect(connect.description).toBe("RFC (Uses open-rfc)");
        expect(connect.loginData).toBe(true);
    });

    test("returns an open-rfc system connector from the RFC connection data", () => {
        const connect = new OpenRFCConnect();
        connect.setData({ ashost: "vhcala4hci", sysnr: "00", client: "001", user: "DEVELOPER", passwd: "pw", lang: "EN" });
        const connector = connect.getSystemConnector();
        expect(connector).toBeInstanceOf(OpenRFCSystemConnector);
        expect(connector.getConnectionData()).toMatchObject({ ashost: "vhcala4hci", sysnr: "00" });
    });
});
