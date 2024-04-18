import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { getPackageNamespace } from "../../commons";

export const generateWbTransport: Step<InstallWorkflowContext> = {
    name: 'generate-wb-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.skipWbTransportGen) {
            Logger.log(`Skip WB transport generation (input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        var wbObjectsAdd: {
            pgmid: string,
            object: string,
            objName: string
        }[] = [];
        const trmPackage = context.runtime.trmPackage;
        const manifest = context.runtime.trmManifest;
        const oManifest = context.runtime.manifest;
        const wbObjects = context.runtime.tadirData;
        const trCopy = context.runtime.trCopy;
        const targetSystem = context.parsedInput.wbTrTargetSystem;
        //for each transport object
        for (const wbObject of wbObjects) {
            //unless R3TR, add to new wb transport
            if (wbObject.pgmid === 'R3TR') {
                //if it's R3TR, get its devclass and check it's not $.
                //if it's not, add the object (as well as the devc)
                const objTadir = await SystemConnector.getObject(wbObject.pgmid, wbObject.object, wbObject.objName);
                const objPackageNs = getPackageNamespace(objTadir.devclass);
                if (objPackageNs !== '$') {
                    wbObjectsAdd.push(objTadir);
                    if (!wbObjectsAdd.find(o => o.pgmid === 'R3TR' && o.object === 'DEVC' && o.objName === objTadir.devclass)) {
                        wbObjectsAdd.push({
                            pgmid: 'R3TR',
                            object: 'DEVC',
                            objName: objTadir.devclass
                        });
                    }
                }
            } else {
                wbObjectsAdd.push(wbObject);
            }
        }

        if (wbObjectsAdd.length > 0 || trCopy.length > 0) {
            //if a non released trm request for this package is found, use it and rename
            var wbTransport = await SystemConnector.getPackageWorkbenchTransport(trmPackage);
            if (!wbTransport) {
                //if not, create a new workbench request
                wbTransport = await Transport.createWb({
                    text: `TRM generated transport`, //temporary name
                    target: targetSystem
                });
            }
            await wbTransport.addComment(`name=${manifest.name}`);
            await wbTransport.addComment(`version=${manifest.version}`);
            await wbTransport.setDocumentation(oManifest.getAbapXml());
            await wbTransport.rename(`@X1@TRM: ${manifest.name} v${manifest.version}`);

            //add objects and try to lock
            for (const wbObjectAdd of wbObjectsAdd) {
                try {
                    try {
                        await wbTransport.addObjects([wbObjectAdd], true);
                    } catch (e) {
                        await wbTransport.addObjects([wbObjectAdd], false);
                    }
                } catch (e) {
                    //object might be in transport already
                    //TODO handle this case better
                }
            }
            for (const trFrom of trCopy) {
                try {
                    await wbTransport.addObjectsFromTransport(trFrom);
                } catch (e) {
                    //object might be in transport already
                    //TODO handle this case better
                }
            }
            context.runtime.wbTransport = wbTransport;
            Logger.success(`Use ${wbTransport.trkorr} for transports.`);
        }
    }
}