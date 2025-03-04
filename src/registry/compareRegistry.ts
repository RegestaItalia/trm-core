import { IRegistry } from "./IRegistry";

export function compareRegistry(registry1: IRegistry, registry2: IRegistry): boolean {
    if(registry1.constructor === registry2.constructor){
        return registry1.endpoint === registry2.endpoint;
    }else{
        return false;
    }
}