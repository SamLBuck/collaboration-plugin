import { Modal, App, TFile, normalizePath, Notice } from "obsidian";
import type MyPlugin from "../main";
import { SettingsModal } from "./main_page01";
import { parseShareKey } from "../utils/parse_key";
import { requestNoteFromPeer } from "networking/socket/client";



export class LinkNoteModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Link Note" });

		// Input field for the key
		const keyInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Enter key for note...",
		});

		// Button to link & create note
		const linkBtn = contentEl.createEl("button", {
			text: "Link & Create Note",
		});
		linkBtn.onclick = async () => {
			const rawInput = keyInput.value.trim();
		
			if (!rawInput) {
				new Notice("Please enter a valid key.");
				return;
			}
		
			try {
				// Support raw keys like "test" by prefixing with localhost format
				const shareKey = rawInput.startsWith("obs-collab://")
					? rawInput
					: `obs-collab://localhost:3010/note/${rawInput}`;
		
				console.log("[DEBUG] Parsed share key input:", shareKey);
		
				// Extract parts
				const { ip, port, key } = parseShareKey(shareKey);
				console.log("[DEBUG] Parsed values => IP:", ip, "Port:", port, "Key:", key);
		
				const wsUrl = `ws://${ip}:${port}`;
				console.log("[DEBUG] Connecting to:", wsUrl);
		
				// Fetch note content via WebSocket
				const content = await requestNoteFromPeer(wsUrl, key);
				console.log("[DEBUG] Received content:", content);
		
				// Create or open the note in the vault
				const fileName = `Shared-${key}.md`;
				const filePath = normalizePath(fileName);
				let file = this.app.vault.getAbstractFileByPath(filePath);
		
				if (!file) {
					file = await this.app.vault.create(filePath, content);
					console.log("[DEBUG] File created:", filePath);
				}
		
				this.app.workspace.openLinkText(filePath, "/", true);
				new Notice("Note linked and opened.");
				this.close();
		
			} catch (err) {
				console.error("[ERROR] Failed to link note:", err);
				new Notice("Failed to fetch note: " + err);
			}
		};
		
				// Back button
		const backBtn = contentEl.createEl("button", { text: "Back" });
		backBtn.onclick = () => {
			this.close();
			new SettingsModal(this.app, this.plugin).open();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}
