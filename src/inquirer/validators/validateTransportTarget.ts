import { TR_TARGET } from "../../rfc/components";
import { TMSCSYS } from "../../rfc/struct";

export async function validateTransportTarget(target: TR_TARGET, systemTmscsys: TMSCSYS[]): Promise<string|true|void> {
    if (target) {
        target = target.trim().toUpperCase();
        if(!systemTmscsys.find(o => o.sysnam === target)){
            return `Transport target ${target} does not exist.`;
        }else{
            return true;
        }
    }
}