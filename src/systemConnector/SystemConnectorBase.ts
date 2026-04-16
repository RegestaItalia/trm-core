import { valid as semverValid } from "semver";
import { inspect, Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { TADIR, TDEVC } from "../client/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { InstallPackage } from "./InstallPackage";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { ISystemConnectorBase } from "./ISystemConnectorBase";
import { AbstractRegistry, LOCAL_RESERVED_KEYWORD, PUBLIC_RESERVED_KEYWORD, RegistryProvider, RegistryType } from "../registry";
import { R3trans } from "node-r3trans";
import { ObjectDependencies, PackageDependencies } from "../dependencies";
import { SystemConnector } from "./SystemConnector";
import * as cliProgress from "cli-progress";
import { fromAbapToDate } from "../commons";

export const TRM_SERVER_PACKAGE_NAME: string = 'trm-server';
export const TRM_SERVER_INTF: string = '/ATRM/IF_SERVER';
export const TRM_REST_INTF: string = '/ATRM/IF_REST';
export const TRM_REST_PACKAGE_NAME: string = 'trm-rest';
export const SRC_TRKORR_TABL = '/ATRM/SRC_TRKORR';
export const SKIP_TRKORR_TABL = '/ATRM/SKIPTRKORR';
export const INSTALL_DEVCLASS_VIEW = '/ATRM/V_INSTDEVC';

export abstract class SystemConnectorBase implements ISystemConnectorBase {

  private _installedPackages: TrmPackage[];
  private _sourceTrkorr: string[];
  private _ignoredTrkorr: string[];
  private _r3transInfoLog: string;
  private _tableKeys: any = {};
  private _rootDevclass: any = {};
  private _timezone: string;

  protected abstract readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]>
  protected abstract getSysname(): string
  protected abstract getLangu(c: boolean): string
  protected abstract getTrmServerVersion(): Promise<string>
  protected abstract getTrmRestVersion(): Promise<string>
  protected abstract listDevclassObjects(devclass: components.DEVCLASS): Promise<struct.TADIR[]>
  protected abstract tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void>
  protected abstract getR3transInfo(): Promise<string>
  protected abstract getInstalledPackagesBackend(): Promise<struct.ZTRM_PACKAGE[]>
  protected abstract getPackageDependenciesInternal(devclass: components.DEVCLASS, includeSubPackages: boolean, logId?: components.ZTRM_POLLING_ID): Promise<struct.ZTRM_OBJECT_DEPENDENCIES[]>
  protected abstract getObjectDependenciesInternal(object: components.TROBJTYPE, objName: components.SOBJ_NAME): Promise<struct.ZTRM_OBJECT_DEPENDENCY[]>

  constructor() {

  }

  public async getTransportStatus(trkorr: components.TRKORR): Promise<string> {
    const aTrkorrStatusCheck: any[] = (await this.readTable('E070',
      [{ fieldName: 'TRKORR' }, { fieldName: 'TRSTATUS' }],
      `TRKORR EQ '${trkorr}'`
    ));
    if (aTrkorrStatusCheck.length !== 1) {
      throw new Error(`Transport not found.`);
    } else {
      return aTrkorrStatusCheck[0].trstatus;
    }
  }

  public async getSourceTrkorr(refresh?: boolean): Promise<components.TRKORR[]> {
    if (!this._sourceTrkorr || refresh) {
      Logger.log(`Ready to read installed packages`, true);
      Logger.log(`Checking if ${SRC_TRKORR_TABL} exists`, true);
      const tablExists: any[] = await this.readTable('TADIR',
        [{ fieldName: 'OBJ_NAME' }],
        `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SRC_TRKORR_TABL}'`);
      if (tablExists.length === 1) {
        Logger.log(`TABL ${SRC_TRKORR_TABL} exists`, true);
        const srcTrkorr: {
          trkorr: components.TRKORR
        }[] = await this.readTable(SRC_TRKORR_TABL,
          [{ fieldName: 'TRKORR' }]
        );
        this._sourceTrkorr = srcTrkorr.map(o => o.trkorr);
      } else {
        this._sourceTrkorr = [];
      }
    }
    return this._sourceTrkorr;
  }

  public async getObject(pgmid: components.PGMID, object: components.TROBJTYPE, objName: components.SOBJ_NAME): Promise<TADIR> {
    const tadir: TADIR[] = await this.readTable('TADIR',
      [{ fieldName: 'PGMID' }, { fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }, { fieldName: 'DEVCLASS' }, { fieldName: 'SRCSYSTEM' }, { fieldName: 'AUTHOR' }],
      `PGMID EQ '${pgmid.trim().toUpperCase()}' AND OBJECT EQ '${object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objName.trim().toUpperCase()}'`
    );
    if (tadir.length === 1) {
      return tadir[0];
    }
  }

  public async getIgnoredTrkorr(refresh?: boolean): Promise<components.TRKORR[]> {
    if (!this._ignoredTrkorr || refresh) {
      Logger.log(`Reading ignored transports`, true);
      Logger.log(`Checking if ${SKIP_TRKORR_TABL} exists`, true);
      const tablExists: any[] = await this.readTable('TADIR',
        [{ fieldName: 'OBJ_NAME' }],
        `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SKIP_TRKORR_TABL}'`);
      if (tablExists.length === 1) {
        Logger.log(`TABLE ${SKIP_TRKORR_TABL} exists`, true);
        const skipTrkorr: {
          trkorr: components.TRKORR
        }[] = await this.readTable(SKIP_TRKORR_TABL,
          [{ fieldName: 'TRKORR' }]
        );
        this._ignoredTrkorr = skipTrkorr.map(o => o.trkorr);
      } else {
        this._ignoredTrkorr = [];
      }
    }
    return this._ignoredTrkorr;
  }

  public async getTrmServerPackage(): Promise<TrmPackage> {
    var oPackage: TrmPackage;
    const oPublicRegistry = RegistryProvider.getRegistry();
    const intf = await this.getObject('R3TR', 'INTF', TRM_SERVER_INTF);
    if (intf) {
      try {
        const trmServerVersion = await this.getTrmServerVersion();
        const oManifest = new Manifest({
          name: TRM_SERVER_PACKAGE_NAME,
          version: trmServerVersion
        });
        if (semverValid(trmServerVersion)) {
          oPackage = new TrmPackage(TRM_SERVER_PACKAGE_NAME, oPublicRegistry, oManifest).setDevclass(intf.devclass);
        }
      } catch (e) { }
    }
    if (!oPackage) {
      throw new Error(`Package ${TRM_SERVER_PACKAGE_NAME} was not found.`);
    }
    return oPackage;
  }

  public async getTrmRestPackage(): Promise<TrmPackage> {
    var oPackage: TrmPackage;
    const oPublicRegistry = RegistryProvider.getRegistry();
    const intf = await this.getObject('R3TR', 'INTF', TRM_REST_INTF);
    if (intf) {
      try {
        const trmRestVersion = await this.getTrmRestVersion();
        const oManifest = new Manifest({
          name: TRM_REST_PACKAGE_NAME,
          version: trmRestVersion
        });
        if (semverValid(trmRestVersion)) {
          oPackage = new TrmPackage(TRM_REST_PACKAGE_NAME, oPublicRegistry, oManifest).setDevclass(intf.devclass);
        }
      } catch (e) { }
    }
    if (!oPackage) {
      throw new Error(`Package ${TRM_REST_PACKAGE_NAME} was not found.`);
    }
    return oPackage;
  }

  public async getInstalledPackages(refresh?: boolean, includeLocals?: boolean): Promise<TrmPackage[]> {
    var trmPackages: TrmPackage[] = [];
    var fromBackend = false;

    if (!refresh) {
      Logger.log(`Reading cached version of installed packages`, true);
      return this._installedPackages;
    }

    //if system has trm-server we can fetch with backend api
    const serverExists: any[] = await this.readTable('TADIR',
      [{ fieldName: 'OBJ_NAME' }],
      `PGMID EQ 'R3TR' AND OBJECT EQ 'INTF' AND OBJ_NAME EQ '${TRM_SERVER_INTF}'`);
    if (serverExists.length === 1) {
      Logger.log(`INTF ${TRM_SERVER_INTF} exists, reading packages from backend API`, true);
      try {
        var installedPackagesBackend = await this.getInstalledPackagesBackend();
        installedPackagesBackend = installedPackagesBackend.sort((a, b) => Number(`${b.as4Date}${b.as4Time}`) - Number(`${a.as4Date}${a.as4Time}`));
        if (!includeLocals) {
          installedPackagesBackend = installedPackagesBackend.filter(o => o.packageRegistry !== LOCAL_RESERVED_KEYWORD);
        }
        for (const o of installedPackagesBackend) {
          const manifest = Manifest.fromAbapXml(o.manifest);
          if(o.trkorr){
            manifest.setLinkedTransport(new Transport(o.trkorr, null));
          }
          const trmPackage = new TrmPackage(o.packageName, RegistryProvider.getRegistry(o.packageRegistry), manifest).setDevclass(o.devclass).setDirtyEntries(o.dirty);
          trmPackages.push(trmPackage);
        }
        fromBackend = true;
      } catch (e) {
        trmPackages = [];
        Logger.error(e.toString(), true);
      }
    }
    if (fromBackend) {
      Logger.log(`Packages were fetched from backend API`, true);
      return trmPackages;
    } else {
      Logger.log(`Packages weren't fetched from backend API, continue`, true);
    }


    var packageTransports: {
      package: TrmPackage,
      transports: Transport[]
    }[] = [];
    Logger.log(`Ready to read installed packages`, true);
    var allTransports: components.TRKORR[] = (await this.readTable('E071',
      [{ fieldName: 'TRKORR' }],
      `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
    )).map(o => o.trkorr);
    //because we're extracting from e071, there will be multiple records with the same trkorr
    //unique array
    allTransports = Array.from(new Set(allTransports));

    //read tms of current system and with maxrc > 0 and impsing != X
    //if there's no match, ignore
    for (const trkorr of allTransports) {
      var aTrkorrStatusCheck: any[];
      try {
        Logger.log(`Checking ${trkorr} TMS import result`, true);
        aTrkorrStatusCheck = (await this.readTable('TMSBUFFER',
          [{ fieldName: 'TRKORR' }, { fieldName: 'MAXRC' }],
          //is the condition (IMPFLG EQ 't' OR IMPFLG EQ 'k') necessary?
          `SYSNAM EQ '${this.getSysname()}' AND TRKORR EQ '${trkorr}' AND IMPSING NE 'X'`
        ));
        aTrkorrStatusCheck = aTrkorrStatusCheck.filter(o => parseInt(o.maxrc) >= 0);
      } catch (e) {
        aTrkorrStatusCheck = [];
      }
      if (aTrkorrStatusCheck.length === 0) {
        Logger.log(`${trkorr} is ignored: no status!`, true);
        allTransports = allTransports.filter(s => s !== trkorr);
      }
    }

    Logger.log(`All transports to check: ${JSON.stringify(allTransports)}`, true);

    const transports: Transport[] = allTransports.map(trkorr => new Transport(trkorr, null));
    for (const transport of transports) {
      const trmPackage = await transport.getLinkedPackage();
      if (trmPackage) {
        Logger.log(`Transport ${transport.trkorr}, found linked package`, true);
        if (trmPackage.registry.getRegistryType() === RegistryType.LOCAL && !includeLocals) {
          Logger.log(`Package is local, skipping`, true);
          continue;
        }
        //only compares package name and registry
        var arrayIndex = packageTransports.findIndex(o => TrmPackage.compare(o.package, trmPackage));
        if (arrayIndex < 0) {
          arrayIndex = packageTransports.push({
            package: trmPackage,
            transports: []
          });
          arrayIndex--;
        }
        packageTransports[arrayIndex].transports.push(transport);
      }
    }
    Logger.log(`Package Transports map: ${inspect(packageTransports.map(o => {
      return {
        packageName: o.package.packageName,
        registry: o.package.registry.endpoint,
        transports: o.transports.map(k => k.trkorr)
      }
    }), { breakLength: Infinity, compact: true })}`, true);
    for (const packageTransport of packageTransports) {
      const latestTransport = await Transport.getLatest(packageTransport.transports);
      if (latestTransport) {
        trmPackages.push(await latestTransport.getLinkedPackage());
      }
    }
    Logger.log(`Packages found: ${inspect(trmPackages, { breakLength: Infinity, compact: true })}`, true);
    this._installedPackages = trmPackages;
    return trmPackages;
  }

  public async getDevclass(devclass: components.DEVCLASS): Promise<TDEVC> {
    const tdevc: TDEVC[] = await this.readTable('TDEVC',
      [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }, { fieldName: 'TPCLASS' }, { fieldName: 'DLVUNIT' }],
      `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
    );
    if (tdevc.length === 1) {
      return tdevc[0];
    }
  }

  public async getSubpackages(devclass: components.DEVCLASS): Promise<TDEVC[]> {
    const queryFields = [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }];
    var subpackages: {
      tdevc: TDEVC,
      queryDone: boolean
    }[] = [];
    const initial: TDEVC[] = await this.readTable('TDEVC',
      queryFields,
      `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
    );
    if (initial.length === 1) {
      subpackages.push({
        tdevc: initial[0],
        queryDone: false
      });
    }
    while (subpackages.find(o => !o.queryDone)) {
      const searchParentIndex = subpackages.findIndex(o => !o.queryDone);
      const tdevc: TDEVC[] = await this.readTable('TDEVC',
        queryFields,
        `PARENTCL EQ '${subpackages[searchParentIndex].tdevc.devclass.trim().toUpperCase()}'`
      );
      subpackages[searchParentIndex].queryDone = true;
      tdevc.forEach(o => {
        subpackages.push({
          tdevc: o,
          queryDone: false
        });
      });
    }
    return subpackages.map(o => o.tdevc).filter(o => o.devclass !== devclass.trim().toUpperCase());
  }

  public async getDevclassObjects(devclass: components.DEVCLASS, includeSubpackages: boolean = true): Promise<TADIR[]> {
    var aTadir: TADIR[] = [];
    var aDevclass: components.DEVCLASS[] = [devclass];
    if (includeSubpackages) {
      aDevclass = aDevclass.concat(((await this.getSubpackages(devclass)).map(o => o.devclass)));
    }
    for (const d of aDevclass) {
      aTadir = aTadir.concat(((await this.listDevclassObjects(d.trim().toUpperCase()))));
    }
    return aTadir;
  }

  public async getInstallPackages(packageName: string, registry: AbstractRegistry): Promise<InstallPackage[]> {
    const registryEndpoint = registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : registry.endpoint;
    return await this.readTable(INSTALL_DEVCLASS_VIEW,
      [{ fieldName: 'ORIGINAL_DEVCLASS' }, { fieldName: 'INSTALL_DEVCLASS' }],
      `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
    );
  }

  public async setPackageSuperpackage(devclass: components.DEVCLASS, superpackage: components.DEVCLASS): Promise<void> {
    return await this.tdevcInterface(devclass, superpackage);
  }

  public async clearPackageSuperpackage(devclass: components.DEVCLASS): Promise<void> {
    return await this.tdevcInterface(devclass, null, true);
  }

  public async setPackageTransportLayer(devclass: components.DEVCLASS, devlayer: components.DEVLAYER): Promise<void> {
    return await this.tdevcInterface(devclass, null, null, devlayer);
  }

  public async checkSapEntryExists(table: string, sapEntry: any): Promise<boolean> {
    try {
      var aQuery = [];
      Object.keys(sapEntry).forEach(k => {
        aQuery.push(`${k.trim().toUpperCase()} EQ '${sapEntry[k]}'`);
      });
      const entry: any[] = await this.readTable(table.trim().toUpperCase(),
        [{ fieldName: Object.keys(sapEntry)[0].trim().toUpperCase() }],
        aQuery.join(' AND '));
      return entry.length > 0;
    } catch (e) {
      return false;
    }
  }

  public async getPackageIntegrity(oPackage: TrmPackage): Promise<string> {
    const packageName = oPackage.packageName;
    const registryEndpoint = oPackage.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : oPackage.registry.endpoint;
    const aIntegrity: { integrity: string }[] = await this.readTable('ZTRM_INTEGRITY',
      [{ fieldName: 'INTEGRITY' }],
      `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
    );
    if (aIntegrity.length === 1) {
      return aIntegrity[0].integrity;
    } else {
      return ''; //avoid returning undefined
    }
  }

  public async getFunctionModule(func: string): Promise<struct.TFDIR> {
    const aTfdir: struct.TFDIR[] = await this.readTable('TFDIR',
      [{ fieldName: 'FUNCNAME' }, { fieldName: 'PNAME' }],
      `FUNCNAME EQ '${func.trim().toUpperCase()}'`
    );
    if (aTfdir.length === 1) {
      return aTfdir[0];
    }
  }

  public async getExistingObjects(objects: TADIR[]): Promise<TADIR[]> {
    var ret: TADIR[] = [];
    for (const object of objects) {
      const oTadir = await this.getObject(object.pgmid, object.object, object.objName);
      if (oTadir) {
        ret.push(oTadir);
      }
    }
    return ret;
  }

  public async getNamespace(namespace: components.NAMESPACE): Promise<{
    trnspacet: struct.TRNSPACET,
    trnspacett: struct.TRNSPACETT[]
  }> {
    const aNamespace: struct.TRNSPACET[] = await this.readTable('TRNSPACET',
      [{ fieldName: 'NAMESPACE' }, { fieldName: 'REPLICENSE' }],
      `NAMESPACE EQ '${namespace.toUpperCase()}'`
    );
    if (aNamespace.length === 1) {
      const aNamespacet: struct.TRNSPACETT[] = await this.readTable('TRNSPACETT',
        [{ fieldName: 'NAMESPACE' }, { fieldName: 'SPRAS' }, { fieldName: 'DESCRIPTN' }, { fieldName: 'OWNER' }],
        `NAMESPACE EQ '${namespace.toUpperCase()}'`
      );
      return {
        trnspacet: aNamespace[0],
        trnspacett: aNamespacet
      }
    }
  }

  public async getR3transVersion(): Promise<string> {
    if (!this._r3transInfoLog) {
      this._r3transInfoLog = await this.getR3transInfo();
    }
    return R3trans.getVersion(this._r3transInfoLog);
  }

  public async getR3transUnicode(): Promise<boolean> {
    if (!this._r3transInfoLog) {
      this._r3transInfoLog = await this.getR3transInfo();
    }
    return R3trans.isUnicode(this._r3transInfoLog);
  }

  public async isTransportLayerExist(devlayer: components.DEVLAYER): Promise<boolean> {
    const aTransportLayer: any[] = (await this.readTable('TCETRAL',
      [{ fieldName: 'VERSION' }, { fieldName: 'TRANSLAYER' }],
      `TRANSLAYER EQ '${devlayer}'`
    ));
    //it's sufficient one version exists with tranSLAYER = devlayer (RAINING BLOOOOODDD!!!)
    return aTransportLayer.length > 0;
  }

  public async readClassDescriptions(clsname: components.SEOCLSNAME): Promise<struct.SEOCLASSTX[]> {
    return await this.readTable('SEOCLASSTX',
      [{ fieldName: 'CLSNAME' }, { fieldName: 'LANGU' }, { fieldName: 'DESCRIPT' }],
      `CLSNAME EQ '${clsname.trim().toUpperCase()}'`
    );
  }

  public async getPackageDependencies(devclass: components.DEVCLASS, includeSubPackages: boolean, log?: boolean): Promise<PackageDependencies> {
    var packageDependencies: struct.ZTRM_OBJECT_DEPENDENCIES[];
    if (log) {
      Logger.forceStop();
      const logProgress = new cliProgress.SingleBar({
        clearOnComplete: true,
        hideCursor: true,
        format: 'Finding dependencies [{bar}] {percentage}%',
        barGlue: '>'
      }, cliProgress.Presets.legacy);
      logProgress.start(100, 0);
      // create logging poll
      const isStateless = SystemConnector.isStateless();
      const newConnection = isStateless ? SystemConnector.systemConnector : SystemConnector.getNewConnection();
      if (!isStateless) {
        await newConnection.connect(true);
      }
      const logId = await newConnection.createLogPolling('DEVCLASS_D');
      const job = this.getPackageDependenciesInternal(devclass, includeSubPackages, logId);
      var stopped = false;
      const poll = (async () => {
        while (!stopped) {
          try {
            const status = await newConnection.readLogPolling(logId);
            if (status) {
              //TODO: fix with a better solution, for now testing regex is ok...
              const match = status.match(/\(([\d.]+)%\)/);
              if (match) {
                logProgress.update(parseFloat(match[1]));
              }
            }
          } catch { }
          await new Promise(r => setTimeout(r, 500));
        }
      })();
      try {
        packageDependencies = await job;
      } catch (e) {
        try {
          await newConnection.deleteLogPolling(logId);
        } catch { }
        throw e;
      }
      stopped = true;
      await poll;
      logProgress.update(100);
      try {
        await newConnection.deleteLogPolling(logId);
        if (!isStateless) {
          await newConnection.closeConnection();
        }
      } catch { }
      logProgress.stop();
      return (await new PackageDependencies(devclass).setDependencies(packageDependencies || [], log));
    } else {
      packageDependencies = await this.getPackageDependenciesInternal(devclass, includeSubPackages);
      return (await new PackageDependencies(devclass).setDependencies(packageDependencies || []));
    }
  }

  public async getObjectDependencies(object: components.TROBJTYPE, objName: components.SOBJ_NAME): Promise<ObjectDependencies> {
    const objectDependencies = await this.getObjectDependenciesInternal(object, objName);
    return (await new ObjectDependencies(object, objName).setDependencies(objectDependencies || []));
  }

  public async getTableKeys(tabname: components.TABNAME): Promise<struct.DD03L[]> {
    tabname = tabname.trim().toUpperCase();
    if (!this._tableKeys[tabname]) {
      this._tableKeys[tabname] = await this.readTable('DD03L',
        [{ fieldName: 'FIELDNAME' }, { fieldName: 'POSITION' }, { fieldName: 'LENG' }],
        `TABNAME EQ '${tabname.trim().toUpperCase()}' AND AS4LOCAL EQ 'A' AND AS4VERS EQ '0000' AND KEYFLAG EQ 'X'`
      );
    }
    return this._tableKeys[tabname];
  }

  public async getRootDevclass(devclass: components.DEVCLASS): Promise<components.DEVCLASS> {
    devclass = devclass.trim().toUpperCase();
    var currentDevclass = devclass;
    if (!this._rootDevclass[currentDevclass]) {
      var pastDevclass: components.DEVCLASS[] = [];
      while (currentDevclass) {
        var res = (await this.readTable('TDEVC',
          [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }],
          `DEVCLASS EQ '${currentDevclass}'`
        ))[0];
        if (res.parentcl) {
          pastDevclass.push(currentDevclass);
          currentDevclass = res.parentcl;
        } else {
          pastDevclass.push(currentDevclass);
          pastDevclass.forEach(p => {
            this._rootDevclass[p] = res.devclass;
          });
          currentDevclass = null;
        }
      }
    }
    return this._rootDevclass[devclass];
  }

  public async getTimezone(): Promise<string> {
    if (!this._timezone) {
      const map: Record<string, string> = {
        // Europe
        CET: "Europe/Berlin",
        EET: "Europe/Helsinki",
        GMTUK: "Europe/London",
        AZOREN: "Atlantic/Azores",
        CYPRUS: "Asia/Nicosia",
        MOLDVA: "Europe/Chisinau",
        TURKEY: "Europe/Istanbul",

        // Africa
        CAT: "Africa/Harare",
        EGYPT: "Africa/Cairo",
        MOROCC: "Africa/Casablanca",

        // Middle East
        ISRAEL: "Asia/Jerusalem",
        IRAN: "Asia/Tehran",
        IRAQ: "Asia/Baghdad",
        JORDAN: "Asia/Amman",
        LBANON: "Asia/Beirut",
        SYRIA: "Asia/Damascus",

        // Asia
        AFGHAN: "Asia/Kabul",
        AZT: "Asia/Baku",
        BDT: "Asia/Dhaka",
        INDIA: "Asia/Kolkata",
        JAPAN: "Asia/Tokyo",
        NEPAL: "Asia/Kathmandu",
        PKT: "Asia/Karachi",

        // Russia zones
        RUS02: "Europe/Kaliningrad",
        RUS03: "Europe/Moscow",
        RUS04: "Europe/Samara",
        RUS05: "Asia/Yekaterinburg",
        RUS06: "Asia/Omsk",
        RUS07: "Asia/Krasnoyarsk",
        RUS08: "Asia/Irkutsk",
        RUS09: "Asia/Yakutsk",
        RUS10: "Asia/Vladivostok",
        RUS11: "Asia/Magadan",
        RUS12: "Asia/Kamchatka",

        // Australia
        AUSEUC: "Australia/Eucla",
        AUSLHI: "Australia/Lord_Howe",
        AUSNSW: "Australia/Sydney",
        AUSNT: "Australia/Darwin",
        AUSQLD: "Australia/Brisbane",
        AUSSA: "Australia/Adelaide",
        AUSTAS: "Australia/Hobart",
        AUSVIC: "Australia/Melbourne",
        AUSWA: "Australia/Perth",
        NORFLK: "Pacific/Norfolk",

        // New Zealand
        NZST: "Pacific/Auckland",
        NZCHA: "Pacific/Chatham",

        // Americas - North
        ALA: "America/Anchorage",
        ALAW: "America/Adak",
        EST: "America/New_York",
        EST_: "America/Toronto",
        EST_NA: "America/New_York",
        ESTNO: "America/New_York",
        CST: "America/Chicago",
        CST_NA: "America/Chicago",
        CSTNO: "America/Chicago",
        MST: "America/Denver",
        MSTNO: "America/Phoenix",
        MST_NA: "America/Denver",
        PST: "America/Los_Angeles",
        HAW: "Pacific/Honolulu",
        NST: "America/St_Johns",
        PIERRE: "America/Miquelon",

        // Americas - South
        ART: "America/Argentina/Buenos_Aires",
        BRAZIL: "America/Sao_Paulo",
        BRZLAN: "America/Manaus",
        BRZLWE: "America/Rio_Branco",
        CHILE: "America/Santiago",
        CHILEE: "Pacific/Easter",
        CHILEM: "America/Punta_Arenas",
        PARAGY: "America/Asuncion",
        URUGUA: "America/Montevideo",
        GST: "America/Godthab",
        GSTE: "America/Scoresbysund",
        GSTW: "America/Godthab",
        FLKLND: "Atlantic/Stanley",

        // Other
        FIJI: "Pacific/Fiji",
        MAU: "Indian/Mauritius",

        // UTC
        UTC: "UTC",
      };
      try {
        const sapTimezone: string = (await this.readTable('TTZCU', [{ fieldName: 'TZONESYS' }]))[0].tzonesys;
        // Handle UTC dynamically (UTC+1, UTC+10, UTC-3, etc.)
        const m = sapTimezone.match(/^UTC([+-])(\d{1,2})$/);
        if (m) {
          const sign = m[1];
          const hours = Number(m[2]);
          const etcSign = sign === "+" ? "-" : "+";
          this._timezone = `Etc/GMT${etcSign}${hours}`;
        }
        if (!map[sapTimezone]) {
          throw new Error(`Unsupported SAP timezone: ${sapTimezone}`);
        }
        this._timezone = map[sapTimezone];
      } catch (e) {
        Logger.error(`Cannot read/parse system timezone!`, true);
        Logger.error(e.toString(), true);
        this._timezone = 'UTC'; //default
      }
    }
    return this._timezone;
  }

}