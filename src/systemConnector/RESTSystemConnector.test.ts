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

    describe("endpoint normalization", () => {
        const login = () => ({ user: "developer", passwd: "pw", lang: "EN", client: "001" } as any);
        const endpointOf = (endpoint: string) => {
            jest.spyOn(Logger, "log").mockImplementation(() => undefined);
            return new RESTSystemConnector({ endpoint }, login()).getDest();
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
