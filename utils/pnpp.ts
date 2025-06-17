// src/utils/pnpp.ts

import { App, Plugin, MarkdownPostProcessorContext, MarkdownRenderer, TFile, Notice } from 'obsidian';
import MyPlugin from '../main';
import { PersonalNote } from '../main';
import { setIcon } from 'obsidian';

export function registerPersonalNotePostProcessor(plugin: MyPlugin) {
    plugin.registerMarkdownCodeBlockProcessor(
        "personal-note", // <--- Now a fixed, simple string.
        async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            let noteId: string | null = null;
            let displayContent: string = source; // Default to full source if no ID found

            // Parse the source to extract the UUID and the actual content
            const lines = source.split('\n');
            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                const idRegex = /^id:([a-f0-9-]+)$/i; // Case-insensitive for 'id:'
                const match = firstLine.match(idRegex);

                if (match && match[1]) {
                    noteId = match[1];
                    displayContent = lines.slice(1).join('\n').trim(); // Content is after the ID line
                }
            }

            if (!noteId) {
                // If ID is not found, render an error or just the raw block
                el.createEl('pre', { text: `Error: Personal note ID not found in block.\n\n${source}` });
                el.addClass('personal-note-error');
                console.warn('Personal Note Post-Processor: Could not extract UUID from code block source content.', { source, ctx });
                return;
            }

            const personalNote: PersonalNote | undefined = plugin.settings.personalNotes.find(
                (note) => note.id === noteId
            );

            if (!personalNote) {
                el.addClass('personal-note-error');
                el.createEl('div', { text: `Error: Personal Note with ID ${noteId} not found in plugin settings.` });
                el.createEl('pre', { text: source });
                console.error(`Personal Note Post-Processor: Note with ID ${noteId} not found in settings.`);
                return;
            }

            // --- Create the custom HTML structure ---
            const wrapper = el.createEl('div', { cls: 'personal-note-wrapper' });
            wrapper.setAttribute('data-personal-note-id', personalNote.id);

            const header = wrapper.createEl('div', { cls: 'personal-note-header' });
            const titleSpan = header.createEl('span', { cls: 'personal-note-title' });
            titleSpan.setText(personalNote.title || `Private Note (ID: ${personalNote.id.substring(0, 8)})`);

            const controls = header.createEl('div', { cls: 'personal-note-controls' });

            const minimizeButton = controls.createEl('button', { cls: 'personal-note-minimize' });
            setIcon(minimizeButton, personalNote.isExpanded ? 'chevrons-up' : 'chevrons-down');
            minimizeButton.setAttribute('aria-label', 'Toggle expand/collapse');

            const deleteButton = controls.createEl('button', { cls: 'personal-note-delete' });
            setIcon(deleteButton, 'trash');
            deleteButton.setAttribute('aria-label', 'Delete personal note');

            const statusSpan = controls.createEl('span', { cls: 'personal-note-status' });
            statusSpan.setText('Saved');

            const contentDiv = wrapper.createEl('div', { cls: 'personal-note-content' });
            const textArea = contentDiv.createEl('textarea', { cls: 'personal-note-textarea' });
            textArea.value = personalNote.content; // Use content from settings, not the raw source
            textArea.rows = Math.max(3, personalNote.content.split('\n').length);
            
            // Set initial state based on personalNote.isExpanded
            if (personalNote.isExpanded) {
                wrapper.addClass('personal-note-expanded');
                contentDiv.style.display = 'block';
            } else {
                wrapper.addClass('personal-note-collapsed');
                contentDiv.style.display = 'none';
            }

            // --- Add Event Listeners ---
            let saveTimeout: NodeJS.Timeout;
            textArea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                statusSpan.setText('Typing...');
                saveTimeout = setTimeout(async () => {
                    personalNote.content = textArea.value;
                    personalNote.updatedAt = Date.now();
                    await plugin.saveSettings();
                    statusSpan.setText('Saved');
                    new Notice('Personal note saved!', 1000);
                }, 500);
            });

            minimizeButton.addEventListener('click', async () => {
                personalNote.isExpanded = !personalNote.isExpanded;
                if (personalNote.isExpanded) {
                    wrapper.removeClass('personal-note-collapsed');
                    wrapper.addClass('personal-note-expanded');
                    contentDiv.style.display = 'block';
                    setIcon(minimizeButton, 'chevrons-up');
                } else {
                    wrapper.removeClass('personal-note-expanded');
                    wrapper.addClass('personal-note-collapsed');
                    contentDiv.style.display = 'none';
                    setIcon(minimizeButton, 'chevrons-down');
                }
                await plugin.saveSettings();
            });

            deleteButton.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this personal note? This cannot be undone.')) {
                    plugin.settings.personalNotes = plugin.settings.personalNotes.filter(
                        (note) => note.id !== personalNote.id
                    );
                    await plugin.saveSettings();
                    new Notice('Personal note deleted!', 2000);
                    wrapper.remove();
                    
                    new Notice(
                        `Please manually delete the \`\`\`personal-note\` block\ncontaining 'id:${personalNote.id}' from your note file to fully remove it.`, 
                        6000
                    );
                }
            });
        }
    );
}