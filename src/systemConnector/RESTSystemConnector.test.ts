import { Logger } from "trm-commons";
import { RESTSystemConnector } from ".";

jest.mock("../client", () => ({
    ...jest.requireActual("../client"),
    RESTClient: jest.fn()
}));

describe("RESTSystemConnector", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("does not log the password when connection data carries login fields", () => {
        const logSpy = jest.spyOn(Logger, "log").mockImplementation(() => undefined);
        const connection: any = {
            endpoint: "http://sap.example.com:50000",
            rfcdest: "NONE",
            client: "001",
            user: "DEVELOPER",
            passwd: "s3cr3t-pw",
            lang: "EN"
        };

        new RESTSystemConnector(connection, { user: "developer", passwd: "s3cr3t-pw", lang: "EN", client: "001" } as any);

        const logged = logSpy.mock.calls.map(call => String(call[0])).join("\n");
        expect(logged).toContain("REST connection data before normalize");
        expect(logged).toContain("REST connection data after normalize");
        expect(logged).toContain("http://sap.example.com:50000/ztrmserver");
        expect(logged).not.toContain("s3cr3t-pw");
    });

    describe("system ID", () => {
        const login = () => ({ user: "developer", passwd: "pw", lang: "EN", client: "001" } as any);
        const mockClient = (client: any) => {
            const { RESTClient } = jest.requireMock("../client");
            (RESTClient as jest.Mock).mockImplementation(() => client);
        };

        beforeEach(() => {
            jest.spyOn(Logger, "log").mockImplementation(() => undefined);
            jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
            jest.spyOn(Logger, "success").mockImplementation(() => undefined);
            jest.spyOn(Logger, "error").mockImplementation(() => undefined);
        });

        test("is not available before connect", () => {
            mockClient({});
            const connector = new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login());
            expect(() => connector.getDest()).toThrow(/connect to the system first/);
        });

        test("is read from the system on connect", async () => {
            const client = { open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H") };
            mockClient(client);
            const connector = new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login());
            await connector.connect(true);
            expect(client.getDest).toHaveBeenCalledTimes(1);
            expect(connector.getDest()).toBe("A4H");
        });

        test("system info includes the database and kernel read through trm-rest", async () => {
            const client = {
                open: jest.fn().mockResolvedValue(undefined),
                getDest: jest.fn().mockResolvedValue("A4H"),
                readTable: jest.fn().mockResolvedValue([{ component: "SAP_BASIS", release: "758", extrelease: "0002" }]),
                getSystemRuntimeInfo: jest.fn().mockResolvedValue({ dest: "A4H", dbSystem: "HDB", kernelRelease: "793" })
            };
            mockClient(client);
            const connector = new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login());
            await connector.connect(true);
            await expect(connector.getSystemInfo()).resolves.toEqual({
                basisRelease: "758", basisSp: "0002", product: "NETWEAVER", productRelease: "758", productSp: "0002", dbSystem: "HDB", kernelRelease: "793"
            });
            expect(client.getSystemRuntimeInfo).toHaveBeenCalledTimes(1);
        });

        test("system info skips the database and kernel when trm-rest lacks them", async () => {
            const client = {
                open: jest.fn().mockResolvedValue(undefined),
                getDest: jest.fn().mockResolvedValue("A4H"),
                readTable: jest.fn().mockResolvedValue([{ component: "SAP_BASIS", release: "758", extrelease: "0002" }]),
                getSystemRuntimeInfo: jest.fn()
            };
            mockClient(client);
            const connector = new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login());
            await connector.connect(true);
            await expect(connector.getSystemInfo(["trmRest71"])).resolves.toEqual({
                basisRelease: "758", basisSp: "0002", product: "NETWEAVER", productRelease: "758", productSp: "0002"
            });
            expect(client.getSystemRuntimeInfo).not.toHaveBeenCalled();
        });

        test("connect doesn't read the system info", async () => {
            const client = { open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockResolvedValue("A4H"), readTable: jest.fn(), getSystemRuntimeInfo: jest.fn() };
            mockClient(client);
            await new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login()).connect(true);
            expect(client.readTable).not.toHaveBeenCalled();
            expect(client.getSystemRuntimeInfo).not.toHaveBeenCalled();
        });

        test("connect fails when the system ID can't be read", async () => {
            const client = { open: jest.fn().mockResolvedValue(undefined), getDest: jest.fn().mockRejectedValue(new Error("boom")) };
            mockClient(client);
            const connector = new RESTSystemConnector({ endpoint: "http://vhcala4hci:50000" }, login());
            await expect(connector.connect(true)).rejects.toThrow("boom");
            expect(() => connector.getDest()).toThrow(/connect to the system first/);
        });
    });

    describe("endpoint normalization", () => {
        const login = () => ({ user: "developer", passwd: "pw", lang: "EN", client: "001" } as any);
        const endpointOf = (endpoint: string) => {
            jest.spyOn(Logger, "log").mockImplementation(() => undefined);
            return new RESTSystemConnector({ endpoint }, login()).getConnectionData().endpoint;
        };

        test.each([
            ["http://vhcala4hci:50000", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/", "http://vhcala4hci:50000/ztrmserver"],
            ["  http://vhcala4hci:50000  ", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/ztrmserver", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/ztrmserver/", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/ztrmserver?sap-client=001", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/?sap-client=001&sap-language=EN#top", "http://vhcala4hci:50000/ztrmserver"],
            ["http://vhcala4hci:50000/sap/bc/gui/sap/its/webgui?sap-client=001", "http://vhcala4hci:50000/ztrmserver"],
            ["HTTP://VHCALA4HCI:50000/ZTRMSERVER", "http://vhcala4hci:50000/ztrmserver"],
            ["https://user:secret@sap.example.com:44300/ztrmserver", "https://sap.example.com:44300/ztrmserver"],
            ["https://sap.example.com:443/ztrmserver", "https://sap.example.com/ztrmserver"],
            ["vhcala4hci:50000", "http://vhcala4hci:50000/ztrmserver"],
            ["vhcala4hci:50000/ztrmserver?sap-client=001", "http://vhcala4hci:50000/ztrmserver"],
            ["https://proxy.example.com/sap-dev/ztrmserver", "https://proxy.example.com/sap-dev/ztrmserver"],
            ["https://proxy.example.com/sap/dev/ztrmserver/?sap-client=001", "https://proxy.example.com/sap/dev/ztrmserver"],
            ["https://proxy.example.com//sap-dev//ZTRMSERVER/some/path#x", "https://proxy.example.com/sap-dev/ztrmserver"],
            ["https://proxy.example.com/sap-dev", "https://proxy.example.com/ztrmserver"],
            ["https://proxy.example.com/ztrmserverx/ztrmserver", "https://proxy.example.com/ztrmserverx/ztrmserver"]
        ])("%s -> %s", (input, expected) => {
            expect(endpointOf(input)).toBe(expected);
        });

        test.each(["", "http://", "ftp://vhcala4hci:50000"])("rejects invalid endpoint %p", input => {
            expect(() => endpointOf(input)).toThrow(/Invalid REST endpoint/);
        });
    });
});
