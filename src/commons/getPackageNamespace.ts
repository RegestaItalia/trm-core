import { DEVCLASS } from "../client";

export function getPackageNamespace(devclass: DEVCLASS): string{
    const aDevclass = Array.from(devclass.toUpperCase());
    if(aDevclass[0] === 'Z'){
        return 'Z';
    }else if(aDevclass[0] === 'Y'){
        return 'Y';
    }else if(aDevclass[0] === '$'){
        return '$';
    }else if(/^(\/.*\/)/.test(devclass)){
        return devclass.toUpperCase().match(/^(\/.*\/)/)[1].toUpperCase();
    }else{
        throw new Error(`Devclass ${devclass.toUpperCase()} uses a non-custom namespace.`);
    }
}