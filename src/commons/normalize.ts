import * as objKeysNormalizer from "object-keys-normalizer";

export function normalize(arg: any, kind?: string) {
    if (Array.isArray(arg)) {
        return objKeysNormalizer.normalizeKeys(arg, kind || 'camel');
    } else {
        return objKeysNormalizer.normalizeKeys({ ...arg }, kind || 'camel');
    }
}