import { FILESYS_D } from "../client";

export function getFileSysSeparator(fileSys: FILESYS_D): string {
    if(fileSys === 'WINDOWS NT' || fileSys === 'DOS'){
        return '\\';
    }else if(fileSys === 'UNIX' || fileSys === 'AS\\400' || fileSys === 'MACINTOSH' || fileSys === 'MPE' || fileSys === 'VMS'){
        return '/';
    }else{
        throw new Error(`Unknown file system type ${fileSys}`);
    }
}