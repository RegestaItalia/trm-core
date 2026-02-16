import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from 'trm-commons';

export function getNodePackage(packageName?: string) {
    if(!packageName){
        packageName = 'trm-core';
    }
    Logger.loading(`Looking for "${packageName}" package.json, starting in folder "${process.cwd()}"...`, true);
    var data;
    //try current directory
    try{
        data = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
        if(data.name === packageName){
            return data;
        }
    }catch{ }
    //try node_modules
    try{
        data = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', packageName, 'package.json'), 'utf8'));
        return data;
    }catch{ }
    //up one directory
    try{
        data = JSON.parse(readFileSync(join(resolve(process.cwd(), ".."), packageName, 'package.json'), 'utf8'));
        return data;
    }catch{ }
    //up one directory, in node_modules
    try{
        data = JSON.parse(readFileSync(join(resolve(process.cwd(), ".."), 'node_modules', packageName, 'package.json'), 'utf8'));
        return data;
    }catch{ }
    throw new Error(`Couldn't find "${packageName}" package.json!`);
}