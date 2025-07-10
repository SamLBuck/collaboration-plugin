export function stripPersonalNoteBlocks(content: string): string {
    // Remove all ```personal-note ... ``` blocks
    let result = content.replace(/```personal-note[\s\S]*?```/gi, '');

    // Remove ALL extra blank lines (collapse multiple \n to a single)
    // result = result.replace(/\n\s*\n+/g, '\n');

    // Trim stray spaces at top/bottom
    return result;
}
