import { formatSapMessage } from "./SapMessage";

describe('formatSapMessage', () => {
    test('numbered placeholder is not consumed by an earlier variable', () => {
        expect(formatSapMessage('TMS communication error with destination &4', {
            class: 'XT', no: '153', v1: ' Nome o password errati (ripetere il logon)', v4: 'TMSSUP@A4Q.DOMAIN_A4D'
        })).toBe('TMS communication error with destination TMSSUP@A4Q.DOMAIN_A4D');
    });

    test('numbered placeholders, also closed with &', () => {
        expect(formatSapMessage('Object &1& in &2 locked by &3', { class: 'X', no: '1', v1: 'ZCL_A', v2: 'ZPKG', v3: 'USER' }))
            .toBe('Object ZCL_A in ZPKG locked by USER');
    });

    test('positional placeholders are filled in order', () => {
        expect(formatSapMessage('& of & imported', { class: 'X', no: '1', v1: '3', v2: '5' })).toBe('3 of 5 imported');
    });

    test('missing variables leave no placeholder behind', () => {
        expect(formatSapMessage('Error &1 &2', { class: 'X', no: '1', v1: 'A' })).toBe('Error A');
        expect(formatSapMessage('Error & &', { class: 'X', no: '1' })).toBe('Error');
    });
});
