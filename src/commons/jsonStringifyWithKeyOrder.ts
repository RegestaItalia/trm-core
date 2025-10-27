export function jsonStringifyWithKeyOrder<T extends object>(
    obj: T,
    order: readonly (keyof T & string)[],
    space: number = 2
): string {
    const out: Record<string, unknown> = {};
    const seen = new Set<string>(order as readonly string[]);

    for (const key of order) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && (obj as any)[key] !== undefined) {
            (out as any)[key] = (obj as any)[key];
        }
    }

    for (const key of Object.keys(obj) as (keyof T & string)[]) {
        if (!seen.has(key) && (obj as any)[key] !== undefined) {
            (out as any)[key] = (obj as any)[key];
        }
    }

    return JSON.stringify(out, null, space);
}