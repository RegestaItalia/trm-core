import { Logger } from 'trm-commons';
import { multiProgressBar, progressBar, renderProgressBar } from './progressBar';

describe('progress bar', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('renders the completed share of the bar', () => {
        expect(renderProgressBar(0, 10)).toBe('░'.repeat(30));
        expect(renderProgressBar(5, 10)).toBe('█'.repeat(15) + '░'.repeat(15));
        expect(renderProgressBar(10, 10)).toBe('█'.repeat(30));
        // out of range values and an empty total stay within the bar
        expect(renderProgressBar(20, 10)).toBe('█'.repeat(30));
        expect(renderProgressBar(1, 0)).toBe('░'.repeat(30));
        // the glue marks where the completed part ends
        expect(renderProgressBar(5, 10, '⛟')).toBe('█'.repeat(15) + '⛟' + '░'.repeat(15));
    });

    test('draws the bar in place of the {bar} token, with no glue', () => {
        const bar = { start: jest.fn(), update: jest.fn(), stop: jest.fn() };
        const spy = jest.spyOn(Logger, 'progressbar').mockReturnValue(bar as any);

        const progress = progressBar('Checking {bar} {percentage}% {table}');
        progress.start(4, 0, { table: 'T1' });
        progress.update(2, { table: 'T2' });
        progress.stop();

        expect(spy).toHaveBeenCalledWith('Checking {trmBar} {percentage}% {table}', '');
        expect(bar.start).toHaveBeenCalledWith(4, 0, { table: 'T1', trmBar: renderProgressBar(0, 4) });
        expect(bar.update).toHaveBeenCalledWith(2, { table: 'T2', trmBar: renderProgressBar(2, 4) });
        expect(bar.stop).toHaveBeenCalledTimes(1);
    });

    test('bars of a group are drawn in the same style, with the glue', () => {
        const child = { start: jest.fn(), update: jest.fn(), stop: jest.fn() };
        const multibar = { create: jest.fn(() => child), stop: jest.fn() };
        const spy = jest.spyOn(Logger, 'multibar').mockReturnValue(multibar as any);

        const group = multiProgressBar('{stage} {bar} {result}', '⛟');
        const bar = group.create(100, 0, { stage: 'Export' });
        bar.update(40, { result: 'In progress' });
        group.stop();

        expect(spy).toHaveBeenCalledWith('{stage} {trmBar} {result}', '');
        expect(multibar.create).toHaveBeenCalledWith(100, 0, { stage: 'Export', trmBar: renderProgressBar(0, 100, '⛟') });
        expect(child.update).toHaveBeenCalledWith(40, { result: 'In progress', trmBar: renderProgressBar(40, 100, '⛟') });
        expect(multibar.stop).toHaveBeenCalledTimes(1);
    });
});
