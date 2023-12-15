import { PackageName } from "./PackageName";
import { validateOrganizationName } from "./validateOrganizationName";

export function parsePackageName(args: {
    fullName?: string,
    name?: string,
    organization?: string
}): PackageName {
    var result: PackageName;
    if(args.fullName){
        try{
            const match = args.fullName.match(/^@(.*)\/(.*)$/);
            result = {
                fullName: match[0],
                organization: match[1],
                name: match[2]
            };
        }catch(e){
            result = {
                fullName: args.fullName,
                name: args.fullName
            };
        }
    }else if(args.name){
        var fullName: string;
        if (args.organization) {
            fullName = `@${args.organization}/${args.name}`;
        } else {
            fullName = args.name;
        }
        result = {
            fullName,
            organization: args.organization,
            name: args.name
        };
    }else{
        throw new Error('Package name not specified.');
    }
    
    result.fullName = result.fullName.toLowerCase();
    result.name = result.name.toLowerCase();
    if(!result.name.match(/^[a-z\-0-9\.]*$/)){
        throw new Error('Invalid package name.');
    }
    if(result.organization){
        result.organization = validateOrganizationName(result.organization);
    }
    if(result.fullName.length > 42){
        throw new Error('Package name cannot exceede 42 characters limit.');
    }
    return result;
}