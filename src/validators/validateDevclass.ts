import { DEVCLASS } from "../client";
import { SystemConnector } from "../systemConnector";

export async function validateDevclass(devclass: DEVCLASS, allowTemporaryPackages?: boolean): Promise<string|true> {
    if (devclass) {
        devclass = devclass.trim().toUpperCase();
        const c = devclass.charAt(0);
        if (c === '$' && !allowTemporaryPackages) {
            return 'Temporary packages cannot be released. Move content to a transportable package.'
        } else {
            //check if this package exists
            const tdevc = await SystemConnector.getDevclass(devclass);
            if(!tdevc){
                return `ABAP package "${devclass}" does not exist.`;
            }else{
                return true;
            }
        }
    }else{
        return `No ABAP package name was provided.`;
    }
}