/**
 * Descriptions (E07T AS4TEXT) of the transports TRM generates: `@X1@TRM [(<kind>) ]<package> <version>`,
 * at most 60 characters.
 *
 * The registry applies {@link deletionDescription} to every deletion transport it generates
 * (trm-backend-v2, transport surgeon `deletion_description`): a dummy named with it keeps its text
 * after the deletion transport is imported. Keep both implementations in sync.
 */

/** `D` package (DEVC), `L` translations, `BKP` backup, `DELE` deletion; none for objects and landscape transports. */
export type TrmTransportDescriptionKind = 'D' | 'L' | 'BKP' | 'DELE';

const TRM_DESCRIPTION = /^@X1@TRM (?:\(([A-Z]+)\) )?(.*)$/;
const MAX_DESCRIPTION_LENGTH = 60;

export function trmTransportDescription(packageName: string, version: string, kind?: TrmTransportDescriptionKind): string {
    return `@X1@TRM ${kind ? `(${kind}) ` : ''}${packageName} ${version}`.slice(0, MAX_DESCRIPTION_LENGTH);
}

/** Description of the deletion of a transport's content: its TRM kind becomes `DELE`; other descriptions are kept. */
export function deletionDescription(description: string): string {
    const match = TRM_DESCRIPTION.exec(description.trimEnd());
    if (!match) {
        return description;
    }
    return `@X1@TRM (DELE) ${match[2]}`.slice(0, MAX_DESCRIPTION_LENGTH);
}
