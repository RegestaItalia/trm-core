import { Logger } from "../logger";
import { Registry, RegistryType } from "../registry";
import * as semver from "semver";
import { TrmPackage } from "../trmPackage";
import { Manifest } from "../manifest";
import { installDependency } from "./installDependency";
import { Transport, TrmTransportIdentifier } from "../transport";
import { getPackageHierarchy, getPackageNamespace, normalize, parsePackageName } from "../commons";
import { R3trans } from "node-r3trans";
import { checkSapEntries } from "./checkSapEntries";
//import { checkDependencies } from "./checkDependencies";
import { createHash } from "crypto";
import { SystemConnector } from "../systemConnector";
import { TRKORR, TADIR, TDEVC, TDEVCT, ZTRM_INSTALLDEVC } from "../client";
import { Inquirer } from "../inquirer/Inquirer";
import { Question } from "../inquirer";

function _validateDevclass(input: string, packagesNamespace: string): string | true {
    const sInput: string = input.trim().toUpperCase();
    if (sInput.length > 30) {
        return `Package name must not exceede 30 characters limit.`;
    }
    if (packagesNamespace.startsWith('/')) {
        if (!sInput.startsWith(packagesNamespace)) {
            return `Package name must use namespace ${packagesNamespace}.`;
        } else {
            return true;
        }
    } else {
        return true;
    }

}

export async function install(data: {
    packageName: string,
    version?: string,
    forceInstall?: boolean,
    ignoreSapEntries?: boolean,
    skipDependencies?: boolean,
    skipLang?: boolean,
    importTimeout?: number,
    keepOriginalPackages?: boolean,
    packageReplacements?: { originalDevclass: string, installDevclass: string }[],
    skipWbTransport?: boolean,
    transportLayer?: string,
    targetSystem?: string,
    integrity?: string,
    safe?: boolean,
    ci?: boolean
}, registry: Registry) {
    const ignoreSapEntries = data.ignoreSapEntries ? true : false;
    const skipDependencies = data.skipDependencies ? true : false;
    const skipLang = data.skipLang ? true : false;
    const ci = data.ci ? true : false;
    const importTimeout = data.importTimeout || 180;
    const forceInstall = data.forceInstall ? true : false;
    const skipWbTransport = data.skipWbTransport ? true : false;
    const keepOriginalPackages = data.keepOriginalPackages ? true : false;
    const transportLayer = data.transportLayer;
    const targetSystem = data.targetSystem;
    const packageName = data.packageName.trim();
    const integrity = data.integrity;
    const safe = data.safe ? true : false;
    var version;
    if (!data.version || data.version.trim().toLowerCase() === 'latest') {
        version = 'latest';
    } else {
        version = semver.clean(data.version);
    }
    if (!version) {
        throw new Error(`Version not specified.`);
    }

    //check package name doesn't throw error
    parsePackageName({
        fullName: packageName
    });

    Logger.loading(`Reading system data...`);
    const installedPackages = await SystemConnector.getInstalledPackages(true);
    const oTrmPackage = new TrmPackage(packageName, registry, null);
    const oManifest = await oTrmPackage.fetchRemoteManifest(version);
    //Before installing, check if the same package, same version and same registry is already installed
    var alreadyInstalled = installedPackages.find(o => Manifest.compare(o.manifest, oManifest, true)) ? true : false;
    if(integrity){
        const installedIntegrity = await SystemConnector.getPackageIntegrity(oTrmPackage);
        alreadyInstalled = alreadyInstalled && installedIntegrity === integrity;
    }
    if (alreadyInstalled && !forceInstall) {
        Logger.info(`Package "${packageName}" already installed, skipping installation. Run with --force.`);
        return;
    }
    const manifest = oManifest.get();
    if (!ignoreSapEntries) {
        Logger.loading(`Checking system compatibility...`);
        const sapEntries = manifest.sapEntries || {};
        const oCheckSapEntries = {}; //await checkSapEntries(sapEntries);
        const missingSapEntries = []; //oCheckSapEntries.missingSapEntries;
        if (missingSapEntries.length > 0) {
            Logger.error(`Missing SAP table entries.`);
            Logger.error(`Please check the list below and, if necessary, check notes.`);
            missingSapEntries.forEach(o => {
                var tableHead = [];
                var tableData = [];
                o.entries.forEach(entry => {
                    var tableRow = [];
                    Object.keys(entry).forEach(field => {
                        if (!tableHead.includes(field)) {
                            tableHead.push(field);
                        }
                        const columnIndex = tableHead.findIndex(f => f === field);
                        tableRow[columnIndex] = entry[field];
                    });
                    for (var i = 0; i < tableRow.length; i++) {
                        if (!tableRow[i]) {
                            tableRow[i] = '';
                        }
                    }
                    tableData.push(tableRow);
                });
                Logger.error(` `);
                Logger.error(`Table ${o.table}:`);
                Logger.table(tableHead, tableData);
            });
            throw new Error(`There are a total of ${missingSapEntries.length} missing SAP table entries.`);
        }
    }

    Logger.loading(`Checking dependencies...`);
    const dependencies = manifest.dependencies || [];
    const dependencyCheck = {} as any; 
    /*await checkDependencies({
        dependencies,
        installedPackages
    });*/
    if(dependencyCheck.requiredDependenciesTab){
        Logger.info(`Package "${packageName}" has ${dependencyCheck.requiredDependenciesTab.data.length} dependencies.`);
        Logger.table(dependencyCheck.requiredDependenciesTab.head, dependencyCheck.requiredDependenciesTab.data);
    }
    if (!skipDependencies) {
        for (const dependency of dependencyCheck.missingDependencies) {
            //there might be the need of logging into the registry of the dependency
            //this needs an issue on github
            var oDependencyRegistry: Registry;
            if(registry.getRegistryType() === RegistryType.PUBLIC && !dependency.registry){
                oDependencyRegistry = registry;
            }else{
                oDependencyRegistry = new Registry(dependency.registry || 'public');
            }
            var continueInstall = true;
            if (!ci) {
                const inq1: any = await Inquirer.prompt({
                    type: 'confirm',
                    name: 'continueInstall',
                    default: true,
                    message: `To continue, package ${dependency.name} version ${dependency.version} has to be installed. Continue?`
                });
                continueInstall = inq1.continueInstall;
            }
            if(continueInstall){
                Logger.info(`Installing dependency ${dependency.name} version ${dependency.version}`);
                await installDependency({
                    packageName: dependency.name,
                    versionRange: dependency.version,
                    integrity: safe ? dependency.integrity : null,
                    originalInstallOptions: data,
                    installedPackages
                }, oDependencyRegistry);
            }
        }
    }

    Logger.info(`Ready to install "${packageName}".`);

    if (alreadyInstalled) {
        const alreadyInstalledPackage = installedPackages.find(o => Manifest.compare(o.manifest, oManifest, false));
        const alreadyInstalledManifest = alreadyInstalledPackage.manifest.get();
        //TODO this might be a blocking or atleast user input activity
        //not everything can be upgraded and downgraded without warning
        //dependencies, for example, might not be in ranges anymore
        if (semver.gt(manifest.version, alreadyInstalledManifest.version)) {
            Logger.info(`Upgrading "${packageName}", ${alreadyInstalledManifest.version} -> ${manifest.version}`);
        } else if (semver.lt(manifest.version, alreadyInstalledManifest.version)) {
            Logger.warning(`Downgrading "${packageName}", ${alreadyInstalledManifest.version} -> ${manifest.version}`);
        }
    }

    Logger.loading(`Getting transports...`);
    const oArtifact = await oTrmPackage.fetchRemoteArtifact(manifest.version);
    const fetchedIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
    if(integrity){
        if(integrity !== fetchedIntegrity){
            Logger.warning(`ATTENTION!! Integrity check failed on package ${manifest.name}, version ${manifest.version}.`);
            Logger.warning(`            Local:  ${integrity}`);
            Logger.warning(`            Remote: ${fetchedIntegrity}`);
            if(safe){
                Logger.warning(`            Install will continue.`);
            }else{
                throw new Error(`Package installation aborted due to integrity check failure and running in safe mode.`);
            }
        }
    }
    const aTransports = await oArtifact.getTransportBinaries();
    const r3trans = new R3trans();
    const r3transVersion = await r3trans.getVersion();
    Logger.info(r3transVersion);
    Logger.loading(`Reading transports...`);
    for (const transport of aTransports) {
        try {
            await r3trans.isTransportValid(transport.binaries.data);
        } catch (e) {
            throw new Error(`Package contains invalid transport.`);
        }
    }
    const aDevcTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.DEVC);
    const aTadirTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.TADIR);
    const aLangTransports = aTransports.filter(o => o.type === TrmTransportIdentifier.LANG);
    var wbObjects: {
        pgmid: string,
        object: string,
        objName: string
    }[] = [];
    var trCopy: TRKORR[] = [];
    if (aDevcTransports.length > 1) {
        throw new Error(`Unexpected declaration of devclass in package ${packageName}.`);
    } else {
        var packageReplacements: {
            originalDevclass: string,
            installDevclass: string
        }[] = [];
        //registry should have done this check already..
        //all tadir object must have the corresponding devc devclass object
        //also, check all objects in transport are recognized by the system
        Logger.loading(`Checking transport content...`);
        var aTadir: TADIR[] = [];
        for (const tadirTr of aTadirTransports) {
            aTadir = aTadir.concat(normalize(await r3trans.getTableEntries(tadirTr.binaries.data, 'TADIR')));
        }
        wbObjects = wbObjects.concat(aTadir.map(o => {
            return {
                pgmid: o.pgmid,
                object: o.object,
                objName: o.objName
            }
        }));
        const tdevc: TDEVC[] = normalize(await r3trans.getTableEntries(aDevcTransports[0].binaries.data, 'TDEVC'));
        const tdevct: TDEVCT[] = normalize(await r3trans.getTableEntries(aDevcTransports[0].binaries.data, 'TDEVCT'));
        const systemObjectList = await SystemConnector.getObjectsList();
        aTadir.forEach(o => {
            if (!tdevc.find(k => k.devclass === o.devclass)) {
                throw new Error(`Package includes objects without devclass.`);
            }
            if (!systemObjectList.find(k => k.pgmid === o.pgmid && k.object === o.object)) {
                throw new Error(`Transport contains unknown object type ${o.pgmid} ${o.object}.`);
            }
        });

        //build the package hierarchy
        const originalPackageHierarchy = getPackageHierarchy(tdevc);
        if (keepOriginalPackages) {
            packageReplacements = tdevc.map(o => {
                return {
                    originalDevclass: o.devclass,
                    installDevclass: o.devclass
                }
            });
        } else {
            if (data.packageReplacements && data.packageReplacements.length > 0) {
                packageReplacements = data.packageReplacements;
            } else {
                //get from the trm table devclass replacements the corresponding name
                packageReplacements = await SystemConnector.getInstallPackages(packageName, registry);
            }
        }
        var rootDevclass = packageReplacements.find(o => o.originalDevclass === originalPackageHierarchy.devclass)?.installDevclass;
        if (!rootDevclass) {
            rootDevclass = originalPackageHierarchy.devclass;
        }
        Logger.success(`Transport content ok.`);
        const packagesNamespace = getPackageNamespace(rootDevclass);
        var inq1Prompts: Question[] = [];
        tdevc.forEach(t => {
            const replacement = packageReplacements.find(o => o.originalDevclass === t.devclass);
            if (!replacement || forceInstall) {
                inq1Prompts.push({
                    type: "input",
                    name: t.devclass,
                    default: t.devclass,
                    message: `Input name for package ${t.devclass}`,
                    validate: (input) => {
                        return _validateDevclass(input, packagesNamespace);
                    }
                });
            } else {
                const devclassValid = _validateDevclass(replacement.installDevclass, packagesNamespace);
                if (devclassValid !== true) {
                    throw new Error(devclassValid);
                }
            }
        });
        if (inq1Prompts.length > 0) {
            const inq1 = await Inquirer.prompt(inq1Prompts);
            Object.keys(inq1).forEach(k => {
                //clear before pushing
                packageReplacements = packageReplacements.filter(o => o.originalDevclass !== k);
                packageReplacements.push({
                    originalDevclass: k,
                    installDevclass: inq1[k].trim().toUpperCase()
                });
            });
        }
        //update z table
        Logger.loading(`Updating install packages...`);
        var installDevc: ZTRM_INSTALLDEVC[] = [];
        packageReplacements.forEach(o => {
            installDevc.push({
                package_name: packageName,
                package_registry: registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : registry.endpoint,
                original_devclass: o.originalDevclass,
                install_devclass: o.installDevclass
            });
        });
        await SystemConnector.setInstallDevc(installDevc);

        Logger.loading(`Generating devclass...`);
        var pdevclass = transportLayer;
        const dlvunit = getPackageNamespace(packageReplacements[0].installDevclass) === '$' ? 'LOCAL' : 'HOME';
        for (const packageReplacement of packageReplacements) {
            const devclassExists = await SystemConnector.getDevclass(packageReplacement.installDevclass);
            const oDevcTadir = {
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: packageReplacement.installDevclass,
                devclass: packageReplacement.installDevclass
            };
            if (!devclassExists) {
                //generate
                if (!pdevclass) {
                    pdevclass = await SystemConnector.getDefaultTransportLayer();
                }
                const ctext = tdevct.find(o => o.devclass === packageReplacement.originalDevclass)?.ctext || `TRM ${packageName}`;
                await SystemConnector.createPackage({
                    devclass: packageReplacement.installDevclass,
                    as4user: SystemConnector.getLogonUser(),
                    ctext,
                    dlvunit,
                    pdevclass
                });
                /*if(dlvunit === 'HOME'){
                    wbObjects.push({
                        pgmid: 'LIMU',
                        object: 'ADIR',
                        objName: `R3TRDEVC${packageReplacement.installDevclass}`
                    });
                }*/
            }
            if(dlvunit !== 'LOCAL'){
                await SystemConnector.tadirInterface(oDevcTadir);
                aTadir.push(oDevcTadir);
            }
        }
        //build the new package hierarchy, based on the original
        const aDummyTdevc: TDEVC[] = [];
        for (const packageReplacement of packageReplacements) {
            const originalRoot = originalPackageHierarchy.devclass === packageReplacement.originalDevclass;
            aDummyTdevc.push({
                devclass: packageReplacement.installDevclass,
                parentcl: originalRoot ? '' : tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl
            });
        }
        const installPackageHierarchy = getPackageHierarchy(aDummyTdevc);
        //clear all parentcl, except for root
        for (const packageReplacement of packageReplacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            if (!installRoot) {
                await SystemConnector.clearPackageSuperpackage(packageReplacement.installDevclass);
            }
        }
        //add parentcl
        for (const packageReplacement of packageReplacements) {
            const installRoot = installPackageHierarchy.devclass === packageReplacement.installDevclass;
            const originalParentCl = tdevc.find(o => o.devclass === packageReplacement.originalDevclass).parentcl;
            if (originalParentCl) {
                const installParentCl = packageReplacements.find(o => o.originalDevclass === originalParentCl)?.installDevclass;
                if(installParentCl){
                    if (!installRoot) {
                        await SystemConnector.setPackageSuperpackage(packageReplacement.installDevclass, installParentCl);
                    }
                }
            }
        }
        Logger.success(`Devclass generated.`);

        //import tadir transports
        Logger.loading(`Importing transports...`);
        for (const tadirTr of aTadirTransports) {
            const oTransport = await Transport.upload({
                binary: tadirTr.binaries,
                trTarget: SystemConnector.getDest()
            });
            await oTransport.import(importTimeout);
        }
        Logger.success(`Transports imported.`);

        //for all tadir objects, run tadir interface with replacement devclass
        Logger.loading(`Finishing TADIR import...`);
        for (var tadir of aTadir) {
            const replacementDevclass = packageReplacements.find(o => o.originalDevclass === tadir.devclass).installDevclass;
            tadir.devclass = replacementDevclass;
            tadir.srcsystem = 'TRM';
            await SystemConnector.tadirInterface(tadir);
        }
        Logger.success(`TADIR import finished.`);
    }
    if(aLangTransports.length > 0){
        if(!skipLang){
            //import lang transports
            Logger.loading(`Importing transports...`);
            for (const langTransport of aLangTransports) {
                //const langEntries = normalize(await r3trans.getTableEntries(langTransport.binaries.data, 'E071'));
                trCopy.push(langTransport.trkorr);
                const oTransport = await Transport.upload({
                    binary: langTransport.binaries,
                    trTarget: SystemConnector.getDest()
                });
                await oTransport.import(importTimeout);
            }
            Logger.success(`Transports imported.`);
            Logger.success(`LANG import finished.`);
        }else{
            Logger.info(`Skipping language transports.`);
        }
    }

    Logger.loading(`Finalizing install...`);

    //set integrity
    await SystemConnector.setPackageIntegrity({
        package_name: manifest.name,
        package_registry: registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : registry.endpoint,
        integrity: fetchedIntegrity
    });

    var wbObjectsAdd: {
        pgmid: string,
        object: string,
        objName: string
    }[] = [];

    //for each transport object
    for (const wbObject of wbObjects) {
        //unless R3TR, add to new wb transport
        if (wbObject.pgmid === 'R3TR') {
            //if it's R3TR, get its devclass and check it's not $.
            //if it's not, add the object (as well as the devc)
            const objTadir = await SystemConnector.getObject(wbObject.pgmid, wbObject.object, wbObject.objName);
            const objPackageNs = getPackageNamespace(objTadir.devclass);
            if (objPackageNs !== '$') {
                wbObjectsAdd.push(objTadir);
                if (!wbObjectsAdd.find(o => o.pgmid === 'R3TR' && o.object === 'DEVC' && o.objName === objTadir.devclass)) {
                    wbObjectsAdd.push({
                        pgmid: 'R3TR',
                        object: 'DEVC',
                        objName: objTadir.devclass
                    });
                }
            }
        } else {
            wbObjectsAdd.push(wbObject);
        }
    }

    if ((wbObjectsAdd.length > 0 || trCopy.length > 0) && !skipWbTransport) {
        //if a non released trm request for this package is found, use it and rename
        var wbTransport = await SystemConnector.getPackageWorkbenchTransport(oTrmPackage);
        if (!wbTransport) {
            //if not, create a new workbench request
            wbTransport = await Transport.createWb({
                text: `TRM generated transport`, //temporary name
                target: targetSystem
            });
        }
        await wbTransport.addComment(`name=${manifest.name}`);
        await wbTransport.addComment(`version=${manifest.version}`);
        await wbTransport.setDocumentation(oManifest.getAbapXml());
        await wbTransport.rename(`@X1@TRM: ${manifest.name} v${manifest.version}`);

        //add objects and try to lock
        for (const wbObjectAdd of wbObjectsAdd) {
            try {
                try {
                    await wbTransport.addObjects([wbObjectAdd], true);
                } catch (e) {
                    await wbTransport.addObjects([wbObjectAdd], false);
                }
            } catch (e) {
                //object might be in transport already
                //TODO better handle this case
            }
        }
        for(const trFrom of trCopy){
            try{
                await wbTransport.addObjectsFromTransport(trFrom);
            }catch(e){
                //object might be in transport already
                //TODO better handle this case
            }
        }
        Logger.success(`Use ${wbTransport.trkorr} for transports.`);
    }

    Logger.success(`Install of package "${packageName}" finished.`);
}