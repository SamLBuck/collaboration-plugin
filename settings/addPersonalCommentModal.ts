import { App, Modal, Setting, TextComponent, Notice } from "obsidian";

export class AddPersonalCommentModal extends Modal {
	private textInput!: TextComponent;
	private onSubmit: (content: string) => void;

	constructor(app: App, onSubmit: (content: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add Personal Comment" });

		new Setting(contentEl)
			.setName("Comment")
			.setDesc("Type your personal note")
			.addText(text => {
				this.textInput = text;
				text.setPlaceholder("Your comment here...");
			});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText("Submit").setCta().onClick(() => {
					const content = this.textInput.getValue().trim();
					if (!content) {
						new Notice("Comment cannot be empty.");
						return;
					}
					this.onSubmit(content);
					this.close();
				});
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
