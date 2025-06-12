// src/modals/PersonalNoteEditModal.ts

import { App, Modal, Setting, Notice } from 'obsidian';
import MyPlugin, { PersonalNote } from '../main';

export class PersonalNoteEditModal extends Modal {
    plugin: MyPlugin;
    note: PersonalNote;
    private newTitle: string;
    private newContent: string;
    private resolvePromise: (value: boolean) => void;

    constructor(app: App, plugin: MyPlugin, note: PersonalNote) {
        super(app);
        this.plugin = plugin;
        this.note = note;
        this.newTitle = note.title || '';
        this.newContent = note.content;
        this.titleEl.setText('Edit Personal Note');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('personal-note-edit-modal');

        let titleInputEl: HTMLInputElement;
        let contentTextareaEl: HTMLTextAreaElement;

        // Title Setting
        new Setting(contentEl)
            .setName('Title')
            .setDesc('Optional title for your personal note')
            .addText(text => {
                text
                    .setPlaceholder('e.g., My thought on this paragraph')
                    .setValue(this.newTitle)
                    .onChange(value => {
                        this.newTitle = value;
                    });
                titleInputEl = text.inputEl;
            });

        // Content Setting
        new Setting(contentEl)
            .setName('Content')
            .setDesc('Your personal note content')
            .addTextArea(text => {
                text
                    .setPlaceholder('Write your note here...')
                    .setValue(this.newContent)
                    .onChange(value => {
                        this.newContent = value;
                    });
                contentTextareaEl = text.inputEl;
                contentTextareaEl.rows = 10; // Make textarea larger
            });

        // Action Buttons
        new Setting(contentEl)
            .setClass('personal-note-modal-buttons')
            .addButton(button => {
                button
                    .setButtonText('Save Note')
                    .setCta()
                    .onClick(async () => {
                        this.note.title = this.newTitle.trim();
                        this.note.content = this.newContent.trim();
                        this.note.updatedAt = Date.now();

                        if (this.note.content === '') {
                            new Notice('Personal note content cannot be empty! Not saved.', 3000);
                            return; // Do not close the modal if content is empty
                        }

                        await this.plugin.saveSettings();
                        new Notice('Personal note updated!', 2000);
                        // Trigger a custom event to notify any listeners (like the post-processor) to re-render
                        (this.app as any).trigger('plugin:personal-notes-updated', this.note.id); // Pass the ID for specific update
                        this.resolvePromise(true); // Resolve the promise indicating save success
                        this.close();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.resolvePromise(false); // Resolve the promise indicating cancel
                        this.close();
                    });
            });

        // Fix starts here: Use a type assertion
        (this.scope as any).queueMicrotask(() => {
            titleInputEl.focus();
        });
    }

    onClose() {
        this.contentEl.empty();
    }

    waitForClose(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }
}