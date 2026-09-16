import { lockResources } from "./lockResources";

describe("install lock coverage", () => {
    test("locks mapped target packages and imported objects before dependency installation", async () => {
        const acquire = jest.fn().mockResolvedValue(undefined);
        const context = {
            lockScope: { acquire },
            rawInput: {
                packageData: { registry: { endpoint: "registry" } },
                installData: {
                    installDevclass: {
                        replacements: [{ originalDevclass: "Z_SOURCE", installDevclass: "Z_TARGET" }]
                    }
                }
            },
            runtime: {
                package: { data: { manifest: { name: "package-a" } }, hierarchy: { devclass: "Z_SOURCE" } },
                previousInstallPackages: [],
                transports: {
                    devc: { binaries: { trkorr: "DEVK900001", entries: {
                        e071: [{ pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE" }],
                        tadir: [{ pgmid: "R3TR", object: "DEVC", objName: "Z_SOURCE" }]
                    } } },
                    tadir: { binaries: { trkorr: "DEVK900002", entries: {
                        e071: [{ pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED" }],
                        tadir: [{ pgmid: "R3TR", object: "CLAS", objName: "Z_SHARED" }]
                    } } },
                    cust: []
                }
            }
        } as any;

        await lockResources.run(context);
        const resources = acquire.mock.calls[0][0];
        expect(resources).toContainEqual({ type: "DEVCLASS", name: "Z_TARGET" });
        expect(resources).toContainEqual({ type: "OBJECT", name: "R3TR DEVC Z_TARGET" });
        expect(resources).not.toContainEqual({ type: "OBJECT", name: "R3TR DEVC Z_SOURCE" });
        expect(resources).toContainEqual({ type: "OBJECT", name: "R3TR CLAS Z_SHARED" });
        expect(resources).toContainEqual({ type: "TRANSPORT", name: "DEVK900002" });
        expect(resources).toContainEqual({ type: "PACKAGE", name: "package-a [registry]" });
    });
});
