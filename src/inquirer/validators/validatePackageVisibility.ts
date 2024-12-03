import { parsePackageName } from "../../commons";
import { RegistryType } from "../../registry";

export function validatePackageVisibility(registryType: RegistryType, packageName: string, isPrivate: boolean, latestReleaseVisibility: boolean): string|true {
    if(registryType === RegistryType.PUBLIC){
        if(latestReleaseVisibility !== undefined){
            if(isPrivate !== latestReleaseVisibility){
                return `Cannot change package visibility from ${isPrivate ? 'private' : 'public'} to ${latestReleaseVisibility ? 'private' : 'public'}.`;
            }
        }
        if(isPrivate){
            const packageNameParsed = parsePackageName({
                fullName: packageName
            });
            if(!packageNameParsed.organization){
                return `Private packages on public registry need a scope!`;
            }else{
                return true;
            }
        }else{
            return true;
        }
    }else{
        return true;
    }
}