import { Logger } from "../logger";
import { SystemConnector } from "../systemConnector";
import { AS4TEXT, DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE, TROBJ_NAME, TR_TARGET } from "../rfc/components";
import { BinaryTransport } from "./BinaryTransport";
import { fromAbapToDate, getFileSysSeparator, getPackageHierarchy } from "../commons";
import { FileNames } from "./FileNames";
import { FilePaths } from "./FilePaths";
import { R3trans, R3transLogParser, ReleaseLogStep } from "node-r3trans";
import { TransportContent } from "./TransportContent";
import { E070, E071, LXE_TT_PACKG_LINE, TLINE } from "../rfc/struct";
import { Documentation } from "./Documentation";
import { TrmTransportIdentifier } from "./TrmTransportIdentifier";
import { TrmPackage } from "../trmPackage";
import { Manifest } from "../manifest";
import { setTimeout } from "timers/promises";
import * as fs from "fs";
import path from "path";
import * as cliProgress from "cli-progress";
import { CliLogger } from "../logger/CliLogger";
import { CliLogFileLogger } from "../logger/CliLogFileLogger";

export const COMMENT_OBJ: TROBJTYPE = 'ZTRM';

export class Transport {
    private _fileNames: FileNames;
    private _e070: E070;
    private _e071: E071[];
    private _docs: Documentation[];
    public trmIdentifier?: TrmTransportIdentifier;

    constructor(public trkorr: TRKORR, private _systemConnector: SystemConnector, private _trTarget?: TR_TARGET) {
        this._fileNames = Transport._getFileNames(trkorr, this._systemConnector.getDest());
    }

    public setTrmIdentifier(identifier?: TrmTransportIdentifier): Transport {
        this.trmIdentifier = identifier;
        return this;
    }

    public async getE070(): Promise<E070> {
        if (!this._e070) {
            const e070: E070[] = await this._systemConnector.rfcClient.readTable('E070',
                [{ fieldName: 'TRKORR' }, { fieldName: 'AS4DATE' }, { fieldName: 'AS4TIME' }],
                `TRKORR EQ '${this.trkorr}'`
            );
            if (e070.length === 1) {
                this._e070 = e070[0];
            }
        }
        return this._e070;
    }

    public async getE071(): Promise<E071[]> {
        if (!this._e071) {
            this._e071 = await this._systemConnector.rfcClient.readTable('E071',
                [{ fieldName: 'PGMID' }, { fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }],
                `TRKORR EQ '${this.trkorr}'`
            );
        }
        return this._e071;
    }

    public async getDevclass(): Promise<DEVCLASS> {
        const aE071 = await this.getE071();
        var aDevclass = aE071.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC').map(o => o.objName);
        for (const oE071 of aE071) {
            if (oE071.pgmid === 'R3TR') {
                const tadir = await this._systemConnector.getObject(oE071.pgmid, oE071.object, oE071.objName);
                if (!aDevclass.includes(tadir.devclass)) {
                    aDevclass.push(tadir.devclass);
                }
            }
        }
        var aTdevc = [];
        //for each devclass in aDevclass, add all the parent devclasses (stop when parentcl is empty)
        for (var devclass of aDevclass) {
            while (devclass) {
                var tdevc = aTdevc.find(o => o.devclass === devclass);
                if (!tdevc) {
                    tdevc = await this._systemConnector.getDevclass(devclass);
                    aTdevc.push(tdevc);
                }
                devclass = tdevc.parentcl;
            }
        }

        //now look for the first root package that is included in the original aDevclass
        var rootDevclass = null;
        while (aTdevc.length > 0 && !rootDevclass) {
            const hierarchy = getPackageHierarchy(aTdevc);
            if (aDevclass.includes(hierarchy.devclass)) {
                rootDevclass = hierarchy.devclass;
            } else {
                aTdevc = aTdevc.filter(o => o.devclass !== hierarchy.devclass);
            }
        }
        return rootDevclass;
    }

    public async getDate(): Promise<Date> {
        const e070 = await this.getE070();
        return fromAbapToDate(e070.as4Date, e070.as4Time);
    }

    public async isTrmRelevant(): Promise<boolean> {
        const e071 = await this.getE071();
        const trmComments = e071.filter(o => o.pgmid === '*' && o.object === COMMENT_OBJ);
        const hasName = trmComments.find(o => /name=/i.test(o.objName));
        const hasVersion = trmComments.find(o => /version=/i.test(o.objName));
        return (hasName && hasVersion) ? true : false;
    }

    public async download(skipLog: boolean = false): Promise<{
        binaries: BinaryTransport,
        filenames: FileNames
    }> {
        var binaryTransport: BinaryTransport = {
            header: null,
            data: null
        };
        const filePaths = await Transport._getFilePaths(this._fileNames, this._systemConnector);
        Logger.loading(`Reading ${this.trkorr} binary files...`, skipLog);
        binaryTransport.header = await this._systemConnector.rfcClient.getBinaryFile(filePaths.header);
        binaryTransport.data = await this._systemConnector.rfcClient.getBinaryFile(filePaths.data);
        Logger.success(`${this.trkorr} file read success.`, skipLog);
        return {
            binaries: binaryTransport,
            filenames: this._fileNames
        };
    }

    public async setDocumentation(sDocumentation: string, skipLog: boolean = false): Promise<Transport> {
        this._docs = undefined; //clear
        var doc: TLINE[] = [];
        //split at /n to preserve indentation, then split every line that exceedes 67 chars (TDLINE limit)
        const indentationSplit = sDocumentation.split('\n');
        indentationSplit.forEach(s => {
            if (s.length <= 67) {
                doc.push({
                    tdformat: '/',
                    tdline: s
                });
            } else {
                const sizeLimit = s.match(/.{1,67}/g) || [];
                sizeLimit.forEach(sl => {
                    doc.push({
                        tdformat: '/',
                        tdline: sl
                    });
                });
            }
        });
        Logger.loading(`Setting ${this.trkorr} documentation...`, skipLog);
        await this._systemConnector.rfcClient.setTransportDoc(this.trkorr, doc);
        Logger.success(`${this.trkorr} documentation updated.`, skipLog);
        return this;
    }

    public async getDocumentation(skipLog: boolean = false): Promise<Documentation[]> {
        if (!this._docs || this._docs.length === 0) {
            Logger.loading(`Reading ${this.trkorr} documentation...`, skipLog);
            const doktl: {
                langu: string,
                dokversion: string,
                line: string,
                doktext: string
            }[] = await this._systemConnector.rfcClient.readTable('DOKTL',
                [{ fieldName: 'LANGU' }, { fieldName: 'DOKVERSION' }, { fieldName: 'LINE' }, { fieldName: 'DOKTEXT' }],
                `ID EQ 'TA' AND OBJECT EQ '${this.trkorr}'`
            );
            this._docs = Transport.doktlToDoc(doktl);
            //sort by version descending
            this._docs = this._docs.sort((a, b) => b.version - a.version);
            Logger.success(`Found ${this.trkorr} ${this._docs.length} documentation.`, skipLog);
        }
        return this._docs;
    }

    public static doktlToDoc(doktl: {
        langu: string,
        dokversion: string,
        line: string,
        doktext: string
    }[]): Documentation[] {
        var aDocs: Documentation[] = [];
        var trkorrDoktl: {
            langu: string,
            version: number,
            docLines: {
                no: number,
                value: string
            }[]
        }[] = [];
        doktl.forEach(o => {
            const version = parseInt(o.dokversion);
            const lineNumber = parseInt(o.line);
            var arrayIndex = trkorrDoktl.findIndex(td => td.langu === o.langu && td.version === version);
            if (arrayIndex < 0) {
                arrayIndex = trkorrDoktl.push({
                    langu: o.langu,
                    version,
                    docLines: []
                });
                arrayIndex--;
            }
            trkorrDoktl[arrayIndex].docLines.push({
                no: lineNumber,
                value: o.doktext
            });
            trkorrDoktl[arrayIndex].docLines.sort((a, b) => a.no - b.no);
        });
        trkorrDoktl = trkorrDoktl.sort((a, b) => a.version - b.version);
        trkorrDoktl.forEach(o => {
            aDocs.push({
                langu: o.langu,
                version: o.version,
                value: o.docLines.map(o => o.value).join('')
            })
        });
        return aDocs;
    }

    public async addObjects(objects: E071[], lock: boolean) {
        await this._systemConnector.rfcClient.addToTransportRequest(this.trkorr, objects, lock);
    }

    public async addComment(comment: TROBJ_NAME) {
        await this._systemConnector.rfcClient.addToTransportRequest(this.trkorr, [{
            pgmid: '*',
            object: COMMENT_OBJ,
            objName: comment
        }], false);
    }

    public async addTranslations(aDevclass: DEVCLASS[]) {
        var aDevclassLangFilter: LXE_TT_PACKG_LINE[] = [];
        aDevclass.forEach(d => {
            if(!aDevclassLangFilter.find(o => o.low === d)){
                aDevclassLangFilter.push({
                    sign: 'I',
                    option: 'EQ',
                    low: d
                });
            }
        });
        await this._systemConnector.rfcClient.addTranslationToTr(this.trkorr, aDevclassLangFilter);
    }

    public async getLinkedPackage(): Promise<TrmPackage> {
        const trmRelevant = await this.isTrmRelevant();
        if (!trmRelevant) {
            return;
        }
        var oTrmPackage: TrmPackage;
        const aDocumentation = await this.getDocumentation();
        const logonLanguage = this._systemConnector.getLogonLanguage(true);
        const oDocumentationLang = aDocumentation.find(o => o.langu === logonLanguage);
        var docVal: string;
        if (oDocumentationLang) {
            docVal = oDocumentationLang.value;
        } else {
            if (aDocumentation.length > 0) {
                docVal = aDocumentation[0].value;
            }
        }
        try {
            oTrmPackage = Manifest.fromAbapXml(docVal).setLinkedTransport(this).getPackage();
        } catch (e) {
            //invalid manifest
        }
        return oTrmPackage;
    }

    public async delete(): Promise<null> {
        await this._systemConnector.rfcClient.deleteTrkorr(this.trkorr);
        return null;
    }

    public async release(lock: boolean, skipLog: boolean = false, tmpFolder?: string, secondsTimeout?: number): Promise<Transport> {
        //TODO check skipLog
        //TODO fix this -> publish step creates a transport with dummy logger
        Logger.loading('Releasing...');
        await this._systemConnector.rfcClient.releaseTrkorr(this.trkorr, lock, secondsTimeout);
        await this._systemConnector.rfcClient.dequeueTransport(this.trkorr);
        if (!skipLog && tmpFolder) {
            if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
                Logger.logger.forceStop();
            }
            await this.readReleaseLog(tmpFolder, secondsTimeout);
            Logger.loading(`Finalizing release...`);
        }
        await this._isInTmsQueue(skipLog, false, secondsTimeout);
        return this;
    }

    public async readReleaseLog(tmpFolder: string, secondsTimeout: number): Promise<void> {
        const filePaths = await Transport._getFilePaths(this._fileNames, this._systemConnector);
        const localPath = path.join(tmpFolder, this._fileNames.releaseLog);
        const oParser = new R3transLogParser(localPath);

        const multibar = new cliProgress.MultiBar({
            clearOnComplete: true,
            hideCursor: true,
            format: '> {stage} [{bar}] {exitCode} {result} '
        }, cliProgress.Presets.legacy);
        var iEtp182 = 0;
        var iEtp183 = 0;
        var iEtp150 = 0;
        const etp182 = multibar.create(100, iEtp182, {
            stage: '',
            exitCode: '',
            result: 'Needs update'
        });
        const etp183 = multibar.create(100, iEtp183, {
            stage: '',
            exitCode: '',
            result: 'Needs update'
        });
        const etp150 = multibar.create(100, iEtp150, {
            stage: '',
            exitCode: '',
            result: 'Needs update'
        });

        const timeoutDate = new Date((new Date()).getTime() + (secondsTimeout * 1000));

        var exitWhile = false;
        var whileResult : 'ERROR' | 'WARNING' | 'SUCCESS' = null;

        while (!exitWhile && (new Date()).getTime() < timeoutDate.getTime()) {
            var logResult: ReleaseLogStep[] = [];
            try{
                const logBinary = await this._systemConnector.rfcClient.getBinaryFile(filePaths.releaseLog);
                fs.writeFileSync(localPath, logBinary);
                logResult = await oParser.getReleaseLog();
                fs.unlinkSync(localPath);
            }catch(e){
                logResult = [];
            }
            var etp182LogResult = logResult.find(o => o.id === 'ETP182') || {name: 'CHECK WRITEABILITY OF BUFFERS', exitCode: null};
            var etp183LogResult = logResult.find(o => o.id === 'ETP183') || {name: 'EXPORT PREPARATION', exitCode: null};
            var etp150LogResult = logResult.find(o => o.id === 'ETP150') || {name: 'MAIN EXPORT', exitCode: null};
            etp183LogResult.name += '           ';
            etp150LogResult.name += '                  ';
            const etp182ExitCode = R3transLogParser.parseExitCode(etp182LogResult.exitCode);
            const etp183ExitCode = R3transLogParser.parseExitCode(etp183LogResult.exitCode);
            const etp150ExitCode = R3transLogParser.parseExitCode(etp150LogResult.exitCode);

            exitWhile = (etp182LogResult.exitCode !== null) && (etp183LogResult.exitCode !== null) && (etp150LogResult.exitCode !== null);

            if(etp182ExitCode.type === 'SUCCESS' || etp183ExitCode.type === 'SUCCESS' || etp150ExitCode.type === 'SUCCESS'){
                whileResult = 'SUCCESS';
            }
            if(etp182ExitCode.type === 'WARNING' || etp183ExitCode.type === 'WARNING' || etp150ExitCode.type === 'WARNING'){
                whileResult = 'WARNING';
            }
            if(etp182ExitCode.type === 'ERROR' || etp183ExitCode.type === 'ERROR' || etp150ExitCode.type === 'ERROR'){
                whileResult = 'ERROR';
            }

            const etp182Payload = {
                stage: etp182LogResult.name,
                exitCode: etp182LogResult.exitCode || '',
                result: etp182ExitCode.type !== 'UNKNOWN' ? etp182ExitCode.value : 'In progress'
            }
            const etp183Payload = {
                stage: etp183LogResult.name,
                exitCode: etp183LogResult.exitCode || '',
                result: etp183ExitCode.type !== 'UNKNOWN' ? etp183ExitCode.value : 'In progress'
            }
            const etp150Payload = {
                stage: etp150LogResult.name,
                exitCode: etp150LogResult.exitCode || '',
                result: etp150ExitCode.type !== 'UNKNOWN' ? etp150ExitCode.value : 'In progress'
            }

            if (iEtp182 < 99) {
                if(etp182ExitCode.type === 'UNKNOWN'){
                    iEtp182++;
                }else{
                    iEtp182 = 100;
                }
            } else {
                if(etp182ExitCode.type === 'UNKNOWN'){
                    iEtp182++;
                }
            }
            etp182.update(iEtp182, etp182Payload);

            if (iEtp183 < 99) {
                if(etp183ExitCode.type === 'UNKNOWN'){
                    iEtp183++;
                }else{
                    iEtp183 = 100;
                }
            } else {
                if(etp183ExitCode.type === 'UNKNOWN'){
                    iEtp183++;
                }
            }
            etp183.update(iEtp183, etp183Payload);
            
            if (iEtp150 < 99) {
                if(etp150ExitCode.type === 'UNKNOWN'){
                    iEtp150++;
                }else{
                    iEtp150 = 100;
                }
            } else {
                if(etp150ExitCode.type === 'UNKNOWN'){
                    iEtp150++;
                }
            }
            etp150.update(iEtp150, etp150Payload);

            await setTimeout(1000); //each second
        }
        multibar.stop();

        var error: Error;
        if(!exitWhile){
            error = new Error(`Timed out waiting for release.`);
        }else{
            if(whileResult === "ERROR"){
                error = new Error(`Error occurred during transport ${this.trkorr} release.`);
            }
            if(whileResult === "SUCCESS"){
                Logger.success(`Transport ${this.trkorr} released with success.`);
            }
            if(whileResult === "WARNING"){
                Logger.warning(`Transport ${this.trkorr} released with warning.`);
            }
        }

        if(error){
            error['trkorrRollback'] = true;
            throw error;
        }
    }

    public async readImportLog(tmpFolder: string): Promise<void> {
        //TODO
    }

    private async _isInTmsQueue(skipLog: boolean = false, checkImpSing: boolean = false, secondsTimeout): Promise<boolean> {
        const timeoutDate = new Date((new Date()).getTime() + (secondsTimeout * 1000));

        var inQueue = false;
        if (this._trTarget) {
            var inQueueAttempts = 0;
            while (!inQueue && (new Date()).getTime() < timeoutDate.getTime()) {
                inQueueAttempts++;
                Logger.loading(`Reading transport queue, attempt ${inQueueAttempts}...`, skipLog);
                var tmsQueue = await this._systemConnector.rfcClient.readTmsQueue(this._trTarget);
                tmsQueue = tmsQueue.filter(o => o.trkorr === this.trkorr);
                tmsQueue = tmsQueue.sort((a, b) => parseInt(b.bufpos) - parseInt(a.bufpos));
                if(!checkImpSing){
                    inQueue = tmsQueue.length > 0;
                }else{
                    //if importing, get the last transport in queue (if re installing, there are more than 1)
                    if(tmsQueue.length > 0){
                        inQueue = tmsQueue[0].impsing !== 'X';
                    }else{
                        inQueue = false;
                    }
                }
                await setTimeout(6000);
            }
            if (!inQueue) {
                throw new Error(`Transport request not found in queue, timed out after ${inQueueAttempts + 1} attempts`);
            } else {
                Logger.success(`Transport was released.`, skipLog);
            }
        }
        return inQueue;
    }

    private static _getFileNames(trkorr: TRKORR, targetSystem: string): FileNames {
        const trkorrRegex = /(\S{3})K(.*)/gi;
        const regexIterator = trkorr.matchAll(trkorrRegex);
        var trkorrFileExtension;
        var trkorrNumber;
        try {
            const matches = regexIterator.next().value;
            trkorrFileExtension = matches[1];
            trkorrNumber = matches[2];
        } catch (e) {
            throw new Error(`Couldn't parse transport ${trkorr}.`);
        }
        return {
            header: `K${trkorrNumber}.${trkorrFileExtension}`,
            data: `R${trkorrNumber}.${trkorrFileExtension}`,
            releaseLog: `${trkorrFileExtension}E${trkorrNumber}.${trkorrFileExtension}`,
            importLogH: `${trkorrFileExtension}H${trkorrNumber}.${targetSystem}`,
            importLogA: `${trkorrFileExtension}A${trkorrNumber}.${targetSystem}`,
            importLogI: `${trkorrFileExtension}I${trkorrNumber}.${targetSystem}`,
            importLogV: `${trkorrFileExtension}V${trkorrNumber}.${targetSystem}`,
            importLogR: `${trkorrFileExtension}R${trkorrNumber}.${targetSystem}`,
            importLogG: `${trkorrFileExtension}G${trkorrNumber}.${targetSystem}`
        }
    }

    public static async _getFilePaths(fileNames: FileNames, systemConnector: SystemConnector): Promise<FilePaths> {
        Logger.loading(`Reading system data...`);
        const dirTrans = await systemConnector.rfcClient.getDirTrans();
        const fileSys = await systemConnector.rfcClient.getFileSystem();
        const pathSeparator = getFileSysSeparator(fileSys.filesys);
        Logger.success(`Data read success.`);
        return {
            header: `${dirTrans}${pathSeparator}cofiles${pathSeparator}${fileNames.header}`,
            data: `${dirTrans}${pathSeparator}data${pathSeparator}${fileNames.data}`,
            releaseLog: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.releaseLog}`,
            importLogH: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogH}`,
            importLogA: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogA}`,
            importLogI: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogI}`,
            importLogV: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogV}`,
            importLogR: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogR}`,
            importLogG: `${dirTrans}${pathSeparator}log${pathSeparator}${fileNames.importLogG}`
        }
    }

    public static async createToc(data: {
        text: AS4TEXT,
        target: TR_TARGET,
        trmIdentifier?: TrmTransportIdentifier
    }, systemConnector: SystemConnector, skipLog: boolean = false): Promise<Transport> {
        Logger.loading(`Creating transport request (TOC)...`, skipLog);
        const trkorr = await systemConnector.rfcClient.createTocTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, skipLog);
        return new Transport(trkorr, systemConnector, data.target).setTrmIdentifier(data.trmIdentifier);
    }

    public static async createLang(data: {
        text: AS4TEXT,
        target: TR_TARGET
    }, systemConnector: SystemConnector, skipLog: boolean = false): Promise<Transport> {
        Logger.loading(`Creating transport request (LANG)...`, skipLog);
        const trkorr = await systemConnector.rfcClient.createWbTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, skipLog);
        return new Transport(trkorr, systemConnector, data.target).setTrmIdentifier(TrmTransportIdentifier.LANG);
    }

    public static async createWb(data: {
        text: AS4TEXT,
        target?: TR_TARGET
    }, systemConnector: SystemConnector, skipLog: boolean = false): Promise<Transport> {
        Logger.loading(`Creating transport request (WB)...`, skipLog);
        const trkorr = await systemConnector.rfcClient.createWbTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, skipLog);
        return new Transport(trkorr, systemConnector, null);
    }

    public static async getContent(data: Buffer, tmpFolder: string): Promise<TransportContent> {
        const r3trans = new R3trans({
            tempDirPath: tmpFolder
        });
        const trkorr = await r3trans.getTransportTrkorr(data);
        var transportContent: TransportContent = {
            trkorr,
            tdevc: [],
            tdevct: [],
            tadir: []
        };
        transportContent.tdevc = await r3trans.getTableEntries(data, 'TDEVC');
        transportContent.tdevct = await r3trans.getTableEntries(data, 'TDEVCT');
        transportContent.tadir = await r3trans.getTableEntries(data, 'TADIR');
        return transportContent;
    }

    public static async upload(data: {
        binary: BinaryTransport,
        systemConnector: SystemConnector,
        tmpFolder?: string
        trTarget?: TR_TARGET
    }, skipLog: boolean = false): Promise<Transport> {
        Logger.loading(`Reading binary content...`, skipLog);
        const fileContent = await Transport.getContent(data.binary.data, data.tmpFolder);
        const trkorr = fileContent.trkorr;
        Logger.success(`Transport ${trkorr} read success.`, skipLog);
        const fileNames = Transport._getFileNames(trkorr, data.systemConnector.getDest());
        const filePaths = await Transport._getFilePaths(fileNames, data.systemConnector);
        Logger.loading(`Uploading ${trkorr} header to "${filePaths.header}"...`, skipLog);
        await data.systemConnector.rfcClient.writeBinaryFile(filePaths.header, data.binary.header);
        Logger.success(`Header uploaded successfully.`, skipLog);
        Logger.loading(`Uploading ${trkorr} data to "${filePaths.data}"...`, skipLog);
        await data.systemConnector.rfcClient.writeBinaryFile(filePaths.data, data.binary.data);
        Logger.success(`Data uploaded successfully.`, skipLog);
        Logger.success(`Transport request ${trkorr} uploaded successfully.`, skipLog);
        return new Transport(trkorr, data.systemConnector, data.trTarget);
    }

    public static async getTransportsFromObject(objectKeys: {
        pgmid: PGMID,
        object: TROBJTYPE,
        objName: SOBJ_NAME
    }, systemConnector: SystemConnector): Promise<Transport[]> {
        var transports: Transport[] = [];
        const aSkipTrkorr = await systemConnector.getIgnoredTrkorr();
        const objectInTransport: TRKORR[] = (await systemConnector.rfcClient.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '${objectKeys.pgmid.trim().toUpperCase()}' AND OBJECT EQ '${objectKeys.object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objectKeys.objName.trim().toUpperCase()}'`
        )).map(o => o.trkorr).filter(trkorr => !aSkipTrkorr.includes(trkorr));
        for (const trkorr of objectInTransport) {
            transports.push(new Transport(trkorr, systemConnector));
        }
        return transports;
    }

    public static async getLatest(transports: Transport[]): Promise<Transport> {
        var latest: Transport;
        for (const transport of transports) {
            if (!latest) {
                latest = transport;
            } else {
                if ((await transport.getDate()) > (await latest.getDate())) {
                    latest = transport;
                }
            }
        }
        return latest;
    }

    public async import(skipLog: boolean = false, timeout: number = 180): Promise<void> {
        if (!this._trTarget) {
            throw new Error('Missing transport target.');
        }
        await this._systemConnector.rfcClient.forwardTransport(this.trkorr, this._trTarget, this._trTarget);
        await this._systemConnector.rfcClient.importTransport(this.trkorr, this._trTarget);
        await this._isInTmsQueue(skipLog, true, timeout);
    }

    public async rename(as4text: string): Promise<void> {
        await this._systemConnector.rfcClient.renameTransportRequest(this.trkorr, as4text);
    }

    public async canBeDeleted(): Promise<boolean> {
        const status = await this._systemConnector.getTransportStatus(this.trkorr);
        return status === 'D';
    }

    public async addObjectsFromTransport(from: TRKORR): Promise<void> {
        await this._systemConnector.rfcClient.trCopy(from, this.trkorr);
    }

}