export function parseKey(keyString: string): { ip: string; noteName: string; view: string } | null {
    const [rawKey, view = "view"] = keyString.split('|'); // Defaults view to "view" if missing

    if (!rawKey) return null;

    const parts = rawKey.split('-');
    if (parts.length < 2) return null;

    const ip = parts[0];
    const noteName = parts.slice(1).join('-');

    return {
        ip,
        noteName,
        view
    };
}
