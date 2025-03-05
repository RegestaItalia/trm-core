import { AbstractRegistry } from "./AbstractRegistry";
import { FileSystem, LOCAL_RESERVED_KEYWORD } from "./FileSystem";
import { PUBLIC_RESERVED_KEYWORD, Registry } from "./Registry";
import { RegistryType } from "./RegistryType";

export namespace RegistryProvider {

    export var registry: AbstractRegistry[] = [];
    
    export function getRegistry(endpoint?: string): AbstractRegistry {
        var foundRegistry: AbstractRegistry;
        if(endpoint){
            endpoint = endpoint.toLowerCase().trim();
        }
        if(!endpoint || endpoint === PUBLIC_RESERVED_KEYWORD){
            foundRegistry = registry.find(o => o.getRegistryType() === RegistryType.PUBLIC);
            if(!foundRegistry){
                foundRegistry = new Registry(PUBLIC_RESERVED_KEYWORD);
                registry.push(foundRegistry);
            }
        }else if(endpoint === LOCAL_RESERVED_KEYWORD){
            foundRegistry = new FileSystem();
        }else{
            foundRegistry = registry.find(o => o.endpoint === endpoint);
            if(!foundRegistry){
                foundRegistry = new Registry(endpoint, endpoint);
                registry.push(foundRegistry);
            }
        }
        return foundRegistry;
    }

}