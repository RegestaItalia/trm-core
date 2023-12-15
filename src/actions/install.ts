import { Inquirer, Question } from "../inquirer";
import { Logger } from "../logger";
import { Registry, RegistryType } from "../registry";
import * as semver from "semver";
import { SystemConnector } from "../systemConnector";
import { TrmPackage } from "../trmPackage";
import { Manifest } from "../manifest";
import { installDependency } from "./installDependency";
import { Transport, TrmTransportIdentifier } from "../transport";
import { getPackageHierarchy, getPackageNamespace, normalize, parsePackageName } from "../commons";
import { R3trans } from "node-r3trans";
import { TADIR, TDEVC, TDEVCT, TRKORR, ZTRM_INSTALLDEVC } from "../rfc";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { createHash } from "crypto";

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
    ci?: boolean
}, inquirer: Inquirer, system: SystemConnector, registry: Registry, logger: Logger) {
    const ignoreSapEntries = data.ignoreSapEntries ? true : false;
    const skipDependencies = data.skipDependencies ? true : false;
    const skipLang = data.skipLang ? true : false;
    const ci = data.ci ? true : false;
    const importTimeout = data.importTimeout || 180;
    const forceInstall = data.forceInstall || ci ? true : false;
    const skipWbTransport = data.skipWbTransport ? true : false;
    const keepOriginalPackages = data.keepOriginalPackages ? true : false;
    const transportLayer = data.transportLayer;
    const targetSystem = data.targetSystem;
    const packageName = data.packageName.trim();
    const integrity = data.integrity;
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

    logger.loading(`Reading system data...`);
    const installedPackages = await system.getInstalledPackages();
    const oTrmPackage = new TrmPackage(packageName, registry, null, logger);
    const oManifest = await oTrmPackage.fetchRemoteManifest(version);
    //Before installing, check if the same package, same version and same registry is already installed
    var alreadyInstalled = installedPackages.find(o => Manifest.compare(o.manifest, oManifest, true)) ? true : false;
    if(integrity){
        const installedIntegrity = await system.getPackageIntegrity(oTrmPackage);
        alreadyInstalled = alreadyInstalled && installedIntegrity === integrity;
    }
    if (alreadyInstalled && !forceInstall) {
        logger.info(`Package "${packageName}" already installed, skipping installation. Run with --force.`);
        return;
    }
    const manifest = oManifest.get();
    if (!ignoreSapEntries) {
        logger.loading(`Checking system compatibility...`);
        const sapEntries = manifest.sapEntries || {};
        const oCheckSapEntries = await checkSapEntries(sapEntries, system);
        const missingSapEntries = oCheckSapEntries.missingSapEntries;
        if (missingSapEntries.length > 0) {
            logger.error(`Missing SAP table entries.`);
            logger.error(`Please check the list below and, if necessary, check notes.`);
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
                logger.error(` `);
                logger.error(`Table ${o.table}:`);
                logger.table(tableHead, tableData);
            });
            throw new Error(`There are a total of ${missingSapEntries.length} missing SAP table entries.`);
        }
    }

    logger.loading(`Checking dependencies...`);
    const dependencies = manifest.dependencies || [];
    const dependencyCheck = await checkDependencies({
        dependencies,
        installedPackages
    }, system);
    if(dependencyCheck.requiredDependenciesTab){
        logger.info(`Package "${packageName}" has ${dependencyCheck.requiredDependenciesTab.data.length} dependencies.`);
        logger.table(dependencyCheck.requiredDependenciesTab.head, dependencyCheck.requiredDependenciesTab.data);
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
                const inq1: any = await inquirer.prompt({
                    type: 'confirm',
                    name: 'continueInstall',
                    default: true,
                    message: `To continue, package ${dependency.name} version ${dependency.version} has to be installed. Continue?`
                });
                continueInstall = inq1.continueInstall;
            }
            if(continueInstall){
                logger.info(`Installing dependency ${dependency.name} version ${dependency.version}`);
                await installDependency({
                    packageName: dependency.name,
                    versionRange: dependency.version,
                    integrity: dependency.integrity,
                    originalInstallOptions: data,
                    installedPackages
                }, inquirer, system, oDependencyRegistry, logger);
            }
        }
    }

    logger.info(`Ready to install "${packageName}".`);

    if (alreadyInstalled) {
        const alreadyInstalledPackage = installedPackages.find(o => Manifest.compare(o.manifest, oManifest, false));
        const alreadyInstalledManifest = alreadyInstalledPackage.manifest.get();
        //TODO this might be a blocking or atleast user input activity
        //not everything can be upgraded and downgraded without warning
        //dependencies, for example, might not be in ranges anymore
        if (semver.gt(manifest.version, alreadyInstalledManifest.version)) {
            logger.info(`Upgrading "${packageName}", ${alreadyInstalledManifest.version} -> ${manifest.version}`);
        } else if (semver.lt(manifest.version, alreadyInstalledManifest.version)) {
            logger.warning(`Downgrading "${packageName}", ${alreadyInstalledManifest.version} -> ${manifest.version}`);
        }
    }

    logger.loading(`Getting transports...`);
    const oArtifact = await oTrmPackage.fetchRemoteArtifact(manifest.version);
    const fetchedIntegrity = createHash("sha512").update(oArtifact.binary).digest("hex");
    if(integrity){
        if(integrity !== fetchedIntegrity){
            logger.warning(`ATTENTION!! Integrity check failed on package ${manifest.name}, version ${manifest.version}.`);
            logger.warning(`            Local:  ${integrity}`);
            logger.warning(`            Remote: ${fetchedIntegrity}`);
            logger.warning(`            This package MIGHT BE COMPROMISED.`);
            throw new Error(`Package installation aborted due to integrity check failure.`);
        }
    }
    const aTransports = await oArtifact.getTransportBinaries();
    const r3trans = new R3trans();
    const r3transVersion = await r3trans.getVersion();
    logger.info(r3transVersion);
    logger.loading(`Reading transports...`);
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
        logger.loading(`Checking transport content...`);
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
        const systemObjectList = await system.rfcClient.getObjectsList();
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
                packageReplacements = await system.getInstallPackages(packageName, registry);
            }
        }
        var rootDevclass = packageReplacements.find(o => o.originalDevclass === originalPackageHierarchy.devclass)?.installDevclass;
        if (!rootDevclass) {
            rootDevclass = originalPackageHierarchy.devclass;
        }
        logger.success(`Transport content ok.`);
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
            const inq1 = await inquirer.prompt(inq1Prompts);
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
        logger.loading(`Updating install packages...`);
        var installDevc: ZTRM_INSTALLDEVC[] = [];
        packageReplacements.forEach(o => {
            installDevc.push({
                package_name: packageName,
                package_registry: registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : registry.endpoint,
                original_devclass: o.originalDevclass,
                install_devclass: o.installDevclass
            });
        });
        await system.rfcClient.setInstallDevc(installDevc);

        logger.loading(`Generating devclass...`);
        var pdevclass = transportLayer;
        const dlvunit = getPackageNamespace(packageReplacements[0].installDevclass) === '$' ? 'LOCAL' : 'HOME';
        for (const packageReplacement of packageReplacements) {
            const devclassExists = await system.getDevclass(packageReplacement.installDevclass);
            const oDevcTadir = {
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: packageReplacement.installDevclass,
                devclass: packageReplacement.installDevclass
            };
            if (!devclassExists) {
                //generate
                if (!pdevclass) {
                    pdevclass = await system.rfcClient.getDefaultTransportLayer();
                }
                const ctext = tdevct.find(o => o.devclass === packageReplacement.originalDevclass)?.ctext || `TRM ${packageName}`;
                await system.rfcClient.createPackage({
                    devclass: packageReplacement.installDevclass,
                    as4user: system.getLogonUser(),
                    ctext,
                    dlvunit,
                    pdevclass
                });
                if(dlvunit === 'HOME'){
                    /*wbObjects.push({
                        pgmid: 'LIMU',
                        object: 'ADIR',
                        objName: `R3TRDEVC${packageReplacement.installDevclass}`
                    });*/
                }
            }
            await system.rfcClient.tadirInterface(oDevcTadir);
            aTadir.push(oDevcTadir);
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
                await system.clearPackageSuperpackage(packageReplacement.installDevclass);
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
                        await system.setPackageSuperpackage(packageReplacement.installDevclass, installParentCl);
                    }
                }
            }
        }
        logger.success(`Devclass generated.`);

        //import tadir transports
        logger.loading(`Importing transports...`);
        for (const tadirTr of aTadirTransports) {
            const oTransport = await Transport.upload({
                binary: tadirTr.binaries,
                systemConnector: system,
                trTarget: system.getDest()
            }, true, logger);
            await oTransport.import(false, importTimeout);
        }
        logger.success(`Transports imported.`);

        //for all tadir objects, run tadir interface with replacement devclass
        logger.loading(`Finishing TADIR import...`);
        for (var tadir of aTadir) {
            const replacementDevclass = packageReplacements.find(o => o.originalDevclass === tadir.devclass).installDevclass;
            tadir.devclass = replacementDevclass;
            tadir.srcsystem = 'TRM';
            await system.rfcClient.tadirInterface(tadir);
        }
        logger.success(`TADIR import finished.`);
    }
    if(aLangTransports.length > 0){
        if(!skipLang){
            //import lang transports
            logger.loading(`Importing transports...`);
            for (const langTransport of aLangTransports) {
                //const langEntries = normalize(await r3trans.getTableEntries(langTransport.binaries.data, 'E071'));
                trCopy.push(langTransport.trkorr);
                const oTransport = await Transport.upload({
                    binary: langTransport.binaries,
                    systemConnector: system,
                    trTarget: system.getDest()
                }, true, logger);
                await oTransport.import(false, importTimeout);
            }
            logger.success(`Transports imported.`);
            logger.success(`LANG import finished.`);
        }else{
            logger.info(`Skipping language transports.`);
        }
    }

    logger.loading(`Finalizing install...`);

    //set integrity
    await system.rfcClient.setPackageIntegrity({
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
            const objTadir = await system.getObject(wbObject.pgmid, wbObject.object, wbObject.objName);
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
        var wbTransport = await system.getPackageWorkbenchTransport(oTrmPackage);
        if (!wbTransport) {
            //if not, create a new workbench request
            wbTransport = await Transport.createWb({
                text: `TRM generated transport`, //temporary name
                target: targetSystem
            }, system, true, logger);
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
        logger.success(`Use ${wbTransport.trkorr} for transports.`);
    }

    logger.success(`Install of package "${packageName}" finished.`);
}