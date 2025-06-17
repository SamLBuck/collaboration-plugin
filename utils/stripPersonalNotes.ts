
export function stripPersonalNoteBlocks(content: string): string {
    return content.replace(/```personal-note[\s\S]*?```/gi, '').trim();
}
