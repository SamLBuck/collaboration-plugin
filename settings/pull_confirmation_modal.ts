// settings/pull_confirmation_modal.ts
import { App, Modal, Setting } from "obsidian";

export class PullConfirmationModal extends Modal {
	key: string = "";
	note: string = "";
	onConfirm: (key: string, note: string) => void;

	constructor(app: App, onConfirm: (key: string, note: string) => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h3", { text: "Do you want to access data from:" });

		new Setting(contentEl)
			.setName("Key")
			.addText((text) =>
				text.setPlaceholder("Enter key...").onChange((value) => {
					this.key = value;
				})
			);

		new Setting(contentEl)
			.setName("Note")
			.addText((text) =>
				text.setPlaceholder("Enter note name...").onChange((value) => {
					this.note = value;
				})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Confirm")
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm(this.key, this.note);
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
