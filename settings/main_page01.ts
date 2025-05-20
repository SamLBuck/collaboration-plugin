import { Modal, App } from "obsidian";
import type MyPlugin from "../main";

export class SettingsModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.renderSettingsPage(); // show settings inside modal
	}

	onClose() {
		this.contentEl.empty(); // clean up when closing
	}

	private renderSettingsPage() {
		const container = this.contentEl;
		container.empty();

		// Title
		container.createEl("h2", { text: "Settings" });

		// Input for key
		const keyInput = container.createEl("input", {
			type: "text",
			placeholder: "Enter or generate key...",
		});

		const generateBtn = container.createEl("button", { text: "Generate" });
		generateBtn.onclick = () => {
			keyInput.value = this.generateRandomKey();
		};

		const noteInput = container.createEl("input", {
			type: "text",
			placeholder: "Note name...",
		});

		// Access checkboxes
		const accessTypes = ["View", "Edit", "View and Comment", "Edit w/ Approval"];
		const checkboxes: Record<string, HTMLInputElement> = {};
		const accessDiv = container.createDiv();
		accessDiv.createEl("h3", { text: "Access Type" });

		accessTypes.forEach((type) => {
			const label = accessDiv.createEl("label", { text: type });
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			label.prepend(checkbox);
			accessDiv.appendChild(label);
			checkboxes[type] = checkbox;
		});

		container.append(keyInput, generateBtn, noteInput, accessDiv);

		// Navigation buttons
		const listBtn = container.createEl("button", { text: "List of keys" });
		const linkBtn = container.createEl("button", { text: "Link Note" });

		container.append(listBtn, linkBtn);

		// Show KeyListModal when clicking list
		listBtn.onclick = async () => {
			const { KeyListModal } = await import("./key_list_page02");
			new KeyListModal(this.app, this.plugin).open();
		};
	}

	private generateRandomKey(): string {
		return Math.random().toString(36).slice(2, 10);
	}
}

