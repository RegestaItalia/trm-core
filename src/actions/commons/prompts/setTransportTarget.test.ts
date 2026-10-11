import { Inquirer, Logger } from 'trm-commons';
import { setTransportTarget } from './setTransportTarget';

describe('setTransportTarget', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);
    });

    test('returns an explicit target trimmed and uppercased', async () => {
        await expect(setTransportTarget(true, ['QAS', 'PRD'], ' qas ')).resolves.toBe('QAS');
    });

    test('rejects an explicit target that does not exist', async () => {
        await expect(setTransportTarget(true, ['QAS', 'PRD'], 'tst')).rejects.toThrow('Transport target TST does not exist.');
    });

    test('selects the only target without input', async () => {
        await expect(setTransportTarget(true, ['QAS'])).resolves.toBe('QAS');
    });

    test('returns the prompted target', async () => {
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ transportTarget: 'PRD' } as any);

        await expect(setTransportTarget(false, ['QAS', 'PRD'])).resolves.toBe('PRD');
    });

    test('rejects without targets or without input in non-interactive mode', async () => {
        await expect(setTransportTarget(true, [], 'QAS')).rejects.toThrow('No transport targets are available');
        await expect(setTransportTarget(true, ['QAS', 'PRD'])).rejects.toThrow('Transport target was not declared.');
    });
});
