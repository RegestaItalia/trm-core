import type { ActionLogTransportRole } from "../client/struct/ActionLog";

const IDENTIFIER_ROLES: Record<string, ActionLogTransportRole> = {
    DEVC: 'DEVC',
    TADIR: 'TADIR',
    LANG: 'LANG',
    CUST: 'CUST'
};

const KIND_ROLES: Record<string, ActionLogTransportRole> = {
    D: 'DEVC',
    L: 'LANG',
    BKP: 'BKP',
    DELE: 'DELE'
};

/**
 * Role of a transport TRM creates: its TRM identifier, otherwise the kind in its description
 * (`@X1@TRM (<kind>) ...`). A workbench transport with a TRM description and no kind is a landscape transport.
 */
export function transportRole(data: { trmIdentifier?: string, text?: string, workbench?: boolean }): ActionLogTransportRole | undefined {
    if (data.trmIdentifier && IDENTIFIER_ROLES[data.trmIdentifier]) {
        return IDENTIFIER_ROLES[data.trmIdentifier];
    }
    const match = /^@X1@TRM (?:\(([A-Z]+)\) )?/.exec(data.text || '');
    if (!match) {
        return undefined;
    }
    if (match[1]) {
        return KIND_ROLES[match[1]];
    }
    return data.workbench ? 'LAND' : undefined;
}
