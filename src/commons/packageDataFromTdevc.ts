import { SCOMPKDTLN, TDEVC } from "../client";

type PackageCreationOverrides = Pick<
    SCOMPKDTLN,
    "devclass" | "ctext" | "as4user" | "dlvunit" | "pdevclass"
>;

/**
 * Convert the writable package attributes carried by a transported TDEVC row
 * to the structure accepted by /ATRM/CREATE_PACKAGE.
 *
 * Target-owned routing and identity fields are supplied as overrides. Parentcl
 * is intentionally omitted: the install workflow rebuilds the renamed package
 * hierarchy only after every package exists.
 */
export function packageDataFromTdevc(
    source: TDEVC,
    overrides: PackageCreationOverrides
): SCOMPKDTLN {
    const result: SCOMPKDTLN = { ...overrides };
    const copy = <K extends keyof SCOMPKDTLN>(
        target: K,
        value: SCOMPKDTLN[K]
    ) => {
        if (value !== undefined) {
            result[target] = value;
        }
    };

    copy("korrflag", source.korrflag);
    copy("perminher", source.perminher);
    copy("packkind", source.packageKind);
    copy("restricted", source.restricted);
    copy("mainpack", source.mainpack);
    return result;
}
