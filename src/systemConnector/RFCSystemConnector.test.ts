import { Logger } from "trm-commons";
import { RFCSystemConnector } from ".";

jest.mock("../client", () => ({
    ...jest.requireActual("../client"),
    RFCClient: jest.fn()
}));

describe("RFCSystemConnector", () => {
    const login = () => ({ user: "developer", passwd: "pw", lang: "EN", client: "001" } as any);
    const connection = () => ({ ashost: "vhcala4hci", sysnr: "00" });
    const mockClient = (client: any) => {
        const { RFCClient } = jest.requireMock("../client");
        (RFCClient as jest.Mock).mockImplementation(() => client);
    };

    beforeEach(() => {
        jest.spyOn(Logger, "log").mockImplementation(() => undefined);
        jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
        jest.spyOn(Logger, "success").mockImplementation(() => undefined);
        jest.spyOn(Logger, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("system ID is not available before connect", () => {
        mockClient({});
        const connector = new RFCSystemConnector(connection(), login());
        expect(() => connector.getDest()).toThrow(/connect to the system first/);
    });

    test("system ID is read from the system on connect", async () => {
        const client = { open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H") };
        mockClient(client);
        const connector = new RFCSystemConnector(connection(), login());
        await connector.connect(true);
        expect(client.getDest).toHaveBeenCalledTimes(1);
        expect(connector.getDest()).toBe("A4H");
    });

    test("connect fails when the system ID can't be read", async () => {
        const client = { open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockRejectedValue(new Error("boom")) };
        mockClient(client);
        const connector = new RFCSystemConnector(connection(), login());
        await expect(connector.connect(true)).rejects.toThrow("boom");
        expect(() => connector.getDest()).toThrow(/connect to the system first/);
    });

    test("new connection keeps the system ID of the same system", async () => {
        mockClient({ open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H") });
        const connector = new RFCSystemConnector(connection(), login());
        await connector.connect(true);
        expect(connector.getNewConnection().getDest()).toBe("A4H");
    });

    test("connecting log shows the SAProuter when set", async () => {
        const loading = jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
        mockClient({ open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H") });
        await new RFCSystemConnector({ ...connection(), saprouter: "/H/router.example.com/S/3299" }, login()).connect(true);
        expect(loading).toHaveBeenCalledWith("Connecting to vhcala4hci thru /H/router.example.com/S/3299...", true);
    });

    test("connecting log shows only the application server without SAProuter", async () => {
        const loading = jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
        mockClient({ open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H") });
        await new RFCSystemConnector(connection(), login()).connect(true);
        expect(loading).toHaveBeenCalledWith("Connecting to vhcala4hci...", true);
    });
});
