import { TR_TARGET, TMSCSYS } from "../../client";

export async function validateTransportTarget(target: TR_TARGET, systemTmscsys: TMSCSYS[]): Promise<string|true> {
    if (target) {
        target = target.trim().toUpperCase();
        if(!systemTmscsys.find(o => o.sysnam === target)){
            return `Transport target ${target} does not exist.`;
        }else{
            return true;
        }
    }else{
        return `Transport target ${target} not provided.`;
    }
}