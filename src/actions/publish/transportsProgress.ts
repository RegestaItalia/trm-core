import { ILoggerProgressbar, Logger } from "trm-commons";
import type { PublishWorkflowContext } from ".";
import { progressBar } from "../../commons";

/** The bar shown while the generate steps of the publish create the release transports. */
export type TransportsProgress = {
    bar: ILoggerProgressbar,
    total: number,
    done: number,
    stopped: boolean,
    /** Warnings printed once the bar is done: a message would break its line. */
    warnings: string[]
};

/** Transports the generate steps create: DEVC, TADIR, LANG and one for each new customizing transport. */
export function transportsToGenerate(context: PublishWorkflowContext): number {
    const publishData = context.rawInput.publishData || {};
    return 2
        + (publishData.noLanguageTransport ? 0 : 1)
        + (publishData.noCustomizingTransports ? 0 : (context.runtime.customizing?.new || []).length);
}

function stopTransportsProgress(progress: TransportsProgress): void {
    if (progress.stopped) {
        return;
    }
    progress.stopped = true;
    progress.bar.stop();
    progress.warnings.forEach(message => Logger.warning(message, { important: true }));
    progress.warnings = [];
}

/** Warns about a transport being generated: after the bar, if it's shown. */
export function transportsProgressWarning(context: PublishWorkflowContext, message: string): void {
    const progress = context.runtime.transportsProgress;
    if (progress && !progress.stopped) {
        progress.warnings.push(message);
    } else {
        Logger.warning(message, { important: true });
    }
}

/**
 * Generates one release transport with `generate`, counting it on the bar shared by the generate steps.
 * The first transport starts the bar; the last one, or a failure, stops it.
 */
export async function generateTransport<T>(context: PublishWorkflowContext, label: string, generate: () => Promise<T>): Promise<T> {
    if (!context.runtime.transportsProgress) {
        const total = transportsToGenerate(context);
        const bar = progressBar('Generating transports {bar} {value}/{total} {transport}');
        context.runtime.transportsProgress = { bar, total, done: 0, stopped: false, warnings: [] };
        bar.start(total, 0, { transport: label });
    }
    const progress = context.runtime.transportsProgress;
    if (progress.stopped) {
        // more transports than counted: generated without the bar
        return generate();
    }
    progress.bar.update(progress.done, { transport: label });
    let result: T;
    try {
        result = await generate();
    } catch (e) {
        stopTransportsProgress(progress);
        throw e;
    }
    progress.done++;
    progress.bar.update(progress.done, { transport: label });
    if (progress.done >= progress.total) {
        stopTransportsProgress(progress);
    }
    return result;
}

/** Stops the bar if a generate step is skipped, or creates fewer transports than counted. */
export function endTransportsProgress(context: PublishWorkflowContext): void {
    if (context.runtime.transportsProgress) {
        stopTransportsProgress(context.runtime.transportsProgress);
    }
}
