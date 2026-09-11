import { Inquirer, Logger } from "trm-commons";

/**
 * Runs `fn` with a nested Logger/Inquirer prefix (chained onto whatever prefix was
 * already active, if any), restoring the original prefix afterwards - even on error.
 */
export async function withScopedPrefix<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
    const originalLPrefix = Logger.getPrefix();
    const originalIPrefix = Inquirer.getPrefix();
    Logger.setPrefix(originalLPrefix ? `${originalLPrefix}-> ${prefix}` : prefix);
    Inquirer.setPrefix(originalIPrefix ? `${originalIPrefix}-> ${prefix}` : prefix);
    try {
        return await fn();
    } finally {
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);
    }
}
