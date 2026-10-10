/** Shared connector selection for action runs and diagnostic tools. */
export function createSystemConnector(core: any, env: NodeJS.ProcessEnv = process.env): any {
    const kind = (env.SAP_CONNECTOR || 'REST').toUpperCase();
    if (!['REST', 'RFC', 'OPENRFC'].includes(kind)) {
        throw new Error(`Unknown SAP_CONNECTOR "${env.SAP_CONNECTOR}": expected REST, RFC or OpenRFC`);
    }
    const login = {
        user: env.SAP_USER, passwd: env.SAP_PASSWORD,
        lang: env.SAP_LANGUAGE || 'EN', client: env.SAP_CLIENT
    };
    if (kind === 'REST') {
        return new core.RESTSystemConnector({ endpoint: env.SAP_URL }, login);
    }
    for (const key of ['SAP_ASHOST', 'SAP_SYSNR', 'SAP_USER', 'SAP_PASSWORD', 'SAP_CLIENT']) {
        if (!env[key]) throw new Error(`${key} is required for SAP_CONNECTOR=${kind}`);
    }
    const connection = {
        ashost: env.SAP_ASHOST, sysnr: env.SAP_SYSNR, saprouter: env.SAP_SAPROUTER
    };
    return kind === 'RFC'
        ? new core.RFCSystemConnector(connection, login, env.SAP_RFC_TRACE_DIR, env.SAP_RFC_MODULES_PATH)
        : new core.OpenRFCSystemConnector(connection, login, env.SAP_RFC_TRACE_DIR);
}
