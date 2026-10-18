export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (error !== null && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") {
            return message;
        }
    }
    return String(error);
}
