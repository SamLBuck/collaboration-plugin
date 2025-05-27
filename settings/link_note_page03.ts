import { App, Modal, Setting, TextComponent, ButtonComponent, Notice, TFile } from "obsidian"; // Added TFile for vault operations
import MyPlugin from "../main"; // Assuming MyPlugin is needed for context or future use
import { requestNoteFromPeer } from "../networking/socket/client"; // Import the actual client function

export class LinkNoteModal extends Modal {
    plugin: MyPlugin; // Add plugin reference if needed for other actions or context
    linkNoteKeyInput: TextComponent; // Reference to the input field

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin; // Initialize plugin reference
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Pull Collaborative Note" }); // Changed title here
        contentEl.createEl('p', { text: 'Use this section to pull a shared note from a peer.' }); // Updated description for the section

        new Setting(contentEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to pull.') // Updated description
            .addText(text => {
                this.linkNoteKeyInput = text;
                text.setPlaceholder('e.g., MyNoteName-192.168.1.100'); // Updated placeholder for clarity
            });

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Pull Note')
                    .setCta()
                    .onClick(async () => { // Made async to use await
                        const key = this.linkNoteKeyInput.getValue().trim();
                        if (!key) {
                            new Notice('Please enter a Share Key / Password to pull a note.', 3000);
                            return;
                        }

                        new Notice(`Attempting to pull note with key: ${key}...`, 3000);

                        try {
                            // Use the actual WebSocket client function to request content
                            const content = await requestNoteFromPeer("ws://localhost:3010", key);

                            // Derive note name from the key (e.g., "NoteName-IP" -> "NoteName")
                            // This assumes the key format is "NoteName-IPAddress"
                            const noteNameParts = key.split('-');
                            const noteName = noteNameParts.length > 1 ? noteNameParts.slice(0, -1).join('-') : key; // Handle keys without IP part

                            const sanitizedNoteName = noteName.replace(/[\\/:*?"<>|]/g, ''); // Basic sanitization for file names
                            const filePath = `${sanitizedNoteName}.md`;
                            
                            let file: TFile | null = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                            let overwrite = false;

                            if (file) {
                                // File exists, ask for overwrite confirmation
                                overwrite = await new Promise(resolve => {
                                    const confirmNotice = new Notice(
                                        `Note "${filePath}" already exists. Overwrite? (Click here to confirm)`,
                                        0 // Display indefinitely until clicked
                                    );
                                    confirmNotice.noticeEl.onclick = () => {
                                        confirmNotice.hide();
                                        resolve(true); // User confirms overwrite
                                    };
                                    // Auto-hide after some time if not clicked, and resolve to false
                                    setTimeout(() => {
                                        confirmNotice.hide();
                                        resolve(false);
                                    }, 7000); // 7 seconds to decide
                                });

                                if (!overwrite) {
                                    new Notice(`Pull cancelled for "${filePath}". Note not overwritten.`, 3000);
                                    return;
                                }
                            }

                            if (file && overwrite) {
                                await this.app.vault.modify(file, content);
                                new Notice(`Note "${filePath}" updated successfully!`, 3000);
                            } else {
                                file = await this.app.vault.create(filePath, content);
                                new Notice(`Note "${filePath}" created successfully!`, 3000);
                            }

                            // Open the created/updated note
                            if (file) {
                                this.app.workspace.openLinkText(file.path, '', false);
                            }

                        } catch (error) {
                            console.error('Error pulling note:', error);
                            new Notice(`An error occurred while pulling the note: ${error.message}`, 5000);
                        }
                    });
            });

        // REMOVED: "Generate Shareable Link (Copy to Clipboard)" button
    }

    onClose() {
        this.contentEl.empty();
    }
}
