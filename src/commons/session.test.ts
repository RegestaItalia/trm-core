describe('session ID', () => {
    beforeEach(() => jest.resetModules());

    test('is generated once per process', () => {
        const { getSessionId } = require('./session');
        const id = getSessionId();
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(getSessionId()).toBe(id);
    });

    test('is the one of a log file logger that generated its own', () => {
        const commons = require('trm-commons');
        const logger = Object.create(commons.CliLogFileLogger.prototype);
        logger.getSessionId = () => 'from-logger';
        const previous = commons.Logger.logger;
        commons.Logger.logger = logger;
        try {
            const { getSessionId } = require('./session');
            expect(getSessionId()).toBe('from-logger');
        } finally {
            commons.Logger.logger = previous;
        }
    });

    test('can be set by the host application, up to 36 characters', () => {
        const { getSessionId, setSessionId } = require('./session');
        setSessionId('host-session');
        expect(getSessionId()).toBe('host-session');
        expect(() => setSessionId('x'.repeat(37))).toThrow('exceeds 36 characters');
        expect(() => setSessionId(' ')).toThrow('Invalid session ID');
    });
});
