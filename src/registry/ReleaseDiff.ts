/**
 * Differences between two releases of a package, as computed by the registry
 * (`GET /diff/{package}?from=&to=`, report format `trm.transport-log-diff`).
 * Only the properties clients render are typed; unknown properties must be ignored.
 */

export type ReleaseDiffStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'indeterminate';
export type ReleaseDiffFidelity = 'exact' | 'rendered';

export interface ReleaseDiffHunkLine {
    kind: 'context' | 'delete' | 'add';
    oldLine: number | null;
    newLine: number | null;
    text: string;
}

export interface ReleaseDiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: ReleaseDiffHunkLine[];
}

export interface ReleaseDiffTableRow {
    status: 'added' | 'removed' | 'modified';
    key: Record<string, unknown> | null;
    count?: number;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    fields?: { field: string; before: unknown; after: unknown }[];
}

export interface ReleaseDiffEntry {
    id: string;
    objectId: string;
    /** `source`, `table`, `operations`, `selections`, `inventory`, `opaque` (others may be added). */
    kind: string;
    name: string;
    status: Exclude<ReleaseDiffStatus, 'unchanged'>;
    fidelity?: ReleaseDiffFidelity;
    hunks?: ReleaseDiffHunk[];
    rows?: ReleaseDiffTableRow[];
    keyMode?: 'primary-key' | 'multiset';
    added?: unknown[];
    removed?: unknown[];
    before?: unknown;
    after?: unknown;
    /** Present when the registry left the detail out because of its size. */
    omission?: { reason: string; detailBytes: number };
    changeSummary?: Record<string, unknown>;
}

export interface ReleaseDiffObject {
    id: string;
    pgmid?: string;
    type: string;
    name: string;
    status: ReleaseDiffStatus;
    entryIds: string[];
    fidelity?: ReleaseDiffFidelity;
}

export interface ReleaseDiffReport {
    format: 'trm.transport-log-diff';
    version: number;
    comparison?: { engineVersion?: number; detailPolicy?: { mode?: string; omittedEntries?: number }; [key: string]: unknown };
    before?: { coverage?: { completeLogs?: boolean }; [key: string]: unknown };
    after?: { coverage?: { completeLogs?: boolean }; [key: string]: unknown };
    summary: { objects: Partial<Record<ReleaseDiffStatus, number>>; entries?: Record<string, number>; changedEntries: number };
    objects: ReleaseDiffObject[];
    entries: ReleaseDiffEntry[];
}

export const RELEASE_DIFF_FORMAT = 'trm.transport-log-diff';
export const SUPPORTED_RELEASE_DIFF_VERSIONS = [1, 2];

/** Progress of a diff the registry is still computing. */
export interface ReleaseDiffProgress {
    step: number;
    steps: number;
    message?: string;
}

export interface ReleaseDiffOptions {
    /** Called on every progress update while the registry computes the diff. */
    onProgress?: (progress: ReleaseDiffProgress) => void;
    /** Give up waiting after this long (default 15 minutes). */
    timeoutMs?: number;
    /** First polling delay; defaults to the registry's Retry-After, else 3 seconds. Later polls back off. */
    pollIntervalMs?: number;
}

export function isReleaseDiffReport(value: unknown): value is ReleaseDiffReport {
    const report = value as ReleaseDiffReport;
    return !!report && typeof report === 'object' && report.format === RELEASE_DIFF_FORMAT
        && SUPPORTED_RELEASE_DIFF_VERSIONS.includes(report.version)
        && Array.isArray(report.objects) && Array.isArray(report.entries) && !!report.summary;
}
