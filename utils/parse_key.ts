import { KeyItem } from '../main'; // Assuming KeyItem is defined in main.ts or a shared types file

export function parseKey(keyString: string) {
    // Expected format: "KEYID-NoteName-AccessType"
    // Example: "xyz123-MySharedNote-Edit"
    // The key ID is assumed to be alphanumeric, followed by a hyphen.
    // The note name can contain hyphens, so we need to be careful with splitting.

    const parts = keyString.split('-');

    if (parts.length < 2) {
        // Not enough parts to match the expected format
        return null;
    }

    // The key ID is the first part
    const ip = parts[0]; // IP is now the first part
    const noteName = parts[1]; // Note name is the rest of the parts
	
    // The access type is the last part
    // const access = parts[parts.length - 1];

    // The note name is everything in between the first and last parts
    const note = parts.slice(1, parts.length - 1).join('-');

    if (!ip || !note) {
        // One of the essential parts is missing
        return null;
    }

    return { ip, noteName};
}
