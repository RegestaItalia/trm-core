jest.mock('../checkEngines', () => ({
    checkEngines: jest.fn()
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from 'trm-commons';
import { checkEngines as checkEnginesWkf } from '../checkEngines';
import { checkEngines } from './checkEngines';

const workflowMock = checkEnginesWkf as jest.Mock;

function context(engines: any = { components: { SAP_BASIS: true } }, noEngines = false) {
    return {
        rawInput: { installData: { checks: { noEngines } } },
        runtime: { package: { data: { manifest: { name: 'test', version: '1.0.0', engines } } } }
    } as any;
}

describe('install checkEngines step', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['log', 'loading', 'success', 'error'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
    });

    test('is skipped with noEngines or when the manifest has no engines', async () => {
        expect(await checkEngines.filter(context(null))).toBe(false);
        expect(await checkEngines.filter(context({ components: { SAP_BASIS: true } }, true))).toBe(false);
        expect(await checkEngines.filter(context())).toBe(true);
    });

    test('passes when all engines are satisfied', async () => {
        workflowMock.mockResolvedValue({ engines: {}, passed: true, results: [{ path: 'components.SAP_BASIS', requirement: 'installed', ok: true, required: true }] });
        await expect(checkEngines.run(context())).resolves.toBeUndefined();
        expect(workflowMock).toHaveBeenCalledWith(expect.objectContaining({ packageData: { manifest: expect.objectContaining({ name: 'test' }) } }));
    });

    test('aborts the install counting only required requirements', async () => {
        workflowMock.mockResolvedValue({
            engines: {},
            passed: false,
            results: [
                { path: 'components.SAP_BASIS', requirement: 'release >=758', actual: 'release 750, sp 1', ok: false, required: true },
                { path: 'anyOf', requirement: 'at least 1 of 2 alternatives', ok: false, required: true },
                { path: 'anyOf[0].components.UI_700', requirement: 'installed', ok: false, required: false },
                { path: 'tables[0]', requirement: 'SEOCOMPODF', ok: false, required: true, reason: 'Cannot read table' }
            ]
        });
        await expect(checkEngines.run(context())).rejects.toThrow('Install aborted. 3 engine requirements are not met!');
        expect(Logger.error).toHaveBeenCalledTimes(3);
    });

    test('runs before any system change (before lockResources)', () => {
        const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
        const workflow = /const installWorkflow = \[([\s\S]*?)\];/.exec(source)[1].split(',').map(s => s.trim()).filter(s => s);
        expect(workflow.indexOf('checkEngines')).toBeGreaterThan(-1);
        expect(workflow.indexOf('checkEngines')).toBeLessThan(workflow.indexOf('lockResources'));
        expect(workflow.indexOf('checkEngines')).toBeLessThan(workflow.indexOf('installDependencies'));
    });
});
