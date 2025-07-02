// src/utils/pnpp.ts

import { App, Plugin, MarkdownPostProcessorContext, Notice, setIcon, MarkdownRenderChild, TFile, MarkdownView } from 'obsidian';
import MyPlugin from '../main';
import { PersonalNote } from '../main';
import { removePersonalNoteBlockFromFile } from './removePersonalNoteBlockFromFile'; // NEW: Import the new utility
import { ConfirmDeleteModal } from '../settings/ConfrimDeleteModal';

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
            let personalNote: PersonalNote | undefined = plugin.settings.personalNotes.find(
	note => note.id === noteId
);

if (!personalNote) {
	console.warn(`[Personal Notes] Note with ID ${noteId} not found in settings. Attempting to recover from file...`);

	// Try to recover from file
	const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (file instanceof TFile) {
		const fileContent = await plugin.app.vault.read(file);
		const blockRegex = new RegExp(
			`<!-- PERSONAL_NOTE:${noteId} -->([\\s\\S]*?)<!-- END_PERSONAL_NOTE -->`,
			'm'
		);
		const match = fileContent.match(blockRegex);

		if (match) {
			const blockContent = match[1].trim();
			const rebuiltNote: PersonalNote = {
				id: noteId,
				targetFilePath: ctx.sourcePath,
				lineNumber: ctx.getSectionInfo(el)?.lineStart ?? 0,
				title: `Recovered Note`,
				content: blockContent,
				isExpanded: true,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};

			plugin.settings.personalNotes.push(rebuiltNote);
			await plugin.saveSettings();

			console.info(`[Personal Notes] Successfully recovered note with ID ${noteId}.`);
			personalNote = rebuiltNote;
		} else {
			el.addClass('personal-note-error');
			el.createEl('div', { text: `Error: Personal Note with ID ${noteId} not found and could not be recovered.` });
			el.createEl('pre', { text: source });
			console.error(`[Personal Notes] Could not recover note ID ${noteId} — block not found in file.`);
			return;
		}
	} else {
		el.addClass('personal-note-error');
		el.createEl('div', { text: `Error: Personal Note with ID ${noteId} not found and file not available.` });
		el.createEl('pre', { text: source });
		console.error(`[Personal Notes] Could not recover note ID ${noteId} — file not found.`);
		return;
	}
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
            setIcon(minimizeButton, personalNote.isExpanded ? 'minus' : 'plus'); 
            minimizeButton.setAttribute('aria-label', 'Expand/collapse');

            const deleteButton = controls.createEl('button', { cls: 'personal-note-delete' });
            setIcon(deleteButton, 'x');
            deleteButton.setAttribute('aria-label', 'Delete personal note');

            const statusSpan = controls.createEl('span', { cls: 'personal-note-status' });
            statusSpan.setText('Saved'); // Initial status for the note

            // Content Area (Textarea)
            const contentDiv = wrapper.createEl('div', { cls: 'personal-note-content' });
            const textArea = contentDiv.createEl('textarea', { cls: 'personal-note-textarea' });
            const defaultPromptText = "Write your personal comments here. This box will appear whenever the link is clicked";
            textArea.placeholder = defaultPromptText; // Set placeholder
            
            textArea.value = personalNote.content; // Now, content is already an empty string from main.ts if new

            // --- Auto-resize textarea based on content ---
            const autoResize = () => {
                textArea.style.height = 'auto'; // Reset height to shrink if needed
                textArea.style.height = textArea.scrollHeight + 'px'; // Grow to fit content
            };

            // Call once initially
            setTimeout(autoResize,0);

            // Attach input listener
            textArea.addEventListener('input', autoResize);

            // Location Span: Displays the file name and line number
            const locationSpan = wrapper.createEl('span', { cls: 'personal-note-location' });
            // locationSpan.setText(`Location: ${personalNote.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown File'} (Line ${personalNote.lineNumber + 1})`);

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
                    setIcon(minimizeButton, 'minus'); // Update icon
                } else {
                    wrapper.removeClass('personal-note-expanded');
                    wrapper.addClass('personal-note-collapsed');
                    contentDiv.style.display = 'none';
                    setIcon(minimizeButton, 'plus'); // Update icon
                }
                await plugin.saveSettings(); // Save the new expansion state
            });

            // Delete button click handler
            deleteButton.addEventListener("click", () => {
                new ConfirmDeleteModal(plugin.app, async () => {
                    const targetFile = plugin.app.vault.getAbstractFileByPath(personalNote.targetFilePath);

                    if (targetFile instanceof TFile) {
                        try {
                            plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                                (note) => note.id !== personalNote.id
                            );
                            await plugin.saveSettings();

                            await removePersonalNoteBlockFromFile(plugin.app, targetFile, personalNote.id);

                            new Notice("Personal note deleted!", 2000);
                            wrapper.remove();

                        } catch (error) {
                            console.error(`[Personal Notes] Failed to delete block from file ${targetFile.path}:`, error);
                            new Notice(`Error deleting personal note from file. Please manually remove the block.`, 5000);
                        }
                    } else {
                        plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                            (note) => note.id !== personalNote.id
                        );
                        await plugin.saveSettings();

                        new Notice("Personal note deleted from registry (file not found). Please check your file manually.", 5000);
                        wrapper.remove();
                    }
                }).open();
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
