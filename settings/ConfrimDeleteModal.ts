import { Modal, App } from "obsidian";

export class ConfirmDeleteModal extends Modal {
	onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Delete Personal Note?" });
		contentEl.createEl("p", {
			text: "Are you sure you want to delete this personal note? This cannot be undone.",
		});

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });

		const confirmBtn = buttons.createEl("button", { text: "Delete" });
		confirmBtn.style.marginRight = "8px";
		confirmBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
