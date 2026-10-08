import { Logger } from "trm-commons";
import { OpenRFCSystemConnector, RFCSystemConnector } from ".";

const mockOpenRfcClient = jest.fn().mockImplementation(() => ({ open: jest.fn().mockResolvedValue(undefined) }));
jest.mock("open-rfc", () => ({ Client: mockOpenRfcClient }));

describe("OpenRFCSystemConnector", () => {
    const login = () => ({ user: "developer", passwd: "pw", lang: "EN", client: "001" } as any);
    const connection = () => ({ ashost: "vhcala4hci", sysnr: "00" });

    beforeEach(() => {
        jest.spyOn(Logger, "log").mockImplementation(() => undefined);
        jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
        jest.spyOn(Logger, "success").mockImplementation(() => undefined);
        mockOpenRfcClient.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("opens the connection through open-rfc instead of node-rfc", async () => {
        const connector = new OpenRFCSystemConnector(connection(), login());
        expect(connector).toBeInstanceOf(RFCSystemConnector);
        await (connector as any)._client.open();
        expect(mockOpenRfcClient).toHaveBeenCalledTimes(1);
        expect(mockOpenRfcClient).toHaveBeenCalledWith({ ashost: "vhcala4hci", sysnr: "00", user: "DEVELOPER", passwd: "pw", lang: "EN", client: "001" });
    });

    test("new connections keep using open-rfc", async () => {
        const connector = new OpenRFCSystemConnector(connection(), login()).getNewConnection();
        expect(connector).toBeInstanceOf(OpenRFCSystemConnector);
        await (connector as any)._client.open();
        expect(mockOpenRfcClient).toHaveBeenCalledTimes(1);
    });
});
