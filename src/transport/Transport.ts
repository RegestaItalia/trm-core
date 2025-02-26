import { Logger } from "../logger";
import { BinaryTransport } from "./BinaryTransport";
import { fromAbapToDate, getFileSysSeparator, getPackageHierarchy } from "../commons";
import { FileNames } from "./FileNames";
import { FilePaths } from "./FilePaths";
import { R3trans, R3transLogParser, R3transOptions, ReleaseLogStep } from "node-r3trans";
import { TransportContent } from "./TransportContent";
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
import { TROBJTYPE, E070, E071, TRKORR, TR_TARGET, DEVCLASS, TLINE, TROBJ_NAME, LXE_TT_PACKG_LINE, AS4TEXT, PGMID, SOBJ_NAME, RFC_DB_FLD, TMSSYSNAM } from "../client";
import { SystemConnector } from "../systemConnector";

export const COMMENT_OBJ: TROBJTYPE = 'ZTRM';

export class Transport {
    private _fileNames: FileNames;
    private _e070: E070;
    private _e071: E071[];
    private _docs: Documentation[];
    private _trmRelevant: boolean;
    private _linkedTrmPackage: TrmPackage;
    public trmIdentifier?: TrmTransportIdentifier;

    constructor(public trkorr: TRKORR, private _trTarget?: TR_TARGET, private _migration?: boolean) {
        if (!this._migration) {
            this._fileNames = Transport._getFileNames(trkorr, SystemConnector.getDest());
        }
    }

    public setTrmIdentifier(identifier?: TrmTransportIdentifier): Transport {
        this.trmIdentifier = identifier;
        return this;
    }

    public async getE070(): Promise<E070> {
        if (!this._e070) {
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'TRKORR' },
                { fieldName: 'TRFUNCTION' },
                { fieldName: 'TRSTATUS' },
                { fieldName: 'AS4DATE' },
                { fieldName: 'AS4TIME' }
            ];
            var e070: E070[];
            if (!this._migration) {
                e070 = await SystemConnector.readTable('E070', fields,
                    `TRKORR EQ '${this.trkorr}'`
                );
            } else {
                e070 = await SystemConnector.readTable('ZTRM_E070', fields,
                    `TRM_TRKORR EQ '${this.trkorr}'`
                );
            }
            if (e070.length === 1) {
                this._e070 = e070[0];
            }
        }
        return this._e070;
    }

    public async getE071(): Promise<E071[]> {
        if (!this._e071) {
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'PGMID' },
                { fieldName: 'OBJECT' },
                { fieldName: 'OBJ_NAME' }
            ];
            if (!this._migration) {
                this._e071 = await SystemConnector.readTable('E071', fields,
                    `TRKORR EQ '${this.trkorr}'`
                );
            } else {
                this._e071 = await SystemConnector.readTable('ZTRM_E071', fields,
                    `TRM_TROKRR EQ '${this.trkorr}'`
                );
            }
        }
        return this._e071;
    }

    public async getTasks(): Promise<Transport[]> {
        //there should be no need to handle migrated transports here
        var tasks = [];
        const sTrkorr: {
            trkorr: string
        }[] = await SystemConnector.readTable('E070',
            [{ fieldName: 'TRKORR' }],
            `STRKORR EQ '${this.trkorr}'`
        );
        sTrkorr.forEach(o => {
            tasks.push(new Transport(o.trkorr));
        });
        return tasks;
    }

    public async getDevclass(): Promise<DEVCLASS> {
        const aE071 = await this.getE071();
        var aDevclass = aE071.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC').map(o => o.objName);

        //check support for bulk operations
        if (!SystemConnector.getSupportedBulk().getTransportObjects) {
            for (const oE071 of aE071) {
                if (oE071.pgmid === 'R3TR') {
                    const tadir = await SystemConnector.getObject(oE071.pgmid, oE071.object, oE071.objName);
                    if (!aDevclass.includes(tadir.devclass)) {
                        aDevclass.push(tadir.devclass);
                    }
                }
            }
        } else {
            const aTadirObjects = await SystemConnector.getTransportObjectsBulk(this.trkorr);
            aDevclass = aDevclass.concat(aTadirObjects.map(o => o.devclass));
            aDevclass = Array.from(new Set(aDevclass))
        }

        var aTdevc = [];
        //for each devclass in aDevclass, add all the parent devclasses (stop when parentcl is empty)
        for (var devclass of aDevclass) {
            while (devclass) {
                var tdevc = aTdevc.find(o => o.devclass === devclass);
                if (!tdevc) {
                    tdevc = await SystemConnector.getDevclass(devclass);
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
        if (this._trmRelevant === undefined) {
            const e071 = await this.getE071();
            const trmComments = e071.filter(o => o.pgmid === '*' && o.object === COMMENT_OBJ);
            const hasName = trmComments.find(o => /name=/i.test(o.objName));
            const hasVersion = trmComments.find(o => /version=/i.test(o.objName));
            this._trmRelevant = (hasName && hasVersion) ? true : false;
        }
        return this._trmRelevant;
    }

    public async download(): Promise<{
        binaries: BinaryTransport,
        filenames: FileNames
    }> {
        var binaryTransport: BinaryTransport = {
            header: null,
            data: null
        };
        const filePaths = await Transport._getFilePaths(this._fileNames);
        Logger.loading(`Reading ${this.trkorr} binary files...`, true);
        binaryTransport.header = await SystemConnector.getBinaryFile(filePaths.header);
        binaryTransport.data = await SystemConnector.getBinaryFile(filePaths.data);
        Logger.success(`${this.trkorr} file read success.`, true);
        return {
            binaries: binaryTransport,
            filenames: this._fileNames
        };
    }

    public async setDocumentation(sDocumentation: string): Promise<Transport> {
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
        Logger.loading(`Setting ${this.trkorr} documentation...`, true);
        await SystemConnector.setTransportDoc(this.trkorr, doc);
        Logger.success(`${this.trkorr} documentation updated.`, true);
        return this;
    }

    public async getDocumentation(): Promise<Documentation[]> {
        if (!this._docs || this._docs.length === 0) {
            Logger.loading(`Reading ${this.trkorr} documentation...`, true);
            const fields: RFC_DB_FLD[] = [{ fieldName: 'LANGU' }, { fieldName: 'DOKVERSION' }, { fieldName: 'LINE' }, { fieldName: 'DOKTEXT' }];
            var doktl: {
                langu: string,
                dokversion: string,
                line: string,
                doktext: string
            }[];
            if (!this._migration) {
                doktl = await SystemConnector.readTable('DOKTL', fields,
                    `ID EQ 'TA' AND OBJECT EQ '${this.trkorr}'`
                );
            } else {
                doktl = await SystemConnector.readTable('ZTRM_DOKTL', fields,
                    `TRM_TROKRR EQ '${this.trkorr}'`
                );
            }
            this._docs = Transport.doktlToDoc(doktl);
            //sort by version descending
            this._docs = this._docs.sort((a, b) => b.version - a.version);
            Logger.success(`Found ${this.trkorr} ${this._docs.length} documentation.`, true);
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
        await SystemConnector.addToTransportRequest(this.trkorr, objects, lock);
    }

    public async removeComments() {
        await SystemConnector.removeComments(this.trkorr, COMMENT_OBJ);
    }

    public async addComment(comment: TROBJ_NAME) {
        await SystemConnector.addToTransportRequest(this.trkorr, [{
            pgmid: '*',
            object: COMMENT_OBJ,
            objName: comment
        }], false);
    }

    public async addTranslations(aDevclass: DEVCLASS[]) {
        var aDevclassLangFilter: LXE_TT_PACKG_LINE[] = [];
        aDevclass.forEach(d => {
            if (!aDevclassLangFilter.find(o => o.low === d)) {
                aDevclassLangFilter.push({
                    sign: 'I',
                    option: 'EQ',
                    low: d
                });
            }
        });
        await SystemConnector.addTranslationToTr(this.trkorr, aDevclassLangFilter);
    }

    public async getLinkedPackage(): Promise<TrmPackage> {
        if (!this._linkedTrmPackage) {
            const trmRelevant = await this.isTrmRelevant();
            if (!trmRelevant) {
                return;
            }
            var oTrmPackage: TrmPackage;
            const aDocumentation = await this.getDocumentation();
            const logonLanguage = SystemConnector.getLogonLanguage(true);
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
            try {
                oTrmPackage.setDevclass(await this.getDevclass());
            } catch (e) {
                //devclass not found
            }
            this._linkedTrmPackage = oTrmPackage;
        }
        return this._linkedTrmPackage;
    }

    public async delete(): Promise<null> {
        await SystemConnector.deleteTrkorr(this.trkorr);
        return null;
    }

    public async release(lock: boolean, skipLog: boolean, tmpFolder?: string, secondsTimeout?: number): Promise<void> {
        var rc: number;
        Logger.loading('Releasing transport...', skipLog);
        await SystemConnector.releaseTrkorr(this.trkorr, lock, secondsTimeout);
        await SystemConnector.dequeueTransport(this.trkorr);
        if (tmpFolder) {
            rc = await this.readReleaseLog(tmpFolder, secondsTimeout);
        } else {
            rc = await this._isInTmsQueue(skipLog, false, secondsTimeout);
        }
        if (!skipLog && !tmpFolder) { //with tmpFolder, release status already printed
            switch (rc) {
                case 4:
                    Logger.warning(`${this.trkorr} release ended with warning.`);
                    break;
                case 8:
                    Logger.error(`${this.trkorr} release ended with error.`);
                    break;
                case 12:
                    Logger.error(`${this.trkorr} release was cancelled.`);
                    break;
                case 16:
                    Logger.error(`${this.trkorr} release was cancelled.`);
                    break;
            }
        }
    }

    public async readReleaseLog(tmpFolder: string, secondsTimeout: number): Promise<number> {
        const filePaths = await Transport._getFilePaths(this._fileNames);
        const localPath = path.join(tmpFolder, this._fileNames.releaseLog);

        const systemR3transVersion = await SystemConnector.getR3transVersion();
        const systemR3transUnicode = await SystemConnector.getR3transUnicode();
        Logger.log(`System R3trans: ${systemR3transVersion}`, true);
        Logger.log(`System R3trans unicode: ${systemR3transUnicode}`, true);

        if (Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger) {
            Logger.logger.forceStop();
        }

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
        var whileResult: 'ERROR' | 'WARNING' | 'SUCCESS' = null;

        while (!exitWhile && (new Date()).getTime() < timeoutDate.getTime()) {
            var logResult: ReleaseLogStep[] = [];
            try {
                const logBinary = await SystemConnector.getBinaryFile(filePaths.releaseLog);
                fs.writeFileSync(localPath, logBinary);
                logResult = await (new R3transLogParser(localPath, systemR3transUnicode)).getReleaseLog();
                fs.unlinkSync(localPath);
            } catch (e) {
                logResult = [];
            }
            var etp182LogResult = logResult.find(o => o.id === 'ETP182') || { name: 'CHECK WRITEABILITY OF BUFFERS', exitCode: null };
            var etp183LogResult = logResult.find(o => o.id === 'ETP183') || { name: 'EXPORT PREPARATION', exitCode: null };
            var etp150LogResult = logResult.find(o => o.id === 'ETP150') || { name: 'MAIN EXPORT', exitCode: null };
            etp183LogResult.name += '           ';
            etp150LogResult.name += '                  ';
            const etp182ExitCode = R3transLogParser.parseExitCode(etp182LogResult.exitCode);
            const etp183ExitCode = R3transLogParser.parseExitCode(etp183LogResult.exitCode);
            const etp150ExitCode = R3transLogParser.parseExitCode(etp150LogResult.exitCode);

            exitWhile = (etp182LogResult.exitCode !== null) && (etp183LogResult.exitCode !== null) && (etp150LogResult.exitCode !== null);

            if (etp182ExitCode.type === 'SUCCESS' || etp183ExitCode.type === 'SUCCESS' || etp150ExitCode.type === 'SUCCESS') {
                whileResult = 'SUCCESS';
            }
            if (etp182ExitCode.type === 'WARNING' || etp183ExitCode.type === 'WARNING' || etp150ExitCode.type === 'WARNING') {
                whileResult = 'WARNING';
            }
            if (etp182ExitCode.type === 'ERROR' || etp183ExitCode.type === 'ERROR' || etp150ExitCode.type === 'ERROR') {
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
                if (etp182ExitCode.type === 'UNKNOWN') {
                    iEtp182++;
                } else {
                    iEtp182 = 100;
                }
            } else {
                if (etp182ExitCode.type === 'UNKNOWN') {
                    iEtp182++;
                }
            }
            etp182.update(iEtp182, etp182Payload);

            if (iEtp183 < 99) {
                if (etp183ExitCode.type === 'UNKNOWN') {
                    iEtp183++;
                } else {
                    iEtp183 = 100;
                }
            } else {
                if (etp183ExitCode.type === 'UNKNOWN') {
                    iEtp183++;
                }
            }
            etp183.update(iEtp183, etp183Payload);

            if (iEtp150 < 99) {
                if (etp150ExitCode.type === 'UNKNOWN') {
                    iEtp150++;
                } else {
                    iEtp150 = 100;
                }
            } else {
                if (etp150ExitCode.type === 'UNKNOWN') {
                    iEtp150++;
                }
            }
            etp150.update(iEtp150, etp150Payload);

            await setTimeout(1000); //each second
        }
        multibar.stop();

        var error: Error;
        var rc: number;
        if (!exitWhile) {
            error = new Error(`Timed out waiting for release.`);
        } else {
            if (whileResult === "ERROR") {
                error = new Error(`Error occurred during transport ${this.trkorr} release.`);
            }
            if (whileResult === "SUCCESS") {
                Logger.success(`Transport ${this.trkorr} released with success.`);
                rc = 0;
            }
            if (whileResult === "WARNING") {
                Logger.warning(`Transport ${this.trkorr} released with warning.`);
                rc = 4;
            }
        }

        if (error) {
            throw error;
        } else {
            return rc;
        }
    }

    public async readImportLog(tmpFolder: string): Promise<void> {
        //TODO
    }

    private async _isInTmsQueue(skipLog: boolean, checkImpSing: boolean = false, secondsTimeout): Promise<number> {
        const timeoutDate = new Date((new Date()).getTime() + (secondsTimeout * 1000));
        Logger.log(`TMS check for transport ${this.trkorr}, timeout date set to ${timeoutDate}`, true);
        var inQueue = false;
        var rc: number = 12;
        if (this._trTarget) {
            var sLog = `status unknown`;
            var inQueueAttempts = 0;
            while (!inQueue && (new Date()).getTime() < timeoutDate.getTime()) {
                inQueueAttempts++;
                Logger.log(`Attempt ${inQueueAttempts}`, true);
                Logger.loading(`Reading transport queue...`, skipLog);
                await setTimeout(6000);
                var tmsQueue = await SystemConnector.readTmsQueue(this._trTarget);
                tmsQueue = tmsQueue.filter(o => o.trkorr === this.trkorr);
                tmsQueue = tmsQueue.sort((a, b) => parseInt(b.bufpos) - parseInt(a.bufpos));
                if (!checkImpSing) {
                    sLog = `released`;
                    inQueue = tmsQueue.length > 0;
                } else {
                    //if importing, get the last transport in queue (if re installing, there are more than 1)
                    sLog = `imported`;
                    if (tmsQueue.length > 0) {
                        inQueue = tmsQueue[0].impsing !== 'X';
                        rc = parseInt(tmsQueue[0].maxrc);
                    } else {
                        inQueue = false;
                    }
                }
            }
            if (!inQueue) {
                throw new Error(`Transport request not found in queue, timed out after ${inQueueAttempts + 1} attempts`);
            } else {
                Logger.success(`Transport ${this.trkorr} ${sLog}.`, skipLog);
            }
        } else {
            Logger.error(`No target specified, unable to check queue!!`, true);
        }
        return rc;
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

    public static async _getFilePaths(fileNames: FileNames): Promise<FilePaths> {
        Logger.loading(`Reading system data...`, true);
        const dirTrans = await SystemConnector.getDirTrans();
        const fileSys = await SystemConnector.getFileSystem();
        const pathSeparator = getFileSysSeparator(fileSys.filesys);
        Logger.success(`Data read success.`, true);
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
    }): Promise<Transport> {
        Logger.loading(`Creating transport request (TOC)...`, true);
        const trkorr = await SystemConnector.createTocTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, true);
        return new Transport(trkorr, data.target).setTrmIdentifier(data.trmIdentifier);
    }

    public static async createLang(data: {
        text: AS4TEXT,
        target: TR_TARGET
    }): Promise<Transport> {
        Logger.loading(`Creating transport request (LANG)...`, true);
        const trkorr = await SystemConnector.createWbTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, true);
        return new Transport(trkorr, data.target).setTrmIdentifier(TrmTransportIdentifier.LANG);
    }

    public static async createWb(data: {
        text: AS4TEXT,
        target?: TR_TARGET
    }): Promise<Transport> {
        Logger.loading(`Creating transport request (WB)...`, true);
        const trkorr = await SystemConnector.createWbTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, true);
        return new Transport(trkorr, null);
    }

    public static async getContent(data: Buffer, r3transOption?: R3transOptions): Promise<TransportContent> {
        const r3trans = new R3trans(r3transOption);
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
        trTarget?: TR_TARGET,
        r3transOption?: R3transOptions
    }): Promise<Transport> {
        Logger.loading(`Reading binary content...`, true);
        const fileContent = await Transport.getContent(data.binary.data, data.r3transOption);
        const trkorr = fileContent.trkorr;
        Logger.success(`Transport ${trkorr} read success.`, true);
        const fileNames = Transport._getFileNames(trkorr, SystemConnector.getDest());
        const filePaths = await Transport._getFilePaths(fileNames);
        Logger.loading(`Uploading ${trkorr} header to "${filePaths.header}"...`, true);
        await SystemConnector.writeBinaryFile(filePaths.header, data.binary.header);
        Logger.success(`Header uploaded successfully.`, true);
        Logger.loading(`Uploading ${trkorr} data to "${filePaths.data}"...`, true);
        await SystemConnector.writeBinaryFile(filePaths.data, data.binary.data);
        Logger.success(`Data uploaded successfully.`, true);
        Logger.success(`Transport request ${trkorr} uploaded successfully.`, true);
        return new Transport(trkorr, data.trTarget);
    }

    public static async getTransportsFromObject(objectKeys: {
        pgmid: PGMID,
        object: TROBJTYPE,
        objName: SOBJ_NAME
    }): Promise<Transport[]> {
        var transports: Transport[] = [];
        const aSkipTrkorr = await SystemConnector.getIgnoredTrkorr();
        const objectInTransport: TRKORR[] = (await SystemConnector.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '${objectKeys.pgmid.trim().toUpperCase()}' AND OBJECT EQ '${objectKeys.object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objectKeys.objName.trim().toUpperCase()}'`
        )).map(o => o.trkorr).filter(trkorr => !aSkipTrkorr.includes(trkorr));
        for (const trkorr of objectInTransport) {
            try {
                const oTransport = new Transport(trkorr);
                const e070 = await oTransport.getE070();
                if (e070.trfunction !== 'K' && e070.trfunction !== 'S' && e070.trfunction !== 'R' && e070.trfunction !== 'T') {
                    throw new Error(`Unexpected TRFUNCTION for transport ${trkorr}: ${e070.trfunction}`);
                }
                transports.push(oTransport);
            } catch (e) {
                Logger.error(`Transport instance skip for ${trkorr}: ${e.toString()}`, true);
            }
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

    public async import(timeout: number = 180): Promise<void> {
        if (!this._trTarget) {
            throw new Error('Missing transport target.');
        }
        Logger.log(`Starting transport ${this.trkorr} import, timeout set to ${timeout}`, true);
        Logger.loading(`Forwarding transport ${this.trkorr}`, true);
        await SystemConnector.forwardTransport(this.trkorr, this._trTarget, this._trTarget, true);
        Logger.loading(`Importing transport ${this.trkorr}`, true);
        await SystemConnector.importTransport(this.trkorr, this._trTarget);
        Logger.log(`Starting transport ${this.trkorr} TMS queue status check`, true);
        const rc = await this._isInTmsQueue(false, true, timeout);
        Logger.log(`Transport ${this.trkorr} import ended: return code ${rc}`, true);
        switch (rc) {
            case 4:
                Logger.warning(`${this.trkorr} import ended with warning.`);
                break;
            case 8:
                Logger.error(`${this.trkorr} import ended with error.`);
                break;
            case 12:
                Logger.error(`${this.trkorr} import was cancelled.`);
                break;
            case 16:
                Logger.error(`${this.trkorr} import was cancelled.`);
                break;
        }
    }

    public async rename(as4text: string): Promise<void> {
        await SystemConnector.renameTransportRequest(this.trkorr, as4text);
    }

    public async canBeDeleted(): Promise<boolean> {
        const status = (await this.getE070()).trstatus;
        return status === 'D';
    }

    public async isReleased(): Promise<boolean> {
        const status = (await this.getE070()).trstatus;
        return status === 'R' || status === 'N';
    }

    public async addObjectsFromTransport(from: TRKORR): Promise<void> {
        await SystemConnector.trCopy(from, this.trkorr, false);
    }

    public async migrate(rollback?: boolean): Promise<Transport | void> {
        if (!rollback) {
            const trmTrkorr = await SystemConnector.migrateTransport(this.trkorr);
            return new Transport(trmTrkorr, null, true);
        } else {

        }
    }

    public async deleteFromTms(system: TMSSYSNAM): Promise<void> {
        await SystemConnector.deleteTmsTransport(this.trkorr, system);
    }

    public async refreshTmsTxt(): Promise<void> {
        await SystemConnector.refreshTransportTmsTxt(this.trkorr);
    }

}