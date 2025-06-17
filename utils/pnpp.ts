// src/utils/pnpp.ts

import { App, Plugin, MarkdownPostProcessorContext, Notice, setIcon, MarkdownRenderChild } from 'obsidian'; // Import MarkdownRenderChild
import MyPlugin from '../main'; // Import the main plugin class
import { PersonalNote } from '../main'; // Import the PersonalNote interface

// A class to manage the lifecycle of the event listener for each rendered personal note.
// This class implements MarkdownRenderChild to be properly managed by Obsidian's rendering context.
class PersonalNoteChangeListener extends MarkdownRenderChild {
    private plugin: MyPlugin;
    private personalNoteId: string;
    private updateListenerRef: (...args: any[]) => any; // Reference to the actual event listener function
    private locationSpan: HTMLElement; // Reference to the DOM element displaying the location
    private titleInput: HTMLInputElement; // Reference to the DOM element displaying the title
    private textArea: HTMLTextAreaElement; // Reference to the DOM element displaying the content
    private defaultPromptText: string; // The default prompt for content

    constructor(
        containerEl: HTMLElement, // This is the 'el' from the post-processor callback
        plugin: MyPlugin,
        personalNoteId: string,
        locationSpan: HTMLElement,
        titleInput: HTMLInputElement,
        textArea: HTMLTextAreaElement,
        defaultPromptText: string
    ) {
        super(containerEl); // Pass the container element to the parent constructor
        this.plugin = plugin;
        this.personalNoteId = personalNoteId;
        this.locationSpan = locationSpan;
        this.titleInput = titleInput;
        this.textArea = textArea;
        this.defaultPromptText = defaultPromptText;

        // Bind 'this' context for the listener correctly
        this.updateListenerRef = this.onPluginNotesUpdated.bind(this);
    }

    // This method is called by Obsidian when the component is loaded (i.e., the Markdown block is rendered)
    async onload() {
        // Register the event listener when the component loads
        (this.plugin.app.workspace as any).on('plugin:personal-notes-updated', this.updateListenerRef);
        console.log(`[PNPP] Registered listener for ID ${this.personalNoteId.substring(0,8)}...`);
    }

    // This method is called by Obsidian when the component is unloaded (i.e., the Markdown block is removed from view)
    onunload() {
        // Deregister the event listener when the component unloads to prevent memory leaks
        (this.plugin.app.workspace as any).offref(this.updateListenerRef);
        console.log(`[PNPP] Unregistered listener for ID ${this.personalNoteId.substring(0,8)}...`);
    }

    // The actual event handler logic
    private onPluginNotesUpdated() {
        const updatedNote = this.plugin.settings.personalNotes.find(n => n.id === this.personalNoteId);
        if (updatedNote) {
            // Update the displayed location text if the line number has changed
            const newFileName = updatedNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File';
            const newLocationText = `Location: ${newFileName} (Line ${updatedNote.lineNumber + 1})`;
            if (this.locationSpan.textContent !== newLocationText) {
                this.locationSpan.setText(newLocationText);
                console.log(`[PNPP] Updated location display for ID ${updatedNote.id.substring(0,8)}... to ${newLocationText}`);
            }
            // Update title if it was edited externally (e.g., via registry modal)
            if (this.titleInput.value !== updatedNote.title) {
                this.titleInput.value = updatedNote.title;
            }
            // Update content if it was edited externally (e.g., via registry modal)
            // Only update if not currently typing, or if it's a significant external change
            if (this.textArea.value !== updatedNote.content) {
                if (document.activeElement !== this.textArea && document.activeElement !== this.titleInput) {
                    this.textArea.value = updatedNote.content === this.defaultPromptText || updatedNote.content === "" ? "" : updatedNote.content;
                    console.log(`[PNPP] Updated content display for ID ${updatedNote.id.substring(0,8)}...`);
                }
            }
        } else {
            // If the note is no longer in settings, it means it was deleted.
            this.containerEl.remove(); // Remove the rendered HTML element
        }
    }
}


// This function registers a Markdown code block processor for "personal-note" language.
// It intercepts the block and replaces its content with a custom interactive HTML element.
export function registerPersonalNotePostProcessor(plugin: MyPlugin) {
    plugin.registerMarkdownCodeBlockProcessor(
        "personal-note", // This string MUST exactly match the language identifier in your Markdown blocks (```personal-note)
        async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            let noteId: string | null = null;

            // The 'source' parameter contains the entire content of the code block.
            // We expect the first line of this source to contain "id:UUID".
            const lines = source.split('\n');
            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                const idRegex = /^id:([a-f0-9-]+)$/i; // Regex to extract the UUID (case-insensitive for 'id:')
                const match = firstLine.match(idRegex);

                if (match && match[1]) {
                    noteId = match[1]; // Extract the UUID from the match
                }
            }

            // If no valid UUID is found (meaning the block is not in the expected format),
            // render an error message and stop processing.
            if (!noteId) {
                el.createEl('pre', { 
                    text: `Error: Personal note ID not found in block.
Expected format: \`\`\`personal-note\\nid:YOUR-UUID\\nYour Content\`\`\`
\nOriginal Content:\n${source}`
                });
                el.addClass('personal-note-error'); // Add an error class for styling
                console.warn('Personal Note Post-Processor: Could not extract UUID from code block source content.', { source, ctx });
                return;
            }

            // Find the corresponding PersonalNote object in the plugin's settings using the extracted ID.
            const personalNote: PersonalNote | undefined = plugin.settings.personalNotes.find(
                (note) => note.id === noteId
            );

            // If the personal note data is not found in settings (e.g., deleted via settings, corrupted data),
            // render an error message to the user.
            if (!personalNote) {
                el.addClass('personal-note-error'); // Add an error class for styling
                el.createEl('div', { text: `Error: Personal Note with ID ${noteId} not found in plugin settings.` });
                el.createEl('pre', { text: source }); // Display original source for debugging
                console.error(`Personal Note Post-Processor: Note with ID ${noteId} not found in settings.`);
                return;
            }

            // --- Start building the custom HTML structure for the personal note box ---

            // Main wrapper for the entire personal note component
            const wrapper = el.createEl('div', { cls: 'personal-note-wrapper' });
            wrapper.setAttribute('data-personal-note-id', personalNote.id); // Useful for identifying this specific note in DOM

            // Header section: contains title input and control buttons
            const header = wrapper.createEl('div', { cls: 'personal-note-header' });
            
            // Editable Title Input
            const titleInput = header.createEl('input', { cls: 'personal-note-title-input' });
            titleInput.type = 'text';
            titleInput.value = personalNote.title;
            titleInput.placeholder = "Personal note title (Optional)";
            titleInput.setAttribute('aria-label', 'Personal note title');

            // Container for control buttons and status
            const controls = header.createEl('div', { cls: 'personal-note-controls' });

            // Minimize/Expand button (chevrons up/down)
            const minimizeButton = controls.createEl('button', { cls: 'personal-note-minimize' });
            // --- MODIFIED ICON: Using 'minus-square' for minimize/expand representation ---
            setIcon(minimizeButton, personalNote.isExpanded ? 'minus-square' : 'plus-square');
            minimizeButton.setAttribute('aria-label', 'Toggle expand/collapse');

            // Save & Close button (checkmark, as per sketch implies save and close/minimize)
            const saveAndCloseButton = controls.createEl('button', { cls: 'personal-note-save-close' });
            // --- MODIFIED ICON: Using 'folder' for save/folder representation ---
            setIcon(saveAndCloseButton, 'folder'); 
            saveAndCloseButton.setAttribute('aria-label', 'Save and close note');

            // Delete button (trash icon)
            const deleteButton = controls.createEl('button', { cls: 'personal-note-delete' });
            // --- MODIFIED ICON: Using 'x-circle' or 'trash' for delete, 'trash' is more standard for delete ---
            setIcon(deleteButton, 'trash'); // Keep 'trash' as it's clear for delete. 'x-circle' is an option too.
            deleteButton.setAttribute('aria-label', 'Delete personal note');

            // Status indicator (e.g., "Saved", "Typing...")
            const statusSpan = controls.createEl('span', { cls: 'personal-note-status' });
            statusSpan.setText('Saved'); // Initial status is saved

            // Content area: holds the editable textarea
            const contentDiv = wrapper.createEl('div', { cls: 'personal-note-content' });
            const textArea = contentDiv.createEl('textarea', { cls: 'personal-note-textarea' });
            // --- MODIFIED: Use placeholder for initial content, and manage value on focus/blur ---
            const defaultPromptText = "Write your personal comments here. This box will appear whenever the link is clicked";
            textArea.placeholder = defaultPromptText; // Set the prompt text as placeholder
            textArea.value = personalNote.content === "" ? "" : personalNote.content; // Set value from settings, or empty if no content
            
            // If the saved content is the default prompt text, display it as empty for typing
            if (personalNote.content === defaultPromptText || personalNote.content === "") {
                textArea.value = ""; 
            } else {
                textArea.value = personalNote.content;
            }

            textArea.rows = Math.max(3, personalNote.content.split('\n').length || 1); // Adjust height dynamically, minimum 1 line

            // Handle focus: clear text if it's the default prompt
            textArea.addEventListener('focus', () => {
                if (textArea.value === "" && personalNote.content === defaultPromptText) {
                    textArea.value = "";
                }
            });

            // Handle blur: restore default prompt if empty
            textArea.addEventListener('blur', () => {
                if (textArea.value.trim() === "" && personalNote.content === defaultPromptText) {
                    // Only put back the default if the actual saved content *was* the default prompt
                    // and the user hasn't typed anything else.
                    // This scenario is mainly for newly created notes.
                    // For existing notes, if user deletes content, we want it to remain empty.
                    if (personalNote.content === defaultPromptText) {
                         textArea.value = ""; // Keep it truly empty on blur, but rely on placeholder
                    }
                }
            });
            // --- END MODIFIED ---

            // Location of the note placeholder
            const locationSpan = wrapper.createEl('span', { cls: 'personal-note-location' });
            // Initial text for location
            locationSpan.setText(`Location: ${personalNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${personalNote.lineNumber + 1})`);

            // Apply initial display state (expanded or collapsed)
            if (personalNote.isExpanded) {
                wrapper.addClass('personal-note-expanded');
                contentDiv.style.display = 'block'; // Show content
            } else {
                wrapper.addClass('personal-note-collapsed');
                contentDiv.style.display = 'none'; // Hide content
            }

            // --- Add Event Listeners for interactivity ---

            // Debounce function to limit how often a function runs (for saving input)
            const debounce = <T extends (...args: any[]) => void>(func: T, delay: number) => {
                let timeout: NodeJS.Timeout;
                return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), delay);
                };
            };

            // Save Title on input change (debounced)
            const saveTitleDebounced = debounce(async (newValue: string) => {
                personalNote.title = newValue; // Update title in settings
                personalNote.updatedAt = Date.now();
                await plugin.saveSettings(); // Persist changes
                statusSpan.setText('Saved');
                new Notice('Note title saved!', 1000);
            }, 500); // Save after 500ms of no typing

            titleInput.addEventListener('input', () => {
                statusSpan.setText('Typing...');
                saveTitleDebounced(titleInput.value);
            });

            // Save Content on input change (debounced)
            const saveContentDebounced = debounce(async (newValue: string) => {
                personalNote.content = newValue; // Update content in settings
                personalNote.updatedAt = Date.now(); // Update last modified timestamp
                await plugin.saveSettings(); // Persist changes
                statusSpan.setText('Saved'); // Update status to saved
                new Notice('Personal note content saved!', 1000); // Brief user notification
            }, 500);

            textArea.addEventListener('input', () => {
                statusSpan.setText('Typing...');
                saveContentDebounced(textArea.value);
            });

            // Toggle Minimize/Expand functionality
            minimizeButton.addEventListener('click', async () => {
                personalNote.isExpanded = !personalNote.isExpanded; // Toggle the state

                if (personalNote.isExpanded) {
                    wrapper.removeClass('personal-note-collapsed');
                    wrapper.addClass('personal-note-expanded');
                    contentDiv.style.display = 'block'; // Show content
                    setIcon(minimizeButton, 'minus-square'); // Change icon to 'collapse'
                } else {
                    wrapper.removeClass('personal-note-expanded');
                    wrapper.addClass('personal-note-collapsed');
                    contentDiv.style.display = 'none'; // Hide content
                    setIcon(minimizeButton, 'plus-square'); // Change icon to 'expand'
                }
                await plugin.saveSettings(); // Save the new expanded state to settings
            });

            // Save & Close button functionality
            saveAndCloseButton.addEventListener('click', async () => {
                // Ensure latest content and title are saved before closing
                personalNote.title = titleInput.value;
                personalNote.content = textArea.value;
                personalNote.updatedAt = Date.now();
                personalNote.isExpanded = false; // Collapse the note after saving and closing

                await plugin.saveSettings(); // Save updated settings
                new Notice('Personal note saved and closed!', 2000);

                // Update UI state
                wrapper.removeClass('personal-note-expanded');
                wrapper.addClass('personal-note-collapsed');
                contentDiv.style.display = 'none';
                setIcon(minimizeButton, 'plus-square'); // Ensure chevron is 'down' (plus-square for collapsed)

                statusSpan.setText('Saved & Closed');
            });


            // Delete Note functionality
            deleteButton.addEventListener('click', async () => {
                // Confirm deletion with the user
                if (confirm('Are you sure you want to delete this personal note? This cannot be undone.')) {
                    // Remove the note from the plugin's settings array
                    plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                        (note) => note.id !== personalNote.id
                    );
                    await plugin.saveSettings(); // Save the updated settings
                    new Notice('Personal note deleted!', 2000); // Notify user
                    wrapper.remove(); // Remove the rendered HTML element from the document

                    // Instruct the user to manually remove the Markdown block from the file
                    new Notice(
                        `Please manually delete the \`\`\`personal-note\` block\ncontaining 'id:${personalNote.id}' from your note file to fully remove it.`, 
                        6000
                    );
                }
            });

            // --- NEW: Event Listener for external updates (e.g., location changes) ---
            // Register an instance of PersonalNoteChangeListener as a MarkdownRenderChild
            ctx.addChild(new PersonalNoteChangeListener(
                el, // The container element for this rendered block
                plugin,
                personalNote.id,
                locationSpan,
                titleInput,
                textArea,
                defaultPromptText // Pass the default prompt text
            ));
            // --- END NEW: Event Listener for external updates ---
        }
    );
}
