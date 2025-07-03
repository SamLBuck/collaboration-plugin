// src/views/PersonalNotesView.ts

import { ItemView, WorkspaceLeaf, debounce, Notice, TFile, setIcon } from 'obsidian';
import MyPlugin, { PersonalNote } from '../main';
import { PERSONAL_NOTES_VIEW_TYPE } from '../constants/viewTypes';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

export class PersonalNotesView extends ItemView {
    plugin: MyPlugin;
    private notesListContainer: HTMLElement; // Container for the list of notes

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return PERSONAL_NOTES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Personal Notes';
    }

    getIcon(): string {
        return 'file-user'; // Or any other suitable icon
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('personal-notes-panel'); // Add a class for styling

        // Add a title to the panel
        this.contentEl.createEl('h2', { text: 'My Personal Notes' });

        // Container for the list of notes
        this.notesListContainer = this.contentEl.createDiv({ cls: 'personal-notes-list-container' });

        // Render the initial list of notes
        await this.renderPersonalNotes();

        // Register event listener for settings changes to re-render the view
        // Using a debounced function to avoid excessive re-renders
        // WORKAROUND: Cast this.app to any due to stubborn TypeScript definition issue
        this.plugin.registerEvent(
            (this.app as any).on('plugin:personal-notes-updated',
                debounce(this.renderPersonalNotes.bind(this), 200, true)
            )
        );
    }

    async onClose(): Promise<void> {
        console.log('Personal Notes View closed');
        // Any cleanup if necessary
    }

    // This method will be called to render or re-render the list of personal notes
    async renderPersonalNotes(): Promise<void> {
        this.notesListContainer.empty(); // Clear existing content

        const personalNotes = this.plugin.settings.personalNotes || [];

        if (personalNotes.length === 0) {
            this.notesListContainer.createEl('p', {
                text: 'No personal notes yet. Click the "add-note" ribbon icon to create one!',
                cls: 'empty-personal-notes-message'
            });
            return;
        }

        // Sort notes: most recent (highest createdAt) at the top
        const sortedNotes = [...personalNotes].sort((a, b) => b.createdAt - a.createdAt);

        for (const note of sortedNotes) {
            const noteEntry = this.notesListContainer.createDiv({ cls: 'personal-note-entry' });
            noteEntry.toggleClass('is-expanded', note.isExpanded || false); // Apply expanded class based on state

            const header = noteEntry.createDiv({ cls: 'personal-note-header' });
            header.onclick = () => this.toggleNoteExpansion(note.id); // Toggle expansion on header click

            // Title and Location display
            const titleAndLocation = header.createDiv({ cls: 'personal-note-header-text' });
            const displayName = note.title && note.title.trim() !== '' ? note.title : 'Untitled Personal Note';
            titleAndLocation.createSpan({ text: displayName, cls: 'personal-note-title' });

            const noteFileName = note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown Note';
            titleAndLocation.createSpan({ text: ` (Note: ${noteFileName}, Line: ${note.lineNumber + 1})`, cls: 'personal-note-location' }); // +1 for 1-indexed line display

            // Action buttons in header (e.g., Delete, Go to Note)
            const actions = header.createDiv({ cls: 'personal-note-actions' });

            // Go to Note button
            const goToNoteButton = actions.createEl('button', { cls: 'personal-note-action-button clickable-icon' });
            setIcon(goToNoteButton, 'right-arrow'); // Using setIcon for Obsidian's built-in icons
            goToNoteButton.ariaLabel = 'Go to source note';
            goToNoteButton.onclick = async (e: MouseEvent) => { // Corrected: assignment to .onclick property
                e.stopPropagation(); // Prevent toggling expansion
                const file = this.app.vault.getAbstractFileByPath(note.targetFilePath);
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf(false); // Reuse or create new leaf
                    await leaf.openFile(file);
                    // Optional: Scroll to line number (requires more advanced editor interaction)
                    // For now, just opening the file is sufficient.
                    new Notice(`Opened note: ${note.targetFilePath} at line ${note.lineNumber + 1}`, 2000);
                } else {
                    new Notice('Source note file not found!', 3000);
                }
            };

            // Delete button
            const deleteButton = actions.createEl('button', { cls: 'personal-note-action-button mod-warning clickable-icon' });
            setIcon(deleteButton, 'trash'); // Using setIcon for Obsidian's built-in icons
            deleteButton.ariaLabel = 'Delete Personal Note';
            deleteButton.onclick = async (e: MouseEvent) => { // Corrected: assignment to .onclick property
                e.stopPropagation(); // Prevent toggling expansion
                if (confirm(`Are you sure you want to delete this personal note? "${displayName}"`)) {
                    this.plugin.settings.personalNotes = this.plugin.settings.personalNotes.filter(n => n.id !== note.id);
                    await this.plugin.saveSettings();
                    new Notice('Personal note deleted.', 2000);
                    // WORKAROUND: Cast this.app to any due to stubborn TypeScript definition issue
                    (this.app as any).trigger('plugin:personal-notes-updated'); // Trigger re-render
                }
            };

            // Content area (hidden by default)
            const contentArea = noteEntry.createDiv({ cls: 'personal-note-content-area' });
            const titleInput = contentArea.createEl('input', { type: 'text', cls: 'personal-note-title-input' });
            titleInput.value = note.title || '';
            titleInput.placeholder = 'Optional Title';

            const textarea = contentArea.createEl('textarea', { cls: 'personal-note-textarea' });
            textarea.value = note.content;
            textarea.placeholder = 'Write your personal comment here...';

            // Save changes on input blur or debounce
            const saveChanges = debounce(async () => {
                const updatedNotes = this.plugin.settings.personalNotes.map(n =>
                    n.id === note.id ? { ...n, title: titleInput.value.trim(), content: textarea.value, updatedAt: Date.now() } : n
                );
                this.plugin.settings.personalNotes = updatedNotes;
                await this.plugin.saveSettings();
                new Notice('Personal note saved!', 1000);
                // WORKAROUND: Cast this.app to any due to stubborn TypeScript definition issue
                (this.app as any).trigger('plugin:personal-notes-updated');
            }, 1000, true); // Debounce for 1 second

            titleInput.oninput = saveChanges;
            textarea.oninput = saveChanges;
        }
    }

    // Toggles the 'isExpanded' state for a note and updates the plugin settings
    async toggleNoteExpansion(noteId: string): Promise<void> {
        const updatedNotes = this.plugin.settings.personalNotes.map(note =>
            note.id === noteId ? { ...note, isExpanded: !note.isExpanded } : note
        );
        this.plugin.settings.personalNotes = updatedNotes;
        await this.plugin.saveSettings();
        // WORKAROUND: Cast this.app to any due to stubborn TypeScript definition issue
        (this.app as any).trigger('plugin:personal-notes-updated'); // Trigger re-render to update the UI
    }
}