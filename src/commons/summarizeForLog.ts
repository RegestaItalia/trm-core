const MAX_LOG_DEPTH = 4;
const MAX_LOG_ARRAY_ITEMS = 20;
const MAX_LOG_OBJECT_KEYS = 30;
const MAX_LOG_STRING_LENGTH = 500;

function isSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    return [
        "auth",
        "authentication",
        "authorization",
        "cookie",
        "cookies",
        "credential",
        "credentials",
        "password",
        "passwd",
        "apikey",
        "privatekey",
        "downloadlink",
        "replicense"
    ].includes(normalized) || normalized.endsWith("secret") || normalized.endsWith("token");
}

/**
 * Formats a request URL for diagnostic logging.
 *
 * Relative URLs are resolved against the base URL. Absolute URLs outside the base URL (such as
 * signed download links) only keep their origin, since their path and query may grant access.
 *
 * @param baseURL Base URL of the client, if any.
 * @param url Request URL.
 * @returns A log-safe URL.
 */
export function summarizeUrlForLog(baseURL: string | undefined, url: string | undefined): string {
    const sUrl = url || "";
    if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(sUrl)) {
        return `${baseURL || ""}${sUrl}`;
    }
    if (baseURL && sUrl.startsWith(baseURL)) {
        return sUrl;
    }
    try {
        return `${new URL(sUrl).origin}/[REDACTED]`;
    } catch {
        return "[REDACTED]";
    }
}

/**
 * Creates a bounded, serialization-safe value for diagnostic logging.
 *
 * Sensitive fields are redacted, binary values are replaced with byte counts, non-plain class
 * instances are represented by their type, circular references are marked, and large/deep values
 * are truncated. The input value is never mutated.
 *
 * @param value Value to summarize.
 * @returns A log-safe structure containing only primitives, arrays, and plain objects.
 */
export function summarizeForLog(value: any): any {
    return summarizeValue(value, 0, new WeakSet<object>());
}

function summarizeValue(value: any, depth: number, seen: WeakSet<object>): any {
    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value.length <= MAX_LOG_STRING_LENGTH
            ? value
            : `${value.slice(0, MAX_LOG_STRING_LENGTH)}… (${value.length} characters)`;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "symbol" || typeof value === "function") {
        return `[${typeof value}]`;
    }
    if (Buffer.isBuffer(value)) {
        return `<Buffer ${value.length} bytes>`;
    }
    if (ArrayBuffer.isView(value)) {
        return `<${value.constructor?.name || "TypedArray"} ${value.byteLength} bytes>`;
    }
    if (value instanceof ArrayBuffer) {
        return `<ArrayBuffer ${value.byteLength} bytes>`;
    }
    if (seen.has(value)) {
        return "[Circular]";
    }

    const typeName = value.constructor?.name || "Object";
    if (depth >= MAX_LOG_DEPTH) {
        return `[${typeName}]`;
    }

    seen.add(value);
    if (Array.isArray(value)) {
        const summary = value.slice(0, MAX_LOG_ARRAY_ITEMS).map(item => summarizeValue(item, depth + 1, seen));
        if (value.length > MAX_LOG_ARRAY_ITEMS) {
            summary.push(`… ${value.length - MAX_LOG_ARRAY_ITEMS} more items`);
        }
        return summary;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return `[${typeName}]`;
    }

    const entries = Object.entries(value);
    const summary: Record<string, any> = {};
    entries.slice(0, MAX_LOG_OBJECT_KEYS).forEach(([key, entryValue]) => {
        summary[key] = isSensitiveKey(key)
            ? "[REDACTED]"
            : summarizeValue(entryValue, depth + 1, seen);
    });
    if (entries.length > MAX_LOG_OBJECT_KEYS) {
        summary["…"] = `${entries.length - MAX_LOG_OBJECT_KEYS} more keys`;
    }
    return summary;
}
