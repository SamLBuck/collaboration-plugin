// src/utils/personalNotePostProcessor.ts

import { MarkdownPostProcessorContext, App, setIcon, Notice, debounce, TFile, editorLivePreviewField, editorViewField, MarkdownView } from 'obsidian';
import MyPlugin, { PersonalNote } from '../main';

// This regex targets the fenced code block syntax for personal notes:
// ```personal-note-id-[UUID]
// [content]
// ```
const PERSONAL_NOTE_CODEBLOCK_REGEX = /^\s*```personal-note-id-([a-f0-9-]+)\n([\s\S]*?)\n\s*```\s*$/m;

/**
 * Registers the Markdown Post-Processor for personal notes.
 * This function will scan the rendered Markdown for personal note markers
 * and replace them with interactive HTML elements.
 */
export function registerPersonalNotePostProcessor(plugin: MyPlugin) {
    plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        // Iterate over all pre > code blocks found in the element
        const codeblocks = el.querySelectorAll('pre > code');

        codeblocks.forEach(codeblock => {
            const lang = codeblock.className.replace(/^language-/, ''); // Get the language string
            const noteIdMatch = lang.match(/^personal-note-id-(.+)$/); // Match our custom ID format

            if (noteIdMatch) {
                const noteId = noteIdMatch[1];
                const personalNote = plugin.settings.personalNotes.find(note => note.id === noteId);

                // Ensure the 'codeblock' itself is the <pre><code> container for replacement
                const parentPre = codeblock.parentElement;
                if (!parentPre || parentPre.tagName.toLowerCase() !== 'pre') {
                    console.warn("Personal Note Post Processor: Code block parent is not <pre>.", codeblock);
                    return;
                }

                if (personalNote) {
                    const noteContainer = createPersonalNoteElement(plugin, personalNote, ctx);
                    parentPre.replaceWith(noteContainer); // Replace the <pre> tag with our custom element
                } else {
                    // If note not found in settings, display an error message directly
                    const errorBox = createDiv({ cls: 'personal-note-error-box' });
                    errorBox.setText(`[Personal Note Error: ID ${noteId} not found in settings. Was it deleted? Please remove this block from the note.]`);
                    parentPre.replaceWith(errorBox);
                }
            }
        });
    });

    // Register event listener for when personal notes are updated (from modal or other means)
    plugin.registerEvent(
        // --- CORRECTION HERE: Cast `plugin.app.workspace` to `any` ---
        (plugin.app.workspace as any).on('plugin:personal-notes-updated', async (noteId?: string) => {
            const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                // Get the current view state to re-apply it
                const currentState = activeView.leaf.getViewState();
                // Force a re-render by setting the view state again.
                // This is a common trick to refresh the current view.
                // We keep 'active: true' to ensure it remains the focused tab.
                await activeView.leaf.setViewState({
                    ...currentState,
                    active: true,
                });
                console.log(`[Personal Note Post Processor] Re-rendered active view for note ID: ${noteId || 'unknown'}`);
            }
        })
    );
}

/**
 * Creates the HTML element for a personal note, handling both expanded and minimized states.
 */
function createPersonalNoteElement(plugin: MyPlugin, note: PersonalNote, ctx: MarkdownPostProcessorContext): HTMLElement {
    const container = createDiv({ cls: 'personal-note-inline-container' });
    container.dataset.noteId = note.id; // Store note ID for easy lookup on the element

    if (note.isExpanded) {
        renderExpandedNote(plugin, container, note, ctx);
    } else {
        renderMinimizedNote(plugin, container, note, ctx);
    }

    return container;
}

/**
 * Renders the minimized (link) state of a personal note.
 */
function renderMinimizedNote(plugin: MyPlugin, container: HTMLElement, note: PersonalNote, ctx: MarkdownPostProcessorContext): void {
    container.empty(); // Clear existing content
    container.removeClass('is-expanded');
    container.addClass('is-minimized');

    // Use the note title, or a fallback if empty
    const linkText = (note.title && note.title.trim() !== '') ? note.title.trim() : 'Personal Note';
    
    // Create the clickable link element
    const linkSpan = container.createSpan({ cls: 'personal-note-link', text: linkText });
    linkSpan.title = `Click to expand: ${linkText} (Source: ${note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Current Note'}, Line ${note.lineNumber + 1})`;

    linkSpan.onclick = async (e) => {
        e.stopPropagation(); // Prevent clicks from bubbling up
        note.isExpanded = true;
        await plugin.saveSettings(); // Save the state
        // Trigger a specific update for this note's ID to optimize re-rendering if possible
        (plugin.app.workspace as any).trigger('plugin:personal-notes-updated', note.id); 
    };
}

/**
 * Renders the expanded (box) state of a personal note.
 */
function renderExpandedNote(plugin: MyPlugin, container: HTMLElement, note: PersonalNote, ctx: MarkdownPostProcessorContext): void {
    container.empty(); // Clear existing content
    container.removeClass('is-minimized');
    container.addClass('is-expanded');

    const header = container.createDiv({ cls: 'personal-note-header' });
    const titleInput = header.createEl('input', { type: 'text', cls: 'personal-note-title-input' });
    titleInput.value = note.title || '';
    titleInput.placeholder = 'Optional Personal Note Title';

    const actionButtons = header.createDiv({ cls: 'personal-note-actions' });
    
    // Minimize button
    const minimizeButton = actionButtons.createEl('button', { cls: 'personal-note-action-button clickable-icon' });
    setIcon(minimizeButton, 'minus'); // Use 'minus' icon for minimize
    minimizeButton.ariaLabel = 'Minimize Personal Note';
    minimizeButton.onclick = async (e) => {
        e.stopPropagation();
        note.isExpanded = false;
        await plugin.saveSettings();
        // Trigger a specific update for this note's ID to optimize re-rendering if possible
        (plugin.app.workspace as any).trigger('plugin:personal-notes-updated', note.id); 
    };

    // Delete button
    const deleteButton = actionButtons.createEl('button', { cls: 'personal-note-action-button mod-warning clickable-icon' });
    setIcon(deleteButton, 'trash'); // Use 'trash' icon for delete
    deleteButton.ariaLabel = 'Delete Personal Note';
    deleteButton.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete this personal note? "${note.title || note.content.substring(0, Math.min(note.content.length, 30))}..."`)) {
            // Remove from settings
            plugin.settings.personalNotes = plugin.settings.personalNotes.filter(n => n.id !== note.id);
            await plugin.saveSettings();
            new Notice('Personal note deleted from settings.', 2000);

            // Remove the marker from the Markdown file
            // This requires getting the file content and replacing the marker
            const currentFile = plugin.app.vault.getAbstractFileByPath(note.targetFilePath);
            if (currentFile instanceof TFile) {
                const fileContent = await plugin.app.vault.read(currentFile);
                // Regex to match the entire fenced code block
                // Adjust this regex based on how you insert the marker.
                // It should match: ```personal-note-id-UUID\n[content]\n```\n?
                const markerRegex = new RegExp(`\`\`\`personal-note-id-${note.id}\n[\\s\\S]*?\n\`\`\`\\n?`, 'g');
                const updatedContent = fileContent.replace(markerRegex, '');
                await plugin.app.vault.modify(currentFile, updatedContent); // This triggers a full re-render
                new Notice('Note box removed from file.', 1500);
            }
            container.remove(); // Remove the element from the DOM immediately
        }
    };

    const textarea = container.createEl('textarea', { cls: 'personal-note-textarea' });
    textarea.value = note.content;
    textarea.placeholder = 'Write your personal comment here...';
    textarea.rows = 5; // Default rows, can be overridden by CSS resize

    // Debounced saving for content and title changes
    const debouncedSave = debounce(async () => {
        const currentTitle = titleInput.value.trim();
        const currentContent = textarea.value.trim();

        if (note.title !== currentTitle || note.content !== currentContent) {
            // Only enforce non-empty content if the user actively tries to clear it and save
            if (!currentContent && note.content) { // If original content existed and new is empty
                new Notice('Note content cannot be empty. Reverting to previous content.', 2000);
                textarea.value = note.content; // Revert textarea to last saved valid content
                return;
            }
            note.title = currentTitle;
            note.content = currentContent;
            note.updatedAt = Date.now();
            await plugin.saveSettings();
            new Notice('Personal note auto-saved!', 1000);
            // Re-triggering update will re-render, useful if title changed for minimized state
            (plugin.app.workspace as any).trigger('plugin:personal-notes-updated', note.id);
        }
    }, 1500, true); // Debounce for 1.5 seconds, trailing edge

    titleInput.oninput = debouncedSave;
    textarea.oninput = debouncedSave;

    // Location display
    const locationSpan = container.createSpan({
        cls: 'personal-note-location-display',
        text: `Source: ${note.targetFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Current Note'}, Line: ${note.lineNumber + 1}`
    });
}