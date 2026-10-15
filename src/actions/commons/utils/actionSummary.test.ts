jest.mock('../../../systemConnector', () => ({
    SystemConnector: { getDest: jest.fn(() => 'DEV') }
}));

import { Logger } from 'trm-commons';
import { logActionSummary } from './actionSummary';

describe('logActionSummary', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    test('lists imported transports, deletions, kept backups and the landscape transport', () => {
        const info = jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);

        logActionSummary({
            outcome: 'pkg 1.0.0 → 2.0.0 installed on DEV.',
            imported: [{ trkorr: 'DEVK1' }, undefined, { trkorr: 'DEVK2' }],
            deletions: [{ trkorr: 'DEVK3' }],
            landscape: { transport: { trkorr: 'DEVK4' }, targetSystem: 'QAS', releaseStarted: false },
            revert: { sapPackages: [], backup: { tadir: { transport: { trkorr: 'DEVK5' } as any, binaries: undefined } } }
        });

        expect(info).toHaveBeenCalledWith([
            'pkg 1.0.0 → 2.0.0 installed on DEV.',
            'Imported on DEV: DEVK1, DEVK2',
            'Deletions imported on DEV: DEVK3',
            'Backups kept in the DEV import queue for recovery: DEVK5',
            'Landscape transport DEVK4 to QAS (not released)'
        ].join('\n'));
    });

    test('a failed install still names the backups', () => {
        const info = jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);

        logActionSummary({ outcome: 'pkg 2.0.0 install failed, rolled back.', revert: { sapPackages: [], backup: { cust: { transport: { trkorr: 'DEVK6' } as any, binaries: undefined } } } });

        expect(info.mock.calls[0][0]).toContain('Backups kept in the DEV import queue for recovery: DEVK6');
    });
});
