import { describeTpFailure, parseTpLog } from './TpLog';
import { TransportTmsError } from './TransportTmsError';

// tp output of a forward rejected by tp (RSX, tp 381.701.08)
const TP_SYNTAX_ERROR = [
    'This is tp version 381.701.08 (release 916) (Patch level:100)',
    'EXPORT:     tp export <TR>               export <TA>',
    '',
    'IMPORT:     tp import <TR>|ALL <SAPSID>  import <TA> into <SAPSID>',
    '',
    'For more information call tp with argument \'help\'',
    '',
    'tp returncode summary:',
    '',
    'TOOLS: Highest return code of single steps was: 0',
    'ERRORS: Highest tp internal error was: 0203',
    'tp finished with return code: 203',
    'meaning:',
    '  wrong syntax in tp call',
    'tp call duration was: 0.005817 sec'
];

const TP_TOOLS_ERROR = [
    'tp returncode summary:',
    '',
    'TOOLS: Highest return code of single steps was: 8',
    'ERRORS: Highest tp internal error was: 0000',
    'tp finished with return code: 8',
    'meaning:',
    '  A tool used by tp produced errors'
];

describe('parseTpLog', () => {
    test('reads the return code summary', () => {
        expect(parseTpLog(TP_SYNTAX_ERROR)).toEqual({
            returnCode: 203,
            meaning: 'wrong syntax in tp call',
            toolsReturnCode: 0,
            internalError: 203
        });
    });

    test('lines that are not tp output have no summary', () => {
        expect(parseTpLog(['Exception stack:', '  at METHOD FORWARD'])).toBeUndefined();
        expect(parseTpLog(undefined)).toBeUndefined();
    });
});

describe('describeTpFailure', () => {
    test('a tp internal error points to the tp call and the transport tool setup', () => {
        const message = describeTpFailure(parseTpLog(TP_SYNTAX_ERROR), 'RSX');
        expect(message).toContain('tp ended with return code 203 (wrong syntax in tp call)');
        expect(message).toContain('tp internal error');
        expect(message).toContain('not the transport content');
        expect(message).toContain('Overview > Systems > RSX > Check > Transport Tool');
    });

    test('a tool error points to the request content', () => {
        const message = describeTpFailure(parseTpLog(TP_TOOLS_ERROR), 'RSX');
        expect(message).toContain('transport tools (R3trans) failed on the request content with return code 8');
        expect(message).not.toContain('tp internal error');
    });
});

describe('TransportTmsError', () => {
    test('describes the tp failure carried by the client error', () => {
        const clientError = Object.assign(new Error('Transport control program tp ended with error code 0203'), { messageLog: TP_SYNTAX_ERROR });
        const error = new TransportTmsError('Forward', 'RSXK900072', 'RSX', clientError);
        expect(error.message).toMatch(/^Forward of transport RSXK900072 to RSX failed: tp ended with return code 203 \(wrong syntax in tp call\)\. This is a tp internal error/);
        expect(error.tp.internalError).toBe(203);
        expect(error.originalError).toBe(clientError);
    });

    test('without tp output keeps the original message', () => {
        const error = new TransportTmsError('Forward', 'RSXK900072', 'RSX', new Error('Connection lost'));
        expect(error.message).toBe('Forward of transport RSXK900072 to RSX failed: Connection lost');
        expect(error.tp).toBeUndefined();
    });
});
