import { gte, lt } from "semver";
import { ClientError } from "../client";
import { Logger } from "../logger";

export class TrmServerUpgrade {
    private static instance: TrmServerUpgrade;
    private dummy: boolean;

    private constructor(private currentVersion?: string, private installVersion?: string) {
        if(this.currentVersion && this.installVersion){
            this.dummy = false;
        }else{
            this.dummy = true;
        }
    }

    public static getInstance(): TrmServerUpgrade {
        if (!TrmServerUpgrade.instance) {
            TrmServerUpgrade.instance = new TrmServerUpgrade();
        }
        return TrmServerUpgrade.instance;
    }

    public static createInstance(currentVersion: string, installVersion: string): void {
        TrmServerUpgrade.instance = new TrmServerUpgrade(currentVersion, installVersion);
    }

    public throwError(e: Error){
        if(this.dummy){
            throw e;
        }
        if(e instanceof ClientError){
            //2.2.0 - Fixed package interface
            if(e.sapMessage.class === 'PAK' && e.sapMessage.no === '058' && lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0')){
                Logger.log(`Ignored error (${e.toString()})): this is fixed in trm-server 2.2.0`, true);
                return;
            }
            throw e;
        }
        throw e;
    }

    public deleteFromTms(): boolean {
        if(this.dummy){
            return true;
        }else{
            return !(lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0'));
        }
    }

    public removeSkipTrkorr(): boolean {
        if(this.dummy){
            return true;
        }else{
            return !(lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0'));
        }
    }

    public executePostActivities(): boolean {
        if(this.dummy){
            return true;
        }else{
            return !(lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0'));
        }
    }

    public removeComments(): boolean {
        if(this.dummy){
            return true;
        }else{
            return !(lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0'));
        }
    }

    public refreshTmsTxt(): boolean {
        if(this.dummy){
            return true;
        }else{
            return !(lt(this.currentVersion, '2.2.0') && gte(this.installVersion, '2.2.0'));
        }
    }

}