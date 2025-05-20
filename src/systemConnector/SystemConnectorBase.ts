import { valid as semverValid } from "semver";
import { inspect, Logger } from "trm-commons";
import { Manifest } from "../manifest";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../client/components";
import { TADIR, TDEVC, TMSCSYS } from "../client/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { InstallPackage } from "./InstallPackage";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { ISystemConnectorBase } from "./ISystemConnectorBase";
import { AbstractRegistry, LOCAL_RESERVED_KEYWORD, PUBLIC_RESERVED_KEYWORD, RegistryProvider, RegistryType } from "../registry";
import { R3trans } from "node-r3trans";
import { TrmServerUpgrade } from "../commons";

export const TRM_SERVER_PACKAGE_NAME: string = 'trm-server';
export const TRM_SERVER_INTF: string = 'ZIF_TRM';
export const TRM_REST_PACKAGE_NAME: string = 'trm-rest';
export const SRC_TRKORR_TABL = 'ZTRM_SRC_TRKORR';
export const SKIP_TRKORR_TABL = 'ZTRM_SKIP_TRKORR';

export abstract class SystemConnectorBase implements ISystemConnectorBase {

  private _installedPackages: TrmPackage[];
  private _installedPackagesI: TrmPackage[];
  private _sourceTrkorr: string[];
  private _ignoredTrkorr: string[];
  private _r3transInfoLog: string;

  protected abstract readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]>
  protected abstract getSysname(): string
  protected abstract getLangu(c: boolean): string
  protected abstract getTrmServerVersion(): Promise<string>
  protected abstract getTrmRestVersion(): Promise<string>
  protected abstract listDevclassObjects(devclass: components.DEVCLASS): Promise<struct.TADIR[]>
  protected abstract tdevcInterface(devclass: components.DEVCLASS, parentcl?: components.DEVCLASS, rmParentCl?: boolean, devlayer?: components.DEVLAYER): Promise<void>
  protected abstract getR3transInfo(): Promise<string>
  protected abstract getInstalledPackagesBackend(): Promise<struct.ZTY_TRM_PACKAGE[]>

  constructor() {

  }

  public async getTransportStatus(trkorr: TRKORR): Promise<string> {
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

  public async getPackageWorkbenchTransport(oPackage: TrmPackage): Promise<Transport> {
    var aTrkorr: TRKORR[] = (await this.readTable('E071',
      [{ fieldName: 'TRKORR' }],
      `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
    )).map(o => o.trkorr);
    //because we're extracting from e071, there will be multiple records with the same trkorr
    //unique array
    aTrkorr = Array.from(new Set(aTrkorr))

    //for each transport, check its status is D (can be released)
    var aSkipTrkorr: string[] = [];
    for (const sTrkorr of aTrkorr) {
      var canBeReleased = false;
      try {
        canBeReleased = (await this.getTransportStatus(sTrkorr)) === 'D';
      } catch (e) {
        canBeReleased = false;
      }
      if (!canBeReleased) {
        aSkipTrkorr.push(sTrkorr);
      }
    }

    //filter transports
    aTrkorr = aTrkorr.filter(trkorr => !aSkipTrkorr.includes(trkorr));

    const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr));
    var packageTransports: Transport[] = [];
    for (const transport of transports) {
      const transportPackage = await transport.getLinkedPackage();
      if (transportPackage) {
        if (TrmPackage.compare(transportPackage, oPackage)) {
          packageTransports.push(transport);
        }
      }
    }

    if (packageTransports.length > 0) {
      return await Transport.getLatest(packageTransports);
    }

    return null;
  }

  public async getSourceTrkorr(refresh?: boolean): Promise<TRKORR[]> {
    if (!this._sourceTrkorr || refresh) {
      Logger.log(`Ready to read installed packages`, true);
      Logger.log(`Checking if ${SRC_TRKORR_TABL} exists`, true);
      const tablExists: any[] = await this.readTable('TADIR',
        [{ fieldName: 'OBJ_NAME' }],
        `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SRC_TRKORR_TABL}'`);
      if (tablExists.length === 1) {
        Logger.log(`TABL ${SRC_TRKORR_TABL} exists`, true);
        const srcTrkorr: {
          trkorr: TRKORR
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

  public async getObject(pgmid: PGMID, object: TROBJTYPE, objName: SOBJ_NAME): Promise<TADIR> {
    const tadir: TADIR[] = await this.readTable('TADIR',
      [{ fieldName: 'PGMID' }, { fieldName: 'OBJECT' }, { fieldName: 'OBJ_NAME' }, { fieldName: 'DEVCLASS' }, { fieldName: 'SRCSYSTEM' }, { fieldName: 'AUTHOR' }],
      `PGMID EQ '${pgmid.trim().toUpperCase()}' AND OBJECT EQ '${object.trim().toUpperCase()}' AND OBJ_NAME EQ '${objName.trim().toUpperCase()}'`
    );
    if (tadir.length === 1) {
      return tadir[0];
    }
  }

  public async getIgnoredTrkorr(refresh?: boolean): Promise<TRKORR[]> {
    if (!this._ignoredTrkorr || refresh) {
      Logger.log(`Reading ignored transports`, true);
      Logger.log(`Checking if ${SKIP_TRKORR_TABL} exists`, true);
      const tablExists: any[] = await this.readTable('TADIR',
        [{ fieldName: 'OBJ_NAME' }],
        `PGMID EQ 'R3TR' AND OBJECT EQ 'TABL' AND OBJ_NAME EQ '${SKIP_TRKORR_TABL}'`);
      if (tablExists.length === 1) {
        Logger.log(`TABLE ${SKIP_TRKORR_TABL} exists`, true);
        const skipTrkorr: {
          trkorr: TRKORR
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
    const intf = await this.getObject('R3TR', 'INTF', 'ZIF_TRM');
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
    const intf = await this.getObject('R3TR', 'INTF', 'ZIF_TRM_REST');
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

  public async getInstalledPackages(includeSoruces: boolean = true, refresh?: boolean, includeLocals?: boolean): Promise<TrmPackage[]> {
    var trmPackages: TrmPackage[] = [];
    var fromBackend = false;

    if (!refresh) {
      if (includeSoruces && this._installedPackagesI) {
        Logger.log(`Cached version of installed packages with sources`, true);
        return this._installedPackagesI;
      } else if (!includeSoruces && this._installedPackages) {
        Logger.log(`Cached version of installed packages without sources`, true);
        return this._installedPackages;
      }
    }

    Logger.log(`Include sources: ${includeSoruces}`, true);
    const aSourceTrkorr = includeSoruces ? (await this.getSourceTrkorr(refresh)) : [];

    //if system has trm-server we can fetch with backend api
    const serverExists: any[] = await this.readTable('TADIR',
      [{ fieldName: 'OBJ_NAME' }],
      `PGMID EQ 'R3TR' AND OBJECT EQ 'INTF' AND OBJ_NAME EQ '${TRM_SERVER_INTF}'`);
    if (serverExists.length === 1) {
      Logger.log(`INTF ${TRM_SERVER_INTF} exists`, true);
      try {
        var installedPackagesBackend = await this.getInstalledPackagesBackend();
        if (!includeSoruces) {
          installedPackagesBackend = installedPackagesBackend.filter(o => !aSourceTrkorr.includes(o.transport.trkorr));
        }
        if (!includeLocals) {
          installedPackagesBackend = installedPackagesBackend.filter(o => o.registry !== LOCAL_RESERVED_KEYWORD);
        }
        for (const o of installedPackagesBackend) {
          const transport = o.transport.trkorr ? new Transport(o.transport.trkorr, null, o.transport.migration) : null;
          const manifest = Manifest.fromAbapXml(o.manifest);
          if (transport) {
            manifest.setLinkedTransport(transport);
          }
          const trmPackage = new TrmPackage(o.name, RegistryProvider.getRegistry(o.registry), manifest);
          if (transport) {
            trmPackage.setDevclass(await transport.getDevclass(o.tdevc));
          } else {
            if (o.tdevc.length === 1) {
              trmPackage.setDevclass(o.tdevc[0].devclass);
            }
          }
          trmPackages.push(trmPackage);
        }
        fromBackend = true;
      } catch (e) {
        trmPackages = [];
        Logger.error(e.toString(), true);
      }
    }
    if (fromBackend) {
      Logger.log(`Packages were fetched from backend`, true);
      return trmPackages;
    } else {
      Logger.log(`Packages weren't fetched from backend, continue`, true);
    }


    var packageTransports: {
      package: TrmPackage,
      transports: Transport[]
    }[] = [];
    Logger.log(`Ready to read installed packages`, true);
    Logger.log(`Source trkorr ${JSON.stringify(aSourceTrkorr)}`, true);
    var aSkipTrkorr = await this.getIgnoredTrkorr();
    Logger.log(`Ignored trkorr ${JSON.stringify(aSkipTrkorr)}`, true);
    var aMigrationTrkorr: components.ZTRM_TRKORR[];
    var aActualTrkorr: TRKORR[] = (await this.readTable('E071',
      [{ fieldName: 'TRKORR' }],
      `PGMID EQ '*' AND OBJECT EQ '${COMMENT_OBJ}'`
    )).map(o => o.trkorr);
    //because we're extracting from e071, there will be multiple records with the same trkorr
    //unique array
    aActualTrkorr = Array.from(new Set(aActualTrkorr));
    try {
      aMigrationTrkorr = (await this.readTable('ZTRM_E070',
        [{ fieldName: 'TRM_TROKRR' }]
      )).map(o => o.trmTrokrr);
    } catch (e) {
      aMigrationTrkorr = [];
    }
    var aTrkorr: {
      trkorr: string,
      migration: boolean
    }[] = aActualTrkorr.map(s => {
      return {
        trkorr: s,
        migration: false
      };
    }).concat(aMigrationTrkorr.map(s => {
      return {
        trkorr: s,
        migration: true
      }
    }));

    //for each transport, check it was installed and not created on the system
    //read tms of current system and with maxrc > 0 and impsing != X
    //if there's no match, ignore
    for (const sTrkorr of aTrkorr) {
      //check tms
      //don't check transports from source
      if (!aSourceTrkorr.includes(sTrkorr.trkorr)) {
        Logger.log(`${sTrkorr.trkorr} not from source`, true);
        var aTrkorrStatusCheck: any[];
        try {
          Logger.log(`Checking ${sTrkorr.trkorr} TMS import result`, true);
          if (!sTrkorr.migration) {
            aTrkorrStatusCheck = (await this.readTable('TMSBUFFER',
              [{ fieldName: 'TRKORR' }, { fieldName: 'MAXRC' }],
              //is the condition (IMPFLG EQ 't' OR IMPFLG EQ 'k') necessary?
              `SYSNAM EQ '${this.getSysname()}' AND TRKORR EQ '${sTrkorr.trkorr}' AND IMPSING NE 'X'`
            ));
          } else {
            aTrkorrStatusCheck = (await this.readTable('ZTRM_TMSBUFFER',
              [{ fieldName: 'TRKORR' }, { fieldName: 'MAXRC' }],
              //is the condition (IMPFLG EQ 't' OR IMPFLG EQ 'k') necessary?
              `SYSNAM EQ '${this.getSysname()}' AND TRM_TROKRR EQ '${sTrkorr.trkorr}' AND IMPSING NE 'X'`
            ));
          }
          aTrkorrStatusCheck = aTrkorrStatusCheck.filter(o => parseInt(o.maxrc) >= 0);
        } catch (e) {
          aTrkorrStatusCheck = [];
        }
        //might be imported multiple times, so do not check if lenght is 1
        if (aTrkorrStatusCheck.length === 0) {
          Logger.log(`Adding ${sTrkorr.trkorr} to skipped filter`, true);
          aSkipTrkorr.push(sTrkorr.trkorr);
        }
      }
    }

    //filter transports (manually ignored transports and not imported transports)
    aTrkorr = aTrkorr.filter(trkorr => !aSkipTrkorr.includes(trkorr.trkorr));
    Logger.log(`Final transports ${JSON.stringify(aTrkorr)}`, true);

    const transports: Transport[] = aTrkorr.map(trkorr => new Transport(trkorr.trkorr, null, trkorr.migration));
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
    //exclude trm-server and trm-rest (if installed) and add manually
    //this is to ensure the version is correct
    //say it was installed via trm, then pulled from abapgit, the version would refer to the old trm version
    Logger.log(`Excluding trm-server (adding it manually)`, true);
    try {
      const trmServerPackage = trmPackages.find(o => o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(RegistryProvider.getRegistry()));
      var generatedTrmServerPackage = await this.getTrmServerPackage();
      if (trmServerPackage && trmServerPackage.manifest) {
        Logger.log(`trm-server was found (it was imported via transport)`, true);
        if (trmServerPackage.manifest.get().version === generatedTrmServerPackage.manifest.get().version) {
          Logger.log(`trm-server imported is the one currenlty in use`, true);
          generatedTrmServerPackage.manifest = trmServerPackage.manifest;
        }
      }
      trmPackages = trmPackages.filter(o => !(o.packageName === TRM_SERVER_PACKAGE_NAME && o.compareRegistry(RegistryProvider.getRegistry())));
      trmPackages.push(generatedTrmServerPackage);
    } catch (e) {
      //trm-server is not installed
      Logger.warning(`${TRM_SERVER_PACKAGE_NAME} is not installed`, true);
    }
    Logger.log(`Excluding trm-rest (adding it manually)`, true);
    try {
      const trmRestPackage = trmPackages.find(o => o.packageName === TRM_REST_PACKAGE_NAME && o.compareRegistry(RegistryProvider.getRegistry()));
      var generatedTrmRestPackage = await this.getTrmRestPackage();
      if (trmRestPackage && trmRestPackage.manifest) {
        Logger.log(`trm-rest was found (it was imported via transport)`, true);
        if (trmRestPackage.manifest.get().version === generatedTrmRestPackage.manifest.get().version) {
          Logger.log(`trm-rest imported is the one currenlty in use`, true);
          generatedTrmRestPackage.manifest = trmRestPackage.manifest;
        }
      }
      trmPackages = trmPackages.filter(o => !(o.packageName === TRM_REST_PACKAGE_NAME && o.compareRegistry(RegistryProvider.getRegistry())));
      trmPackages.push(generatedTrmRestPackage);
    } catch (e) {
      //trm-server is not installed
      Logger.warning(`${TRM_SERVER_PACKAGE_NAME} is not installed`, true);
    }
    if (includeSoruces) {
      this._installedPackagesI = trmPackages;
    } else {
      this._installedPackages = trmPackages;
    }
    return trmPackages;
  }

  public async getDevclass(devclass: DEVCLASS): Promise<TDEVC> {
    const tdevc: TDEVC[] = await this.readTable('TDEVC',
      [{ fieldName: 'DEVCLASS' }, { fieldName: 'PARENTCL' }],
      `DEVCLASS EQ '${devclass.trim().toUpperCase()}'`
    );
    if (tdevc.length === 1) {
      return tdevc[0];
    }
  }

  public async getTransportTargets(): Promise<TMSCSYS[]> {
    //systyp might not be available in some releases?
    try {
      return await this.readTable('TMSCSYS',
        [{ fieldName: 'SYSNAM' }, { fieldName: 'SYSTXT' }, { fieldName: 'SYSTYP' }]
      );
    } catch (e) {
      return await this.readTable('TMSCSYS',
        [{ fieldName: 'SYSNAM' }, { fieldName: 'SYSTXT' }]
      );
    }
  }

  public async getSubpackages(devclass: DEVCLASS): Promise<TDEVC[]> {
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

  public async getDevclassObjects(devclass: DEVCLASS, includeSubpackages: boolean = true): Promise<TADIR[]> {
    var aTadir: TADIR[] = [];
    var aDevclass: DEVCLASS[] = [devclass];
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
    return await this.readTable('ZTRMVINSTALLDEVC',
      [{ fieldName: 'ORIGINAL_DEVCLASS' }, { fieldName: 'INSTALL_DEVCLASS' }],
      `PACKAGE_NAME EQ '${packageName}' AND PACKAGE_REGISTRY EQ '${registryEndpoint}'`
    );
  }

  public async setPackageSuperpackage(devclass: DEVCLASS, superpackage: DEVCLASS): Promise<void> {
    return await this.tdevcInterface(devclass, superpackage);
  }

  public async clearPackageSuperpackage(devclass: DEVCLASS): Promise<void> {
    return await this.tdevcInterface(devclass, null, true);
  }

  public async setPackageTransportLayer(devclass: DEVCLASS, devlayer: components.DEVLAYER): Promise<void> {
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

}