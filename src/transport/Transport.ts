import { BinaryTransport } from "./BinaryTransport";
import { fromAbapToDate, getFileSysSeparator, getPackageHierarchy } from "../commons";
import { FileNames } from "./FileNames";
import { FilePaths } from "./FilePaths";
import { R3transLogParser, ReleaseLogStep } from "./R3transLogParser";
import { Documentation } from "./Documentation";
import { TrmTransportIdentifier } from "./TrmTransportIdentifier";
import { TrmPackage } from "../trmPackage";
import { Manifest } from "../manifest";
import { setTimeout } from "timers/promises";
import * as fs from "fs";
import { tmpdir } from "os";
import path from "path";
import { Logger } from "trm-commons";
import { TROBJTYPE, E070, E071, E071K, E07T, TRKORR, TR_TARGET, DEVCLASS, TLINE, TROBJ_NAME, LXE_TT_PACKG_LINE, AS4TEXT, PGMID, SOBJ_NAME, RFC_DB_FLD, TMSSYSNAM, TDEVC, TR_AS4USER, TransportEntries, STMSIQREQ, TPSTAT } from "../client";
import { SystemConnector } from "../systemConnector";
import chalk from "chalk";
import { TransportTmsError } from "./TransportTmsError";

export const COMMENT_OBJ: TROBJTYPE = 'ZTRM';


const RELEASE_LOG_STEPS: { id: string, name: string, namePadding: string }[] = [
    { id: 'ETP182', name: 'CHECK WRITEABILITY OF BUFFERS', namePadding: '' },
    { id: 'ETP183', name: 'EXPORT PREPARATION', namePadding: '           ' },
    { id: 'ETP150', name: 'MAIN EXPORT', namePadding: '                  ' }
];

export class Transport {
    /**
     * Maximum time to wait for a release log to report every export step.
     */
    public static releaseLogTimeoutMs: number = 30 * 60 * 1000;

    private _fileNames: FileNames;
    private _e070: E070;
    private _e071: E071[];
    private _e071k: E071K[];
    private _e07t: E07T[];
    private _docs: Documentation[];
    private _trmPackageName: string;
    private _trmPackageVersion: string;
    private _linkedTrmPackage: TrmPackage;
    private _rootDevclass: DEVCLASS;
    private _entries: TransportEntries;
    public trmIdentifier?: TrmTransportIdentifier;
    /** Target the transport was last added to the import queue of (by a test import). */
    private _forwardedTo?: TR_TARGET;
    /** Final tp message of the last import (or test import) of this transport. */
    public lastImportMessage?: string;

    constructor(public trkorr: TRKORR, private _trTarget?: TR_TARGET) {
        this._fileNames = Transport._getFileNames(trkorr, SystemConnector.getDest());
    }

    public setTrmIdentifier(identifier?: TrmTransportIdentifier): Transport {
        this.trmIdentifier = identifier;
        return this;
    }

    public async isImported(): Promise<boolean> {
        const sourceTransports = await SystemConnector.getSourceTrkorr();
        return !sourceTransports.includes(this.trkorr);
    }

    public async isIgnored(): Promise<boolean> {
        const ignoredTransports = await SystemConnector.getIgnoredTrkorr();
        return ignoredTransports.includes(this.trkorr);
    }

    public async getE070(): Promise<E070> {
        if (!this._e070) {
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'TRKORR' },
                { fieldName: 'TRFUNCTION' },
                { fieldName: 'TRSTATUS' },
                { fieldName: 'AS4DATE' },
                { fieldName: 'AS4TIME' },
                { fieldName: 'TARSYSTEM' }
            ];
            var e070: E070[];
            e070 = await SystemConnector.readTable('E070', fields,
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
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'PGMID' },
                { fieldName: 'OBJECT' },
                { fieldName: 'OBJ_NAME' }
            ];
            this._e071 = await SystemConnector.readTable('E071', fields,
                `TRKORR EQ '${this.trkorr}'`
            );
        }
        return this._e071;
    }

    public async getE071K(): Promise<E071K[]> {
        if (!this._e071k) {
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'PGMID' },
                { fieldName: 'OBJECT' },
                { fieldName: 'OBJNAME' },
                { fieldName: 'MASTERTYPE' },
                { fieldName: 'MASTERNAME' }
            ];
            this._e071k = await SystemConnector.readTable('E071K', fields,
                `TRKORR EQ '${this.trkorr}'`
            );
        }
        return this._e071k;
    }

    /**
     * Table content carried by the transport: one entry per E071K key, and one entry without key
     * (the whole table content) per TABU object that has no key list.
     */
    public async getCustomizingKeys(): Promise<{ table: string, tabkey?: string }[]> {
        const keys: { objname: string, mastername?: string, tabkey: string }[] = await SystemConnector.readTable('E071K', [
            { fieldName: 'OBJNAME' },
            { fieldName: 'MASTERNAME' },
            { fieldName: 'TABKEY' }
        ], `TRKORR EQ '${this.trkorr}'`);
        const objects: { object: string, objName: string, objfunc: string }[] = await SystemConnector.readTable('E071', [
            { fieldName: 'OBJECT' },
            { fieldName: 'OBJ_NAME' },
            { fieldName: 'OBJFUNC' }
        ], `TRKORR EQ '${this.trkorr}'`);
        return [
            ...keys.map(o => ({ table: (o.objname || o.mastername || '').trim(), tabkey: (o.tabkey || '').trim() })),
            ...objects.filter(o => (o.object || '').trim().toUpperCase() === 'TABU' && (o.objfunc || '').trim().toUpperCase() !== 'K')
                .map(o => ({ table: (o.objName || '').trim() }))
        ];
    }

    public async getE07T(): Promise<E07T[]> {
        if (!this._e07t) {
            const fields: RFC_DB_FLD[] = [
                { fieldName: 'TRKORR' },
                { fieldName: 'LANGU' },
                { fieldName: 'AS4TEXT' }
            ];
            this._e07t = await SystemConnector.readTable('E07T', fields,
                `TRKORR EQ '${this.trkorr}'`
            );
        }
        return this._e07t;
    }

    public async getDescription(): Promise<AS4TEXT> {
        const e07t = await this.getE07T();
        if (e07t.length > 0) {
            var description = e07t.find(o => o.langu === SystemConnector.getLogonLanguage(true));
            if (!description) {
                description = e07t[0];
            }
            return description.as4Text;
        } else {
            return '';
        }
    }

    public async getEntries(): Promise<TransportEntries> {
        if (!this._entries) {
            this._entries = await SystemConnector.getTransportEntries(this.trkorr);
        }
        return this._entries;
    }

    public async getTasks(): Promise<Transport[]> {
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

    public async getDevclass(aTdevc?: TDEVC[]): Promise<DEVCLASS> {
        if (!this._rootDevclass) {
            const aE071 = await this.getE071();
            if (!aTdevc) {
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

                aTdevc = [];
                /*
                    #143
                    Find root package from E071 object list
                    This is not 100% right because the root package found by E071 object list
                    might not actually be the root of the package (cases where the root package doesn't have an object
                    but has a subpackage with objects).
                    The original logic used was this: find the root based on package hierachy.
                    This is also not 100% right because after install, users might move the root package to another package
                    making it a subpackage, invalidating the logic.
                */
                //for each devclass in aDevclass, add all the parent devclasses (#143 XX stop when parentcl is empty XX)
                for (var devclass of aDevclass) {
                    //while (devclass) {
                    var tdevc = aTdevc.find(o => o.devclass === devclass);
                    if (!tdevc) {
                        tdevc = await SystemConnector.getDevclass(devclass);
                        aTdevc.push(tdevc);
                    }
                    //devclass = tdevc.parentcl;
                    //}
                }
            }

            //now look for the first root package that is included in the original aDevclass
            while (aTdevc.length > 0 && !this._rootDevclass) {
                const hierarchy = getPackageHierarchy(aTdevc, true); //-> added parameter to ignore multiple roots
                if (aTdevc.find(o => o.devclass === hierarchy.devclass)) {
                    this._rootDevclass = hierarchy.devclass;
                } else {
                    aTdevc = aTdevc.filter(o => o.devclass !== hierarchy.devclass);
                }
            }
        }
        return this._rootDevclass;
    }

    public async getDate(): Promise<Date> {
        const e070 = await this.getE070();
        return await (fromAbapToDate(e070.as4Date, e070.as4Time));
    }

    public async getTrmPackageName(): Promise<string> {
        if (this._trmPackageName === undefined) {
            const e071 = await this.getE071();
            const trmComments = e071.filter(o => o.pgmid === '*' && o.object === COMMENT_OBJ);
            trmComments.forEach(s => {
                if (!this._trmPackageName) {
                    try {
                        this._trmPackageName = /name=(\S*)/i.exec(s.objName)[1];
                    } catch (e) { }
                }
            });
        }
        return this._trmPackageName;
    }
    public async getTrmPackageVersion(): Promise<string> {
        if (this._trmPackageVersion === undefined) {
            const e071 = await this.getE071();
            const trmComments = e071.filter(o => o.pgmid === '*' && o.object === COMMENT_OBJ);
            trmComments.forEach(s => {
                if (!this._trmPackageVersion) {
                    try {
                        this._trmPackageVersion = /version=(\S*)/i.exec(s.objName)[1];
                    } catch (e) { }
                }
            });
        }
        return this._trmPackageVersion;
    }

    public async isTrmRelevant(): Promise<boolean> {
        const packageName = await this.getTrmPackageName();
        const packageVersion = await this.getTrmPackageVersion();
        const hasDocumentation = (await this.getDocumentation()).length > 0;
        return !!(packageName && packageVersion && hasDocumentation);
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
            doktl = await SystemConnector.readTable('DOKTL', fields,
                `ID EQ 'TA' AND OBJECT EQ '${this.trkorr}'`
            );
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

    public async lock(): Promise<void> {
        await SystemConnector.lockTransportObjs(this.trkorr);
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
                oTrmPackage = Manifest.fromAbapXml(docVal).getPackage();
                oTrmPackage.setTransport(this);
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
        try {
            await SystemConnector.deleteTrkorr(this.trkorr);
        } finally {
            //the request may be gone even if the call failed: re-read its status
            this._e070 = undefined;
        }
        return null;
    }

    /**
     * Releases the transport and waits for its export to end: its files are complete only then.
     * With `tmpFolder` the export progress is shown and an export with errors fails the release.
     */
    public async release(lock: boolean, skipLog: boolean, tmpFolder?: string): Promise<void> {
        //tp appends to the release log: an earlier export of the same request number may have left one
        const releaseLogOffset = await this._getReleaseLogSize();
        try {
            await SystemConnector.releaseTrkorr(this.trkorr, lock);
        } finally {
            //the status may have changed even if the call failed: re-read it
            this._e070 = undefined;
        }
        if (tmpFolder) {
            await this.readReleaseLog(tmpFolder, releaseLogOffset);
        } else {
            await this._waitExport(releaseLogOffset, skipLog);
        }
        await this._refreshReusedTmsText();
    }

    /**
     * Waits for the export appended to the release log after `offset`, without failing on its return code.
     * The import queue can't tell: a reused request number is already in it while the export is still writing
     * the data file.
     */
    private async _waitExport(offset: number, skipLog: boolean): Promise<number> {
        const started = Date.now();
        const tmpFolder = fs.mkdtempSync(path.join(tmpdir(), 'trm-release-'));
        var poll: Awaited<ReturnType<Transport['_pollReleaseLog']>>;
        try {
            poll = await this._pollReleaseLog(tmpFolder, offset, () => {
                Logger.loading(`${Transport.getTransportIcon()}  Releasing ${this.trkorr} (${Transport._formatDuration(Date.now() - started)})...`, skipLog);
            });
        } finally {
            fs.rmSync(tmpFolder, { recursive: true, force: true });
        }
        if (!poll.completed) {
            throw new Error(`Timed out waiting for transport ${this.trkorr} release log "${poll.releaseLog}".`);
        }
        const exitCode = Transport._releaseLogExitCode(poll.logResult);
        if (exitCode >= 8) {
            Logger.log(`${this.trkorr} export ended with return code ${exitCode}, check "${poll.releaseLog}"`, true);
        }
        Logger.success(`${Transport.getTransportIcon()}  ${this.trkorr} released.`, skipLog);
        return exitCode;
    }

    /** STMS caches request texts by number: a reused request number keeps showing the text of its earlier life. */
    private async _refreshReusedTmsText(): Promise<void> {
        try {
            await this.refreshTmsTxt();
        } catch (e) {
            Logger.log(`Couldn't refresh ${this.trkorr} TMS text: ${e?.message || e}`, true);
        }
    }

    private static _releaseLogExitCode(logResult: ReleaseLogStep[]): number {
        return Math.max(0, ...logResult.filter(o => RELEASE_LOG_STEPS.some(step => step.id === o.id)).map(o => o.exitCode || 0));
    }

    private async _getReleaseLogSize(): Promise<number> {
        const filePaths = await Transport._getFilePaths(this._fileNames);
        try {
            return (await SystemConnector.getBinaryFile(filePaths.releaseLog)).length;
        } catch (e) {
            //no log yet
            return 0;
        }
    }

    /**
     * Waits for the release log to report every export step, and returns the export return code.
     * `offset` is the log size before the release: only what this release appended is read.
     */
    public async readReleaseLog(tmpFolder: string, offset: number = 0): Promise<number> {
        const systemR3transVersion = await SystemConnector.getR3transVersion();
        const systemR3transUnicode = await SystemConnector.getR3transUnicode();
        Logger.log(`System R3trans: ${systemR3transVersion}`, true);
        Logger.log(`System R3trans unicode: ${systemR3transUnicode}`, true);

        const multibar = Logger.multibar('{stage} [{bar}] {exitCode} {result}', Transport.getTransportIcon());
        const steps = RELEASE_LOG_STEPS.map(step => ({
            ...step,
            progress: 0,
            bar: multibar.create(100, 0, {
                stage: '',
                exitCode: '',
                result: 'Needs update'
            })
        }));

        var poll: Awaited<ReturnType<Transport['_pollReleaseLog']>>;
        try {
            poll = await this._pollReleaseLog(tmpFolder, offset, logResult => {
                for (const step of steps) {
                    const logStep = logResult.find(o => o.id === step.id) || { name: step.name, exitCode: null as number };
                    const parsedExitCode = R3transLogParser.parseExitCode(logStep.exitCode);
                    if (parsedExitCode.type === 'UNKNOWN') {
                        step.progress++;
                    } else if (step.progress < 99) {
                        step.progress = 100;
                    }
                    step.bar.update(step.progress, {
                        stage: logStep.name + step.namePadding,
                        exitCode: logStep.exitCode || '',
                        result: parsedExitCode.type !== 'UNKNOWN' ? parsedExitCode.value : 'In progress'
                    });
                }
            });
        } finally {
            multibar.stop();
        }

        if (!poll.completed) {
            throw new Error(`Timed out waiting for transport ${this.trkorr} release log "${poll.releaseLog}".`);
        }
        const exitCode = Transport._releaseLogExitCode(poll.logResult);
        const result = R3transLogParser.parseExitCode(exitCode).type;
        if (result === 'ERROR') {
            throw new Error(`Transport ${this.trkorr} export ended with return code ${exitCode} (${R3transLogParser.parseExitCode(exitCode).value}). Check the export log "${poll.releaseLog}".`);
        }
        if (result === 'WARNING') {
            Logger.warning(`${Transport.getTransportIcon()}  ${this.trkorr} released with warning.`, { important: true });
            return 4;
        }
        Logger.success(`${Transport.getTransportIcon()}  ${this.trkorr} released with success.`);
        return 0;
    }

    /**
     * Polls the release log until it reports every export step (`completed`) or the timeout expires.
     * `offset` is the log size before the release: only what this release appended is read.
     */
    private async _pollReleaseLog(tmpFolder: string, offset: number, onPoll: (logResult: ReleaseLogStep[]) => void): Promise<{ completed: boolean, logResult: ReleaseLogStep[], releaseLog: string }> {
        const filePaths = await Transport._getFilePaths(this._fileNames);
        const localPath = path.join(tmpFolder, this._fileNames.releaseLog);
        const deadline = Date.now() + Transport.releaseLogTimeoutMs;
        var logResult: ReleaseLogStep[] = [];
        var completed = false;

        //the log is downloaded into the temporary folder: a local file system error is not "log not ready yet"
        fs.mkdirSync(tmpFolder, { recursive: true });
        while (!completed && Date.now() < deadline) {
            logResult = [];
            var logBinary: Buffer;
            try {
                logBinary = await SystemConnector.getBinaryFile(filePaths.releaseLog);
            } catch (e) {
                //log not written yet
                logBinary = undefined;
            }
            //a log shorter than the offset was replaced, not appended to
            if (logBinary && logBinary.length >= offset) {
                logBinary = logBinary.subarray(offset);
            }
            if (logBinary && logBinary.length > 0) {
                fs.writeFileSync(localPath, logBinary);
                try {
                    logResult = await (new R3transLogParser(localPath)).getReleaseLog();
                } catch (e) {
                    //log incomplete
                    logResult = [];
                } finally {
                    fs.rmSync(localPath, { force: true });
                }
            }
            completed = RELEASE_LOG_STEPS.every(step => {
                const logStep = logResult.find(o => o.id === step.id);
                return logStep && logStep.exitCode !== null && logStep.exitCode !== undefined;
            });
            onPoll(logResult);
            if (!completed) {
                await setTimeout(1000); //each second
            }
        }
        return { completed, logResult, releaseLog: filePaths.releaseLog };
    }

    /** Polling interval while the SAP status doesn't change: starts at 3 seconds, then backs off. */
    private static _pollInterval(unchangedPolls: number): number {
        return unchangedPolls < 10 ? 3000 : unchangedPolls < 30 ? 5000 : 10000;
    }

    /**
     * Waits for the import of the transport in the TMS queue of its target to complete. The import status of the request
     * (`GET_TR_IMPORT_STATUS`) is read at every check; the whole queue is read only when the status can't
     * tell (virtual targets, a batch status row of another request, an older backend), and once at the end
     * for the request return code. The return code is the highest of the queue `maxrc` and the final tp
     * status return code of this request. With `batch` (imported with others in one tp command), the tp return
     * code and message are the whole batch's: the request's own queue return code is used.
     */
    private async _isInTmsQueue(skipLog: boolean, batch: boolean = false): Promise<{ rc: number, message?: string }> {
        var rc: number = 12;
        var message: string;
        if (!this._trTarget) {
            Logger.error(`No target specified, unable to check queue!!`, true);
            return { rc, message };
        }
        const started = Date.now();
        const elapsed = () => Transport._formatDuration(Date.now() - started);
        let attempts = 0;
        let queueReadFailures = 0;
        let unchangedPolls = 0;
        let lastStatusKey: string;
        let finalStatus: TPSTAT;
        Logger.loading(`Checking ${this.trkorr} status...`, skipLog);
        while (true) {
            attempts++;
            const interval = Transport._pollInterval(unchangedPolls);
            Logger.log(`Attempt ${attempts}, reading in ${interval / 1000} seconds...`, true);
            await setTimeout(interval);
            let status: TPSTAT;
            try {
                status = await SystemConnector.getTransportImportStatus(this.trkorr, this._trTarget);
            } catch (e) {
                Logger.log(`Unable to read ${this.trkorr} import status, the queue is checked instead: ${e}`, true);
            }
            // in a batch import the status row may belong to another request of the batch
            const ownStatus = status && (!status.trkorr || status.trkorr === this.trkorr) ? status : undefined;
            const statusKey = ownStatus ? `${ownStatus.status}|${ownStatus.step}|${ownStatus.moddate}${ownStatus.modtime}|${ownStatus.message}` : undefined;
            if (statusKey && statusKey === lastStatusKey) {
                unchangedPolls++;
            } else {
                unchangedPolls = 0;
                lastStatusKey = statusKey;
            }
            if (ownStatus?.message) {
                const unchanged = unchangedPolls > 0 ? `, unchanged since ${Transport._formatAbapTime(ownStatus.modtime)}` : '';
                Logger.loading(`Importing ${this.trkorr} (${elapsed()}${unchanged}): ${ownStatus.message}...`, skipLog);
            } else {
                Logger.loading(`Importing ${this.trkorr} (${elapsed()})...`, skipLog);
            }
            if (Transport._isFinalStatus(ownStatus)) {
                // the import is over: one queue read for the request return code
                finalStatus = ownStatus;
            } else if (ownStatus && Transport._isRunningStatus(ownStatus)) {
                continue;
            }
            //the queue is still needed when the status can't tell (e.g. VIRTUAL TARGETS)
            var tmsQueue: STMSIQREQ[];
            try {
                tmsQueue = await SystemConnector.readTmsQueue(this._trTarget);
                queueReadFailures = 0;
            } catch (e) {
                // an import can replace the TRM backend itself (trm-server upgrade): its API can
                // fail while it's being imported and activated
                if (++queueReadFailures > 10) {
                    throw e;
                }
                Logger.log(`Unable to read ${this._trTarget} import queue (attempt ${queueReadFailures}), retrying: ${e}`, true);
                continue;
            }
            Logger.log(`${this._trTarget} import queue read: ${tmsQueue.length} requests`, true);
            const entries = tmsQueue.filter(o => o.trkorr === this.trkorr)
                .sort((a, b) => parseInt(b.bufpos) - parseInt(a.bufpos));
            //if importing, get the last transport in queue (if re installing, there are more than 1)
            if (entries.length > 0 && entries[0].impsing !== 'X') {
                //no rc => transport wasn't imported! set as -1 (field is blank, do not confuse with 0 which is success)
                rc = entries[0].maxrc ? parseInt(entries[0].maxrc) : -1;
                break;
            }
            // the status says the import is over, the queue doesn't yet: check again
            finalStatus = undefined;
        }
        if (!finalStatus) {
            try {
                const status = await SystemConnector.getTransportImportStatus(this.trkorr, this._trTarget);
                if (!status.trkorr || status.trkorr === this.trkorr) {
                    finalStatus = status;
                }
            } catch { }
        }
        message = finalStatus?.message;
        const statusRc = Transport._isFinalStatus(finalStatus) ? parseInt(finalStatus.retcode) : NaN;
        if (!isNaN(statusRc) && statusRc > rc) {
            if (batch) {
                Logger.log(`${this.trkorr} queue return code ${rc}, batch tp return code ${statusRc}: ${rc} is used`, true);
                message = undefined;
            } else {
                Logger.log(`${this.trkorr} queue return code ${rc}, tp return code ${statusRc}: ${statusRc} is used`, true);
                rc = statusRc;
            }
        }
        Logger.log(`${this.trkorr} import check completed in ${elapsed()}`, true);
        return { rc, message };
    }

    /** tp status of a finished command: not running, with a numeric return code (8888 means running). */
    private static _isFinalStatus(status: TPSTAT): boolean {
        return !!status && status.status === 'F' && (!status.command || status.command === 'IMPORT')
            && /^\d+$/.test(status.retcode || '') && status.retcode !== '8888';
    }

    private static _isRunningStatus(status: TPSTAT): boolean {
        return !!status && status.status === 'R';
    }

    private static _formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }

    private static _formatAbapTime(time: string): string {
        return time && time.length === 6 ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}` : time;
    }

    private static _getFileNames(trkorr: TRKORR, targetSystem: string): FileNames {
        const trkorrRegex = /^(\S{3})K(.*)/gi;
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

    public static getTrkorrFromFileName(filename: string): string {
        const trkorrRegex = /^(?:K|R)([^\.]*)\.(\S{3})/gi;
        const regexIterator = filename.matchAll(trkorrRegex);
        try {
            const matches = regexIterator.next().value;
            const trkorrFileExtension = matches[2];
            const trkorrNumber = matches[1];
            return `${trkorrFileExtension}K${trkorrNumber}`
        } catch (e) {
            throw new Error(`Couldn't extract transport in filename "${filename}".`);
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

    public static async createCust(data: {
        text: AS4TEXT,
        target: TR_TARGET
    }): Promise<Transport> {
        Logger.loading(`Creating transport request (CUST)...`, true);
        const trkorr = await SystemConnector.createCustTransport(data.text, data.target);
        Logger.success(`Transport request ${trkorr} generated successfully.`, true);
        return new Transport(trkorr, data.target).setTrmIdentifier(TrmTransportIdentifier.CUST);
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

    public static async upload(trkorr: TRKORR, data: {
        binary: BinaryTransport,
        trTarget?: TR_TARGET
    }): Promise<Transport> {
        Logger.loading(`Reading binary content...`, true);
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

    /**
     * Reads the transport's header (cofile) and data files from the transport directory, if present.
     *
     * A missing (`NOT_FOUND`) or empty file is returned as `undefined`; any other read error is rethrown.
     */
    public static async readBinaryFiles(trkorr: TRKORR): Promise<Partial<BinaryTransport>> {
        const filePaths = await Transport._getFilePaths(Transport._getFileNames(trkorr, SystemConnector.getDest()));
        const read = async (filePath: string): Promise<Buffer | undefined> => {
            try {
                const file = await SystemConnector.getBinaryFile(filePath);
                return file && file.length > 0 ? file : undefined;
            } catch (e) {
                //RFC: exception key, REST: HTTP reason (wrapped in exceptionType or raw error message)
                if (e?.exceptionType === 'NOT_FOUND' || e?.message === 'NOT_FOUND') {
                    Logger.log(`File "${filePath}" not found.`, true);
                    return undefined;
                }
                throw e;
            }
        };
        return {
            header: await read(filePaths.header),
            data: await read(filePaths.data)
        };
    }

    /**
     * Writes one of the transport's files (header/cofile or data) to the transport directory.
     */
    public static async writeBinaryFile(trkorr: TRKORR, kind: keyof BinaryTransport, binary: Buffer): Promise<void> {
        const filePaths = await Transport._getFilePaths(Transport._getFileNames(trkorr, SystemConnector.getDest()));
        await SystemConnector.writeBinaryFile(filePaths[kind], binary);
    }

    public static async getTransportsFromObject(objectKeys: {
        pgmid: PGMID,
        object: TROBJTYPE,
        objName: SOBJ_NAME
    }, transportsCache?: Transport[]): Promise<Transport[]> {
        var transports: Transport[] = [];
        const aSkipTrkorr = await SystemConnector.getIgnoredTrkorr();
        const objectInTransport: TRKORR[] = (await SystemConnector.readTable('E071',
            [{ fieldName: 'TRKORR' }],
            `PGMID EQ '${objectKeys.pgmid.trim().toUpperCase()}' AND OBJECT EQ '${objectKeys.object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objectKeys.objName.trim().toUpperCase()}'`
        )).map(o => o.trkorr).filter(trkorr => !aSkipTrkorr.includes(trkorr));
        for (const trkorr of objectInTransport) {
            try {
                var oTransport = (transportsCache || []).find(o => o.trkorr === trkorr);
                if (!oTransport) {
                    oTransport = new Transport(trkorr);
                }
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

    /**
     * Adds the transport to the import queue of the target (import again).
     * A failure is thrown as a {@link TransportTmsError}, telling whether tp or the transport tools failed.
     */
    public static async forward(trkorr: TRKORR, target: TR_TARGET): Promise<void> {
        try {
            await SystemConnector.forwardTransport(trkorr, target, target, true);
        } catch (e) {
            throw new TransportTmsError('Forward', trkorr, target, e);
        }
    }

    public static async importMultiple(transports: Transport[], target: TR_TARGET, forward: boolean = true): Promise<{ trkorr: TRKORR, rc: number, message?: string }[]> {
        if (forward) {
            for (const transport of transports) {
                Logger.loading(`Forwarding transport ${transport.trkorr}`, true);
                await Transport.forward(transport.trkorr, target);
            }
        }
        Logger.loading(`Importing ${transports.map(o => o.trkorr).join(', ')} in batch`, true);
        try {
            await SystemConnector.importTransportMultiple(transports.map(o => o.trkorr), target, false);
        } catch (e) {
            throw new TransportTmsError('Import', transports.map(o => o.trkorr).join(', '), target, e);
        }
        const results: { trkorr: TRKORR, rc: number, message?: string }[] = [];
        const originalLPrefix = Logger.getPrefix();
        try {
            var index = 0;
            for (const transport of transports) {
                index++;
                const prefix = `(${Transport.getTransportIcon()}  ${index}/${transports.length}) `;
                if (originalLPrefix) {
                    Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
                } else {
                    Logger.setPrefix(prefix);
                }
                Logger.log(`Starting transport ${transport.trkorr} TMS queue status check`, true);
                transport._trTarget = target;
                const queue = await transport._isInTmsQueue(false, transports.length > 1);
                transport.lastImportMessage = queue.message;
                Transport._printImportResult(transport.trkorr, queue.rc, queue.message, false);
                results.push({ trkorr: transport.trkorr, rc: queue.rc, message: queue.message });
            }
            return results;
        } finally {
            Logger.setPrefix(originalLPrefix);
        }
    }

    public async import(test: boolean): Promise<number> {
        var rc: number;
        var message: string;
        if (!this._trTarget) {
            throw new Error('Missing transport target.');
        }
        Logger.log(`Starting ${this.trkorr} import ${test ? 'test' : ''}`, true);
        // a test import already put it in the queue: the real import doesn't forward it again
        if (!this._forwardedTo || this._forwardedTo !== this._trTarget) {
            Logger.loading(`Forwarding transport ${this.trkorr}`, true);
            await Transport.forward(this.trkorr, this._trTarget);
            this._forwardedTo = this._trTarget;
        }
        Logger.loading(`Importing ${this.trkorr}${test ? ' (TEST IMPORT)' : ''}`, true);
        var result: Awaited<ReturnType<typeof SystemConnector.importTransport>>;
        try {
            result = await SystemConnector.importTransport(this.trkorr, this._trTarget, test);
        } catch (e) {
            throw new TransportTmsError(test ? 'Test import' : 'Import', this.trkorr, this._trTarget, e);
        }
        if (result) {
            rc = Number(result.tpRetCode);
            if (Array(result.tpStdout)) {
                result.tpStdout.forEach(line => Logger.log(line.line, true));
            }
            // tp can hand the import over to the background ("Going offline") and return at once: the objects are
            // only imported (or deleted) afterwards. Wait for the import recorded in the queue and take its return code.
            if (!test && rc < 8) {
                Logger.log(`Waiting for transport ${this.trkorr} import to complete`, true);
                const queue = await this._isInTmsQueue(false);
                if (queue.rc >= 0) {
                    rc = queue.rc;
                    message = queue.message;
                }
            }
        } else {
            Logger.log(`Starting transport ${this.trkorr} TMS queue status check`, true);
            const queue = await this._isInTmsQueue(false);
            rc = queue.rc;
            message = queue.message;
        }
        this.lastImportMessage = message;
        Transport._printImportResult(this.trkorr, rc, message, test);
        return rc;
    }

    private static _printImportResult(trkorr: TRKORR, rc: number, message: string, test: boolean): void {
        switch (rc) {
            case -1:
                Logger.error(`${trkorr} import has no return code!`, { debug: test, important: true });
                break;
            case 0:
                Logger.success(`${trkorr} import ended with success${message ? ' -> ' + message : '.'}`, test);
                break;
            case 4:
                Logger.warning(`${trkorr} import ended with warning${message ? ' -> ' + message : '.'}`, { debug: test, important: true });
                break;
            case 8:
                Logger.error(`${trkorr} import ended with error (check ${chalk.bold('STMS')})${message ? ' -> ' + message : '.'}`, { debug: test, important: true });
                break;
            case 12:
                Logger.error(`${trkorr} import was cancelled${message ? ' -> ' + message : '.'}`, { debug: test, important: true });
                break;
            case 16:
                Logger.error(`${trkorr} import was cancelled${message ? ' -> ' + message : '.'}`, { debug: test, important: true });
                break;
        }
    }

    public async rename(as4text: string): Promise<void> {
        await SystemConnector.renameTransportRequest(this.trkorr, as4text);
    }

    public async canBeDeleted(): Promise<boolean> {
        const status = (await this.getE070())?.trstatus;
        return status === 'D';
    }

    public async isReleased(): Promise<boolean> {
        const status = (await this.getE070())?.trstatus;
        return status === 'R' || status === 'N';
    }

    public async addObjectsFromTransport(from: TRKORR): Promise<void> {
        await SystemConnector.trCopy(from, this.trkorr, false);
    }

    public async deleteFromTms(system: TMSSYSNAM): Promise<void> {
        await SystemConnector.deleteTmsTransport(this.trkorr, system);
    }

    public async refreshTmsTxt(): Promise<void> {
        await SystemConnector.refreshTransportTmsTxt(this.trkorr);
    }

    public async changeOwner(newOwner: TR_AS4USER): Promise<void> {
        await SystemConnector.changeTrOwner(this.trkorr, newOwner);
    }

    public static getTransportIcon(): string {
        return '⛟';
    }

}
