export function parseKey(keyString: string): { ip: string; noteName: string; view: string } | null {
    const [rawKey, view = "view"] = keyString.split('|'); // Defaults view to "view" if missing

    if (!rawKey) return null;

    const parts = rawKey.split('-');
    if (parts.length < 2) return null;

    const ip = parts[0];
    let noteName = parts.slice(1).join('-');

    // Remove any '|' characters from the noteName
    noteName = noteName.replace(/\|/g, '');

    return {
        ip,
        noteName,
        view
    };
}
