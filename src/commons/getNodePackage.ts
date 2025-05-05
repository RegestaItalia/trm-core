import * as fs from "fs";
import path from "path";
import { rootPath } from 'get-root-path';
import { Logger } from "trm-commons";
import { getStackTrace } from "get-stack-trace";

export function getNodePackage(): any {
    var file: Buffer;
    var packageData: any;
    Logger.log(`root path: ${rootPath}`, true);
    const stack = getStackTrace();
    try{
        file = fs.readFileSync(path.join(rootPath, "/node_modules/trm-core/package.json"));
    }catch(e){
        file = fs.readFileSync(path.join(rootPath, "package.json"));
    }
    if(file){
        packageData = JSON.parse(file.toString());
    }
    if(!packageData || packageData.name !== 'trm-core'){
        throw new Error(`package.json not found!`);
    }
    return packageData;
}