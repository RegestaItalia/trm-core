import { TARSYSTEM, TR_TARGET } from "../client";

export async function validateTransportTarget(target: TR_TARGET, systemTmscsys: TARSYSTEM[]): Promise<string|true> {
    if (target) {
        target = target.trim().toUpperCase();
        if(!systemTmscsys.find(o => o === target)){
            return `Transport target ${target} does not exist.`;
        }else{
            return true;
        }
    }else{
        return `Transport target ${target} not provided.`;
    }
}