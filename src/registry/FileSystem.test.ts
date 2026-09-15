import * as AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TrmArtifact, TRANSPORT_INDEX_FILE } from '../trmPackage';
import { TrmTransportIdentifier } from '../transport';
import { FileSystem } from './FileSystem';

const entries = (name: string) => ({
    e071: [{ pgmid: 'R3TR', object: name === 'DEVC' ? 'DEVC' : 'PROG', objName: `Z${name}` }],
    tdevc: name === 'DEVC' ? [{ devclass: 'ZDEVC', parentcl: '', tpclass: '', dlvunit: '' }] : [],
    tdevct: name === 'DEVC' ? [{ devclass: 'ZDEVC', spras: 'E', ctext: 'Package' }] : [],
    tadir: [{ pgmid: 'R3TR', object: 'PROG', objName: `Z${name}`, devclass: 'ZDEVC' }]
});

function transport(type: TrmTransportIdentifier, index: number) {
    const trkorr = `DEVK90000${index}`;
    return {
        trkorr,
        trmIdentifier: type,
        download: jest.fn(async () => ({
            binaries: { header: Buffer.from(`header-${type}`), data: Buffer.from(`data-${type}`) },
            filenames: { header: `K90000${index}.DEV`, data: `R90000${index}.DEV` }
        })),
        getEntries: jest.fn(async () => entries(type)),
        getDescription: jest.fn(async () => `${type} description`)
    } as any;
}

function manifest() {
    const value: any = { name: 'offline', version: '1.0.0', distFolder: undefined, sapEntries: {} };
    return {
        setDistFolder: (folder: string) => { value.distFolder = folder; },
        get: () => value,
        getJSON: () => JSON.stringify(value)
    } as any;
}

describe('FileSystem embedded transports', () => {
    let directory: string;
    let file: string;
    let binary: Buffer;

    beforeEach(async () => {
        directory = mkdtempSync(join(tmpdir(), 'trm-fs-'));
        file = join(directory, 'package.trm');
        const transports = Object.values(TrmTransportIdentifier).map((type, index) => transport(type, index + 1));
        binary = (await TrmArtifact.create({ transports, manifest: manifest() })).binary;
        writeFileSync(file, binary);
    });

    afterEach(() => rmSync(directory, { recursive: true, force: true }));

    test('reads indexed metadata, every transport type, and the artifact checksum', async () => {
        const registry = new FileSystem(file);
        const pkg = await registry.getPackage('offline', '1.0.0');

        expect(pkg.transports.map(item => item.type)).toEqual(Object.values(TrmTransportIdentifier));
        expect(pkg.transports.map(item => item.description)).toEqual(Object.values(TrmTransportIdentifier).map(type => `${type} description`));
        expect(pkg.checksum).toBe(createHash('sha512').update(binary).digest('base64'));
        for (const item of pkg.transports) {
            await expect(registry.transportEntries('offline', '1.0.0', item.trkorr)).resolves.toMatchObject({ e071: expect.any(Array) });
        }
    });

    test('discovers LANG and CUST offline from the embedded index', async () => {
        const transports = (await new FileSystem(file).getPackage('offline', '1.0.0')).transports;
        expect(transports.some(item => item.type === 'LANG')).toBe(true);
        expect(transports.some(item => item.type === 'CUST')).toBe(true);
    });

    test('rejects unknown transport identifiers', async () => {
        await expect(new FileSystem(file).transportEntries('offline', '1.0.0', 'UNKNOWN')).rejects.toThrow('was not found');
    });

    test.each([
        ['missing index', (zip: AdmZip) => zip.deleteFile(TRANSPORT_INDEX_FILE)],
        ['empty index', (zip: AdmZip) => zip.updateFile(TRANSPORT_INDEX_FILE, Buffer.from('{}'))],
        ['malformed index', (zip: AdmZip) => zip.updateFile(TRANSPORT_INDEX_FILE, Buffer.from('{'))],
        ['duplicate identifier', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            index.push(index[0]);
            zip.updateFile(TRANSPORT_INDEX_FILE, Buffer.from(JSON.stringify(index)));
        }],
        ['mismatched identifier', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            index[0].trkorr = 'DEVK999999';
            zip.updateFile(TRANSPORT_INDEX_FILE, Buffer.from(JSON.stringify(index)));
        }],
        ['missing per-transport JSON', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            const packed = new AdmZip.default(zip.getEntry(`dist/${index[0].trkorr}`).getData());
            packed.deleteFile(`${index[0].trkorr}.JSON`);
            zip.updateFile(`dist/${index[0].trkorr}`, packed.toBuffer());
        }],
        ['placeholder entries', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            const packed = new AdmZip.default(zip.getEntry(`dist/${index[0].trkorr}`).getData());
            packed.updateFile(`${index[0].trkorr}.JSON`, Buffer.from('{}'));
            zip.updateFile(`dist/${index[0].trkorr}`, packed.toBuffer());
        }],
        ['malformed entries', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            const packed = new AdmZip.default(zip.getEntry(`dist/${index[0].trkorr}`).getData());
            packed.updateFile(`${index[0].trkorr}.JSON`, Buffer.from('{'));
            zip.updateFile(`dist/${index[0].trkorr}`, packed.toBuffer());
        }],
        ['corrupt packed transport', (zip: AdmZip) => {
            const index = JSON.parse(zip.readAsText(TRANSPORT_INDEX_FILE));
            zip.updateFile(`dist/${index[0].trkorr}`, Buffer.from('not a zip'));
        }]
    ])('rejects %s before exposing package metadata', async (_name, mutate) => {
        const zip = new AdmZip.default(binary);
        mutate(zip);
        writeFileSync(file, zip.toBuffer());
        await expect(new FileSystem(file).getPackage('offline', '1.0.0')).rejects.toThrow(/republish|couldn't read package/i);
    });
});
