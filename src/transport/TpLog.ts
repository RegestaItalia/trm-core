/** Return code summary that tp prints at the end of its output. */
export type TpLogSummary = {
    /** `tp finished with return code: N` */
    returnCode?: number,
    /** The text under `meaning:`, e.g. `wrong syntax in tp call`. */
    meaning?: string,
    /** `TOOLS: Highest return code of single steps was: N` (R3trans and the other tools called by tp). */
    toolsReturnCode?: number,
    /** `ERRORS: Highest tp internal error was: N` (0 when tp itself had no error). */
    internalError?: number
}

/**
 * Reads the return code summary from tp output lines.
 * Returns undefined when the lines aren't tp output.
 */
export function parseTpLog(lines: string[] | undefined): TpLogSummary | undefined {
    if (!Array.isArray(lines)) {
        return undefined;
    }
    const summary: TpLogSummary = {};
    for (var i = 0; i < lines.length; i++) {
        const line = `${lines[i] ?? ''}`.trim();
        var match: RegExpMatchArray | null;
        if ((match = line.match(/^tp finished with return code:\s*(\d+)/i))) {
            summary.returnCode = Number(match[1]);
        } else if ((match = line.match(/Highest return code of single steps was:\s*(\d+)/i))) {
            summary.toolsReturnCode = Number(match[1]);
        } else if ((match = line.match(/Highest tp internal error was:\s*(\d+)/i))) {
            summary.internalError = Number(match[1]);
        } else if (/^meaning:$/i.test(line) && summary.returnCode !== undefined && summary.meaning === undefined) {
            const meaning = lines.slice(i + 1).map(o => `${o ?? ''}`.trim()).find(o => o.length > 0);
            if (meaning) {
                summary.meaning = meaning;
            }
        }
    }
    if (summary.returnCode === undefined && summary.toolsReturnCode === undefined && summary.internalError === undefined) {
        return undefined;
    }
    return summary;
}

/**
 * Tells where a tp failure comes from: tp itself (its call or the transport tool setup of the system)
 * or the transport tools that ran on the request content.
 */
export function describeTpFailure(summary: TpLogSummary, system: string): string {
    const rc = summary.returnCode ?? summary.internalError;
    const result = `tp ended with return code ${rc}${summary.meaning ? ` (${summary.meaning})` : ''}`;
    if (summary.internalError) {
        const tools = summary.toolsReturnCode !== undefined ? ` (highest single step return code ${summary.toolsReturnCode})` : '';
        return `${result}. This is a tp internal error: tp stopped before the transport tools could process the request${tools}, ` +
            `so the cause is the tp call or the transport tool setup of ${system}, not the transport content. ` +
            `Check it in STMS: Overview > Systems > ${system} > Check > Transport Tool.`;
    }
    if (summary.toolsReturnCode !== undefined && summary.toolsReturnCode >= 8) {
        return `${result}. The transport tools (R3trans) failed on the request content with return code ${summary.toolsReturnCode}: check the import log in STMS.`;
    }
    return `${result}.`;
}
