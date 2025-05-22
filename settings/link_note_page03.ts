import { App, Modal, Setting, TextComponent, ButtonComponent, Notice } from 'obsidian';
import MyPlugin from '../main';

export class LinkNoteModal extends Modal {
    plugin: MyPlugin;
    linkNoteKeyInput: TextComponent; // Reference to the input field

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Link / Pull a Collaborative Note' });
        contentEl.createEl('p', { text: 'Use this section to link to or pull a shared note from a peer.' });

        new Setting(contentEl)
            .setName('Share Key / Password')
            .setDesc('Enter the key/password for the shared note you want to link.')
            .addText(text => {
                this.linkNoteKeyInput = text;
                text.setPlaceholder('e.g., mysecretkey123');
            });

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Pull Note')
                    .setCta()
                    .onClick(() => {
                        const key = this.linkNoteKeyInput.getValue().trim();
                        if (!key) {
                            new Notice('Please enter a Share Key / Password to pull a note.', 3000);
                            return;
                        }
                        new Notice(`Attempting to pull note with key: ${key}. Functionality coming soon!`, 5000);
                    });
            });

        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Generate Shareable Link (Copy to Clipboard)')
                    .onClick(() => {
                        const password = this.linkNoteKeyInput.getValue().trim();
                        if (!password) {
                            new Notice('Please enter a Share Key / Password first to generate a link.', 3000);
                            return;
                        }
                        const dummyIp = '192.168.1.42'; // Replace with your actual IP/hostname or discovery logic
                        const dummyPort = 3010; // Replace with your actual port
                        const shareLink = `obs-collab://${dummyIp}:${dummyPort}/note/${password}`;
                        navigator.clipboard.writeText(shareLink);
                        new Notice(`Share Link copied: ${shareLink}`, 6000);
                    });
            });

        // Add a close button
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText("Close")
                    .onClick(() => this.close());
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}