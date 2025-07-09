// Code for pop-up modal that shows the key of a specific note
import { Modal, App } from "obsidian";

export class NoteKeyModal extends Modal {
	noteKey: string;

	constructor(app: App, noteKey: string) {
		super(app);
		this.noteKey = noteKey;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Note Key' });
		contentEl.createEl('p', {
			text: this.noteKey,
			attr: {
				style: 'font-size: 1.5rem; font-weight: bold; word-break: break-word; text-align: center; margin-top: 10px;'
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
