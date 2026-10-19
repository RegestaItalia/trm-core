export type SapMessage = {
    class: string,
    no: string,
    v1?: string,
    v2?: string,
    v3?: string,
    v4?: string
}

/**
 * Fills the placeholders of a T100 message text with the message variables.
 *
 * A text uses either numbered placeholders (`&1`..`&4`, also written `&1&`) or positional ones
 * (`&`, filled in order). Positional filling only applies to texts without numbered placeholders:
 * otherwise a variable would consume the `&` of another placeholder (e.g. `&4` filled with v1, leaving `4`).
 */
export function formatSapMessage(text: string, data: SapMessage): string {
    const variables = [data.v1, data.v2, data.v3, data.v4].map(value => (value || '').trim());
    let msg = text;
    if (/&[1-4]/.test(msg)) {
        msg = msg.replace(/&([1-4])&?/g, (_, index: string) => variables[Number(index) - 1]);
    } else {
        let position = 0;
        msg = msg.replace(/&/g, () => position < variables.length ? variables[position++] : '');
    }
    msg = msg.replace(/&\d*/g, '');
    return msg.replace(/\s{2,}/g, ' ').trim();
}
