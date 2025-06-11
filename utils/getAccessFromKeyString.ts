export function getAccessFromKeyString(keyString: string): string {
    const parts = keyString.split('|');
    return parts.length > 1 ? parts[1] : 'View'; // fallback
  }
  