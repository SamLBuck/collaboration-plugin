import { App, TFile } from "obsidian";

export async function getNoteContentByName(app: App, noteName: string): Promise<string | null> {
	const file = app.vault.getAbstractFileByPath(`${noteName}.md`);

	if (!file || !(file instanceof TFile)) {
		console.warn(`[getNoteContentByName] Note "${noteName}.md" not found or is not a valid file.`);
		return null;
	}

	try {
		return await app.vault.read(file);
	} catch (err) {
		console.error(`[getNoteContentByName] Error reading note "${noteName}":`, err);
		return null;
	}
    
}
