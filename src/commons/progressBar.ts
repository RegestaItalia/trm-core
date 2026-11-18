import { ILoggerMultibar, ILoggerProgressbar, Logger } from "trm-commons";

const BAR_SIZE = 30;
const BAR_COMPLETE = '█';
const BAR_INCOMPLETE = '░';
// payload key the bar is rendered into: the logger's own {bar} token draws "[====>---]"
const BAR_TOKEN = 'trmBar';

/**
 * Renders the bar of a progress at `value` of `total`.
 * `glue` is drawn where the completed part ends (e.g. the transport icon).
 */
export function renderProgressBar(value: number, total: number, glue: string = ''): string {
    const ratio = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
    const complete = Math.round(ratio * BAR_SIZE);
    return BAR_COMPLETE.repeat(complete) + glue + BAR_INCOMPLETE.repeat(BAR_SIZE - complete);
}

function barFormat(format: string): string {
    return format.replace(/\{bar\}/g, `{${BAR_TOKEN}}`);
}

function barPayload(value: number, total: number, glue: string, payload?: any): any {
    return { ...payload, [BAR_TOKEN]: renderProgressBar(value, total, glue) };
}

/** Draws the TRM bar into a logger bar, `total` being the one it was started with (if already started). */
function styledBar(bar: ILoggerProgressbar, glue: string, total: number = 0): ILoggerProgressbar {
    return {
        start(barTotal: number, value: number, payload?: any) {
            total = barTotal;
            bar.start(barTotal, value, barPayload(value, barTotal, glue, payload));
        },
        update(value: number, payload?: any) {
            bar.update(value, barPayload(value, total, glue, payload));
        },
        stop() {
            bar.stop();
        }
    };
}

/**
 * Creates a progress bar in the TRM style, the one every progress bar uses.
 *
 * `{bar}` in the format is where the bar is drawn; the other tokens ({percentage}, {value}, {total}, {eta})
 * and the payload keys work as in {@link Logger.progressbar}.
 * `glue` is drawn where the completed part ends (e.g. the transport icon).
 */
export function progressBar(format: string, glue: string = ''): ILoggerProgressbar {
    return styledBar(Logger.progressbar(barFormat(format), ''), glue);
}

/**
 * Creates a group of progress bars in the TRM style, drawn together: see {@link progressBar}.
 * The bars it creates are already started.
 */
export function multiProgressBar(format: string, glue: string = ''): ILoggerMultibar {
    const multibar = Logger.multibar(barFormat(format), '');
    return {
        create(total: number, startValue: number, payload?: any) {
            return styledBar(multibar.create(total, startValue, barPayload(startValue, total, glue, payload)), glue, total);
        },
        stop() {
            multibar.stop();
        }
    };
}
