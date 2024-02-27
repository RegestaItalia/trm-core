import { DEVCLASS } from "../../client";
import { SystemConnector } from "../../systemConnector";

export async function validateDevclass(devclass: DEVCLASS): Promise<string|true|void> {
    if (devclass) {
        devclass = devclass.trim().toUpperCase();
        const c = devclass.charAt(0);
        if (c === '$') {
            return 'Temporary packages cannot be released. Move content to a transportable package.'
        } else {
            //return true;
            //check if this package exists
            const tdevc = await SystemConnector.getDevclass(devclass);
            if(!tdevc){
                return `Package ${devclass} does not exist.`;
            }else{
                return true;
            }
        }
    }
}