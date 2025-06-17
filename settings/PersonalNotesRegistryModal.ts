// src/settings/PersonalNotesRegistryModal.ts

import { App, Modal, Setting, TFile, Notice, setIcon } from 'obsidian';
import MyPlugin, { PersonalNote } from '../main'; // Import MyPlugin and PersonalNote interface

export class PersonalNotesRegistryModal extends Modal {
    plugin: MyPlugin; // Reference to your main plugin instance

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.titleEl.setText('Personal Notes Registry'); // Set modal title
        this.modalEl.addClass('personal-note-registry-modal'); // Add a class for specific modal styling
    }

    onOpen() {
        this.displayRegistry();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty(); // Clear content when modal closes
    }

    // Function to render the list of personal notes
    displayRegistry() {
        const { contentEl } = this;
        contentEl.empty(); // Clear existing content to re-render

        const personalNotes = this.plugin.settings.personalNotes;

        if (personalNotes.length === 0) {
            contentEl.createEl('p', { cls: 'empty-list-message', text: 'No personal notes found yet.' });
            return;
        }

        const registryListContainer = contentEl.createEl('div', { cls: 'personal-note-registry-list' });

        // Create header row for the list
        const headerRow = registryListContainer.createEl('div', { cls: 'registry-list-header' });
        headerRow.createEl('span', { text: 'ID (Preview)' });
        headerRow.createEl('span', { text: 'Title' });
        headerRow.createEl('span', { text: 'Location' });
        headerRow.createEl('span', { text: 'Actions' }); // For buttons

        // Sort notes by creation date (newest first)
        const sortedNotes = personalNotes.sort((a, b) => b.createdAt - a.createdAt);

        // Iterate through each personal note and create a row for it
        sortedNotes.forEach(note => {
            const row = registryListContainer.createEl('div', { cls: 'registry-list-row' });

            // Note ID (shortened for display)
            const idDisplay = row.createEl('span', { cls: 'registry-id-display', text: note.id.substring(0, 8) + '...' });
            idDisplay.setAttribute('title', note.id); // Full ID on hover

            // Note Title
            const titleDisplay = row.createEl('span', { cls: 'registry-title-display', text: note.title });

            // Note Location
            const locationDisplay = row.createEl('span', { cls: 'registry-location-display' });
            const fileName = note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File';
            locationDisplay.setText(`${fileName} (Line ${note.lineNumber + 1})`);
            locationDisplay.setAttribute('title', note.targetFilePath); // Full path on hover

            // Action Buttons
            const actionsContainer = row.createEl('div', { cls: 'registry-actions' });

            // Button to open the note file
            const openButton = actionsContainer.createEl('button', { cls: 'open-note-button' });
            setIcon(openButton, 'external-link'); // Icon for external link
            openButton.setAttribute('aria-label', 'Open Note File');
            openButton.onclick = async () => {
                const file = this.app.vault.getAbstractFileByPath(note.targetFilePath);
                if (file instanceof TFile) {
                    await this.app.workspace.openLinkText(note.targetFilePath, note.targetFilePath);
                    new Notice(`Opened: ${fileName}`);
                    this.close(); // Close modal after opening note
                } else {
                    new Notice(`File not found: ${note.targetFilePath}`, 5000);
                }
            };
            
            // Button to delete the note from registry
            const deleteButton = actionsContainer.createEl('button', { cls: 'delete-note-registry-button mod-warning' });
            setIcon(deleteButton, 'trash'); // Trash icon
            deleteButton.setAttribute('aria-label', 'Delete from Registry');
            deleteButton.onclick = async () => {
                if (confirm(`Are you sure you want to delete "${note.title}" from the registry? This will NOT delete the markdown block from your note file.`)) {
                    this.plugin.settings.personalNotes = this.plugin.settings.personalNotes.filter(
                        (n) => n.id !== note.id
                    );
                    await this.plugin.saveSettings();
                    new Notice(`Personal note "${note.title}" deleted from registry.`, 3000);
                    this.displayRegistry(); // Re-render the list after deletion
                }
            };
        });
    }
}
