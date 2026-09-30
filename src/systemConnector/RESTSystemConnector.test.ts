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
});
