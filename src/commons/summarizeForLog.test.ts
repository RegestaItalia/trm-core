import { summarizeForLog, summarizeUrlForLog } from './summarizeForLog';

describe('summarizeForLog', () => {
    it('redacts download links and namespace repair licenses', () => {
        expect(summarizeForLog({
            download_link: 'https://trmregistry.com/download/abc',
            download_link_expiry: 1790258274241,
            manifest: { namespace: { ns: '/REG/', replicense: '15033274183157994901' } }
        })).toEqual({
            download_link: '[REDACTED]',
            download_link_expiry: 1790258274241,
            manifest: { namespace: { ns: '/REG/', replicense: '[REDACTED]' } }
        });
    });

    it('replaces binary values with byte counts', () => {
        expect(summarizeForLog({ FILE: Buffer.alloc(10) })).toEqual({ FILE: '<Buffer 10 bytes>' });
    });
});

describe('summarizeUrlForLog', () => {
    it('joins relative urls to the base url', () => {
        expect(summarizeUrlForLog('https://trmregistry.com/registry', '/package/x')).toBe('https://trmregistry.com/registry/package/x');
    });

    it('does not prepend the base url to absolute urls', () => {
        expect(summarizeUrlForLog('https://trmregistry.com/registry', 'https://trmregistry.com/registry/package/x')).toBe('https://trmregistry.com/registry/package/x');
    });

    it('redacts the path of absolute urls outside the base url', () => {
        expect(summarizeUrlForLog('https://trmregistry.com/registry', 'https://trmregistry.com/download/300d7828?sig=abc')).toBe('https://trmregistry.com/[REDACTED]');
    });

    it('handles a missing base url', () => {
        expect(summarizeUrlForLog(undefined, '/ping')).toBe('/ping');
    });
});
