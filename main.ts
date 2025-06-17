// src/main.ts
import {
    App,
    Editor,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    Modal, // Make sure Modal is imported
    TFile, // For file operations within the settings tab
    setIcon // For icons in the settings list
} from 'obsidian';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

import { registerPersonalNotePostProcessor } from './utils/pnpp';
import { PersonalNotesRegistryModal } from './settings/PersonalNotesRegistryModal'; // Keep this import for now, as the modal might still be used for a dedicated "full registry" view or other purposes.
import { updatePersonalNoteLocations } from './utils/updatePersonalNoteLocations'; // NEW: Import the location update utility

// Define the interface for a PersonalNote
export interface PersonalNote {
    id: string;             // Unique ID (UUID) for the note object itself
    targetFilePath: string; // Full path to the Obsidian note file where it's embedded
    lineNumber: number;     // The 0-indexed line number in the target file where the marker is inserted
    title: string;          // User-defined title for the personal note
    content: string;        // The actual content of the personal note (STORED ONLY IN PLUGIN SETTINGS)
    createdAt: number;      // Timestamp of creation (for sorting)
    updatedAt: number;      // Timestamp of last modification
    isExpanded: boolean;    // UI state: for the embedded box (if implemented)
}

// Define the interface for plugin settings
interface MyPluginSettings {
    personalNotes: PersonalNote[]; // Array to store all personal notes
    // Add other settings here if your plugin needs them later
}

// Define default settings for the plugin
const DEFAULT_SETTINGS: MyPluginSettings = {
    personalNotes: [], // Initialize as an empty array for new PersonalNote interface
};

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log("Loading Personal Comments Plugin...");
        await this.loadSettings();

        // NEW: Update personal note locations on plugin load
        // This ensures the registry is accurate when Obsidian starts or the plugin is enabled.
        await updatePersonalNoteLocations(this);

        // 1. Register the Markdown Post Processor
        registerPersonalNotePostProcessor(this);

        // 2. Add Ribbon Icon to create Personal Notes
        this.addRibbonIcon('sticky-note', 'Create Private Personal Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

            // Basic checks: ensure a file is open and it's a Markdown editor
            if (!activeFile) {
                new Notice("Please open a note to create a personal note.", 3000);
                return;
            }
            if (!activeView) {
                new Notice("No active Markdown editor found. Please focus on a note.", 3000);
                return;
            }

            const editor = activeView.editor;
            const cursor = editor.getCursor();
            const lineNumber = cursor.line;
            
            // UPDATED: Default content and title for inline editing
            const defaultTitle = "Personal note title (Optional)"; // As per sketch
            const defaultContent = "Write your personal comments here. This box will appear whenever the link is clicked"; // As per sketch

            const noteId = uuidv4(); // Generate a unique UUID for this new personal note

            // Define the FENCED CODE BLOCK marker to insert into the Markdown file.
            const personalNoteMarker =
                `\`\`\`personal-note\n` +     // The language identifier for the post-processor
                `id:${noteId}\n` +            // The unique ID for this personal note, embedded in content
                `${defaultContent}\n` +       // Initial editable content (will be overwritten by settings content)
                `\`\`\`\n`;

            // Insert the marker into the editor at the current cursor position
            editor.replaceRange(personalNoteMarker, cursor);

            // Store the full personal note object in the plugin's settings
            const newPersonalNote: PersonalNote = {
                id: noteId,
                targetFilePath: activeFile.path,
                lineNumber: lineNumber, // Store the line where the marker was inserted
                title: defaultTitle, // Use the default title directly
                content: defaultContent, // Use the default content directly
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isExpanded: true, // New notes start in an expanded state
            };

            this.settings.personalNotes.push(newPersonalNote); // Add to the array of personal notes
            await this.saveSettings(); // Save the updated settings data to disk

            new Notice(`Private personal note box created: "${newPersonalNote.title}".`, 3000);

            // Attempt to force an immediate re-render in Live Preview.
            editor.setCursor(lineNumber + 2, 0); // Cursor after the `personal-note` and `id:UUID` lines
        });

        // 3. Add a simple settings tab for demonstration and management
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // NEW: Listen for file saves to update personal note locations
        this.registerEvent(this.app.vault.on('modify', async (file) => {
            // Only process Markdown files
            if (file instanceof TFile && file.extension === 'md') {
                // Debounce this to avoid excessive updates on rapid typing/saving
                // (This is a simplified debounce for demonstration; a more robust one might be in a util)
                if (this._debounceUpdateLocationsTimeout) {
                    clearTimeout(this._debounceUpdateLocationsTimeout);
                }
                this._debounceUpdateLocationsTimeout = setTimeout(async () => {
                    console.log(`[Personal Notes] File modified: ${file.path}. Checking for personal note location updates.`);
                    await updatePersonalNoteLocations(this, file.path); // Update locations for this specific file
                    // If settings tab is open, re-display it to show updated locations
                    // --- FIXED: Type assertion for this.app.setting ---
                    if ((this.app as any).setting.activeTab instanceof SampleSettingTab) {
                    // --- END FIXED ---
                        (this.app as any).setting.activeTab.display();
                    }
                }, 1000); // Wait 1 second after last modification
            }
        }));
    }

    // Add a property for the debounce timeout
    private _debounceUpdateLocationsTimeout: NodeJS.Timeout | null = null;

    onunload() {
        console.log('Unloading Personal Comments Plugin');
        if (this._debounceUpdateLocationsTimeout) {
            clearTimeout(this._debounceUpdateLocationsTimeout);
        }
    }

    async loadSettings() {
        const rawSettings = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);

        if (!this.settings.personalNotes) {
            this.settings.personalNotes = [];
        } else {
            this.settings.personalNotes.forEach(note => {
                if (typeof note.isExpanded === 'undefined') {
                    note.isExpanded = false;
                }
                // Ensure title exists for older notes without a title if needed
                if (typeof note.title === 'undefined' || note.title === '') {
                    note.title = `Private Note on ${note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${note.lineNumber + 1})`;
                }
            });
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        (this.app.workspace as any).trigger('plugin:personal-notes-updated');
    }
}

// Basic settings tab - NOW DISPLAYS PERSONAL NOTES DIRECTLY
class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Personal Notes Plugin Settings' });
        containerEl.createEl('p', { text: 'Manage your embedded personal notes and clear plugin data.' });

        // --- SECTION: Display Personal Notes Registry Directly in Settings ---
        containerEl.createEl('h3', { text: 'Your Personal Notes' });

        // NEW: Button to manually refresh note locations
        new Setting(containerEl)
            .setName('Refresh Note Locations')
            .setDesc('Scan all notes to update their line numbers in the registry. Useful after major edits or file movements.')
            .addButton(button => {
                button.setButtonText('Refresh')
                    .setIcon('refresh-ccw') // Refresh icon
                    .onClick(async () => {
                        new Notice('Refreshing personal note locations...');
                        await updatePersonalNoteLocations(this.plugin);
                        new Notice('Personal note locations refreshed!', 2000);
                        this.display(); // Re-render settings page to show updated locations
                    });
            });

        const personalNotes = this.plugin.settings.personalNotes;

        if (personalNotes.length === 0) {
            containerEl.createEl('p', { cls: 'empty-list-message', text: 'No personal notes found yet.' });
        } else {
            const registryListContainer = containerEl.createEl('div', { cls: 'personal-note-registry-list' });

            // Create header row for the list
            const headerRow = registryListContainer.createEl('div', { cls: 'registry-list-header' });
            headerRow.createEl('span', { text: 'ID' });
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
                        // Optionally, close settings modal if desired
                        // this.app.setting.close();
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
                        this.display(); // Re-render the settings page to show updated list
                    }
                };
            });
        }
        // --- END SECTION ---

        // The "Clear All Personal Notes Data" setting remains
        containerEl.createEl('h3', { text: 'Plugin Data Management' });
        new Setting(containerEl)
            .setName('Clear All Personal Notes Data')
            .setDesc('WARNING: This will delete ALL personal notes data stored by the plugin. Embedded blocks in notes will no longer render correctly and will show an error. Use with extreme caution!')
            .addButton(button => {
                button.setButtonText('Clear All Data')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (confirm('Are you absolutely sure you want to clear ALL personal note data? This action cannot be undone.')) {
                            this.plugin.settings.personalNotes = [];
                            await this.plugin.saveSettings();
                            new Notice('All personal note data has been cleared.', 4000);
                            this.display(); // Re-render the settings tab after clearing
                        }
                    });
            });
    }
}
