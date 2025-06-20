// src/utils/pnpp.ts

import { App, Plugin, MarkdownPostProcessorContext, Notice, setIcon, MarkdownRenderChild, TFile } from 'obsidian';
import MyPlugin from '../main';
import { PersonalNote } from '../main';
import { removePersonalNoteBlockFromFile } from './removePersonalNoteBlockFromFile'; // NEW: Import the new utility

// A class to manage the lifecycle of the event listener for each rendered personal note.
// This class is crucial for handling real-time updates to the UI based on changes in plugin settings.
class PersonalNoteChangeListener extends MarkdownRenderChild {
    private plugin: MyPlugin;
    private personalNoteId: string;
    private updateListenerRef: (...args: any[]) => any;
    private locationSpan: HTMLElement;
    private titleInput: HTMLInputElement; // Reference to the title input element
    private textArea: HTMLTextAreaElement; // Reference to the content textarea element
    private defaultPromptText: string; // Stored to manage placeholder behavior

    constructor(
        containerEl: HTMLElement,
        plugin: MyPlugin,
        personalNoteId: string,
        locationSpan: HTMLElement,
        titleInput: HTMLInputElement,
        textArea: HTMLTextAreaElement,
        defaultPromptText: string
    ) {
        super(containerEl);
        this.plugin = plugin;
        this.personalNoteId = personalNoteId;
        this.locationSpan = locationSpan;
        this.titleInput = titleInput;
        this.textArea = textArea;
        this.defaultPromptText = defaultPromptText;

        // Bind 'this' to the update listener function to ensure correct context
        this.updateListenerRef = this.onPluginNotesUpdated.bind(this);
    }

    async onload() {
        // Register for general plugin notes updates. This event is triggered whenever
        // plugin.saveSettings() is called from anywhere in the plugin (e.g., after location updates, title/content saves).
        (this.plugin.app.workspace as any).on('plugin:personal-notes-updated', this.updateListenerRef);
        console.log(`[PNPP] Registered listener for ID ${this.personalNoteId.substring(0,8)}...`);
    }

    onunload() {
        // Deregister the listener when this MarkdownRenderChild is unloaded (e.g., when the note is closed/rerendered).
        (this.plugin.app.workspace as any).offref(this.updateListenerRef);
        console.log(`[PNPP] Unregistered listener for ID ${this.personalNoteId.substring(0,8)}...`);
    }

    /**
     * This method is called when the 'plugin:personal-notes-updated' event is triggered.
     * It checks if the corresponding personal note in settings has changed and updates the UI.
     */
    private onPluginNotesUpdated() {
        const updatedNote = this.plugin.settings.personalNotes.find(n => n.id === this.personalNoteId);
        if (updatedNote) {
            // Update location display if it has changed
            const newFileName = updatedNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File';
            const newLocationText = `Location: ${newFileName} (Line ${updatedNote.lineNumber + 1})`;
            if (this.locationSpan.textContent !== newLocationText) {
                this.locationSpan.setText(newLocationText);
                console.log(`[PNPP] Updated location display for ID ${updatedNote.id.substring(0,8)}... to ${newLocationText}`);
            }

            // Update title input value if it has changed in settings, but ONLY if the user is not actively typing in it.
            if (this.titleInput.value !== updatedNote.title && document.activeElement !== this.titleInput) {
                this.titleInput.value = updatedNote.title || ""; // Handle optional title
                console.log(`[PNPP] Updated title display for ID ${updatedNote.id.substring(0,8)}...`);
            }

            // Update content textarea value if it has changed in settings, but ONLY if the user is not actively typing in it.
            if (this.textArea.value !== updatedNote.content && document.activeElement !== this.textArea) {
                this.textArea.value = updatedNote.content; // Direct update, placeholder is handled by attribute
                console.log(`[PNPP] Updated content display for ID ${updatedNote.id.substring(0,8)}...`);
            }
        } else {
            // If the note is no longer found in plugin settings (e.g., deleted), remove its rendered element.
            this.containerEl.remove();
        }
    }
}


/**
 * Registers the Markdown Post Processor for "personal-note" code blocks.
 * This function is called once during plugin load.
 */
export function registerPersonalNotePostProcessor(plugin: MyPlugin) {
    plugin.registerMarkdownCodeBlockProcessor(
        "personal-note", // The language identifier for the code block (e.g., ```personal-note)
        async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            let noteId: string | null = null;

            // Parse the source content of the code block to extract the UUID
            const lines = source.split('\n');
            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                const idRegex = /^id:([a-f0-9-]+)$/i; // Regex to find "id:UUID"
                const match = firstLine.match(idRegex);

                if (match && match[1]) {
                    noteId = match[1];
                }
            }

            // If no valid ID is found in the code block, render an error message.
            if (!noteId) {
                el.createEl('pre', { 
                    text: `Error: Personal note ID not found in block.
Expected format: \`\`\`personal-note\\nid:YOUR-UUID\\nYour Content\`\`\`
\nOriginal Content:\n${source}`
                });
                el.addClass('personal-note-error');
                console.warn('Personal Note Post-Processor: Could not extract UUID from code block source content.', { source, ctx });
                return;
            }

            // Retrieve the personal note data from the plugin's settings using the extracted ID.
            const personalNote: PersonalNote | undefined = plugin.settings.personalNotes.find(
                (note) => note.id === noteId
            );

            // If the note data is not found in settings, render an error message.
            if (!personalNote) {
                el.addClass('personal-note-error');
                el.createEl('div', { text: `Error: Personal Note with ID ${noteId} not found in plugin settings. It might have been deleted from settings, but not from the file.` });
                el.createEl('pre', { text: source });
                console.error(`Personal Note Post-Processor: Note with ID ${noteId} not found in settings.`);
                return;
            }

            // --- Render the custom HTML UI for the personal note ---
            const wrapper = el.createEl('div', { cls: 'personal-note-wrapper' });
            wrapper.setAttribute('data-personal-note-id', personalNote.id);

            const header = wrapper.createEl('div', { cls: 'personal-note-header' });
            
            // Title Input Field: This is an <input> element to allow editing.
            const titleInput = header.createEl('input', { cls: 'personal-note-title-input' });
            titleInput.type = 'text';
            // Use logical OR for default title if personalNote.title is undefined/null/empty
            titleInput.value = personalNote.title || `Personal Note on ${personalNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${personalNote.lineNumber + 1})`; 
            titleInput.placeholder = "Personal note title (Optional)"; 
            titleInput.setAttribute('aria-label', 'Personal note title');

            // Controls container (buttons and status)
            const controls = header.createEl('div', { cls: 'personal-note-controls' });

            const minimizeButton = controls.createEl('button', { cls: 'personal-note-minimize' });
            // Using 'minus-square' / 'plus-square' for consistency with common UI patterns.
            setIcon(minimizeButton, personalNote.isExpanded ? 'minus-square' : 'plus-square'); 
            minimizeButton.setAttribute('aria-label', 'Toggle expand/collapse');

            const saveAndCloseButton = controls.createEl('button', { cls: 'personal-note-save-close' });
            // Using 'folder' icon for 'Save and Close'.
            setIcon(saveAndCloseButton, 'folder'); 
            saveAndCloseButton.setAttribute('aria-label', 'Save and close note');

            const deleteButton = controls.createEl('button', { cls: 'personal-note-delete' });
            setIcon(deleteButton, 'trash');
            deleteButton.setAttribute('aria-label', 'Delete personal note');

            const statusSpan = controls.createEl('span', { cls: 'personal-note-status' });
            statusSpan.setText('Saved'); // Initial status for the note

            // Content Area (Textarea)
            const contentDiv = wrapper.createEl('div', { cls: 'personal-note-content' });
            const textArea = contentDiv.createEl('textarea', { cls: 'personal-note-textarea' });
            const defaultPromptText = "Write your personal comments here. This box will appear whenever the link is clicked";
            textArea.placeholder = defaultPromptText; // Set placeholder
            
            textArea.value = personalNote.content; // Now, content is already an empty string from main.ts if new

            // Dynamically adjust textarea rows based on content length for better UX
            textArea.rows = Math.max(3, personalNote.content.split('\n').length || 1);

            // Location Span: Displays the file name and line number
            const locationSpan = wrapper.createEl('span', { cls: 'personal-note-location' });
            locationSpan.setText(`Location: ${personalNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${personalNote.lineNumber + 1})`);

            // Set initial expanded/collapsed state based on the 'isExpanded' property in settings
            if (personalNote.isExpanded) {
                wrapper.addClass('personal-note-expanded');
                contentDiv.style.display = 'block';
            } else {
                wrapper.addClass('personal-note-collapsed');
                contentDiv.style.display = 'none';
            }

            // --- Debounce function: Prevents too frequent saving while typing ---
            const debounce = <T extends (...args: any[]) => void>(func: T, delay: number) => {
                let timeout: NodeJS.Timeout;
                return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), delay);
                };
            };

            // Event listener for title input changes with debounce
            const saveTitleDebounced = debounce(async (newValue: string) => {
                personalNote.title = newValue; // Update the title in the personalNote object
                personalNote.updatedAt = Date.now();
                await plugin.saveSettings(); // Save the entire plugin settings
                statusSpan.setText('Saved');
                new Notice('Note title saved!', 1000);
            }, 500); // Wait 500ms after last input before saving

            titleInput.addEventListener('input', () => {
                statusSpan.setText('Typing...'); // Indicate typing in progress
                saveTitleDebounced(titleInput.value); // Call debounced save function
            });

            // Event listener for content textarea changes with debounce
            const saveContentDebounced = debounce(async (newValue: string) => {
                personalNote.content = newValue; // Update the content in the personalNote object
                personalNote.updatedAt = Date.now();
                await plugin.saveSettings(); // Save the entire plugin settings
                statusSpan.setText('Saved');
                new Notice('Personal note content saved!', 1000);
            }, 500); // Wait 500ms after last input before saving

            textArea.addEventListener('input', () => {
                statusSpan.setText('Typing...'); // Indicate typing in progress
                saveContentDebounced(textArea.value); // Call debounced save function
            });

            // Minimize/Expand button click handler
            minimizeButton.addEventListener('click', async () => {
                personalNote.isExpanded = !personalNote.isExpanded; // Toggle the expansion state

                // Apply CSS classes and display style based on the new state
                if (personalNote.isExpanded) {
                    wrapper.removeClass('personal-note-collapsed');
                    wrapper.addClass('personal-note-expanded');
                    contentDiv.style.display = 'block';
                    setIcon(minimizeButton, 'minus-square'); // Update icon
                } else {
                    wrapper.removeClass('personal-note-expanded');
                    wrapper.addClass('personal-note-collapsed');
                    contentDiv.style.display = 'none';
                    setIcon(minimizeButton, 'plus-square'); // Update icon
                }
                await plugin.saveSettings(); // Save the new expansion state
            });

            // Save and Close button click handler
            saveAndCloseButton.addEventListener('click', async () => {
                personalNote.title = titleInput.value; // Capture latest title from input
                personalNote.content = textArea.value; // Capture latest content from textarea
                personalNote.updatedAt = Date.now();
                personalNote.isExpanded = false; // Collapse the note when saved and closed

                await plugin.saveSettings();
                new Notice('Personal note saved and closed!', 2000);

                // Update UI to collapsed state
                wrapper.removeClass('personal-note-expanded');
                wrapper.addClass('personal-note-collapsed');
                contentDiv.style.display = 'none';
                setIcon(minimizeButton, 'plus-square'); // Set icon to "plus" (collapsed)

                statusSpan.setText('Saved & Closed');
            });


            // Delete button click handler
            deleteButton.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this personal note? This cannot be undone.')) {
                    // Find the file that contains this personal note
                    const targetFile = plugin.app.vault.getAbstractFileByPath(personalNote.targetFilePath);

                    if (targetFile instanceof TFile) {
                        try {
                            // Remove the note's data from the plugin settings array
                            plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                                (note) => note.id !== personalNote.id
                            );
                            await plugin.saveSettings(); // Save the updated settings

                            // --- NEW: Call the utility to remove the block from the file ---
                            await removePersonalNoteBlockFromFile(plugin.app, targetFile, personalNote.id);
                            // --- END NEW ---
                            
                            new Notice('Personal note completely deleted!', 2000);
                            wrapper.remove(); // Remove the entire UI wrapper for this note from the DOM
                        } catch (error) {
                            console.error(`[Personal Notes] Failed to delete block from file ${targetFile.path}:`, error);
                            new Notice(`Error deleting personal note from file. Please manually remove the block.`, 5000);
                        }
                    } else {
                        // If file not found, still remove from settings
                        plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                            (note) => note.id !== personalNote.id
                        );
                        await plugin.saveSettings();
                        new Notice('Personal note deleted from registry (file not found). Please check your file manually.', 5000);
                        wrapper.remove();
                    }
                }
            });

            // Add the PersonalNoteChangeListener as a child to the MarkdownPostProcessorContext.
            // This ensures its lifecycle (onload/onunload) is managed by Obsidian,
            // and it can react to 'plugin:personal-notes-updated' events for live updates.
            ctx.addChild(new PersonalNoteChangeListener(
                el, // The root element of the code block post-processor
                plugin,
                personalNote.id,
                locationSpan,
                titleInput,
                textArea,
                defaultPromptText
            ));
        }
    );
}
