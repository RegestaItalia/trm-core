import { RegistryType } from "../registry";

export function validatePackageVisibility(registryType: RegistryType, isPrivate: boolean, latestReleaseVisibility: boolean): string|true {
    if(registryType === RegistryType.PUBLIC){
        if(latestReleaseVisibility !== undefined){
            if(isPrivate !== latestReleaseVisibility){
                return `Cannot change package visibility from ${isPrivate ? 'private' : 'public'} to ${latestReleaseVisibility ? 'private' : 'public'}.`;
            }
        }
        return true;
    }else{
        return true;
    }
}