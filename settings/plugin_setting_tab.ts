import { App, PluginSettingTab, Setting, ButtonComponent, TextComponent, Notice } from 'obsidian';
import type MyPlugin from '../main';
import { KeyListModal } from './key_list_page02';
import { LinkNoteModal } from './link_note_page03';

export class PluginSettingsTab extends PluginSettingTab {
  constructor(app: App, public plugin: MyPlugin) {
    super(app, plugin);
  }

  private toBindFilename: string = '';  // ← give it a default

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    // Header
    containerEl.createEl('h2', { text: 'Collaboration Settings' });
    containerEl.createEl('p', {
      text: 'Generate and manage collaboration notes. Create new notes bound to the current file, view your existing keys, or navigate to key list and link-note pages.'
    });
    // Key Generation Section
    const keyGenWrapper = containerEl.createDiv({ cls: 'key-gen-box' });
    keyGenWrapper.style.border = '1px solid var(--background-modifier-border)';
    keyGenWrapper.style.borderRadius = '8px';
    keyGenWrapper.style.padding = '16px';
    keyGenWrapper.style.marginBottom = '24px';
    keyGenWrapper.style.backgroundColor = 'var(--background-secondary)';

    keyGenWrapper.createEl('h3', { text: 'New Collaboration Note' });
    // Note input (current file suggestion)

	new Setting(keyGenWrapper)
	  .setName('File to Bind')
	  .setDesc('Which file this new collaboration note will attach to')
	  .addText(text => {
		// seed it with the current file, but leave it editable
		this.toBindFilename = this.app.workspace.getActiveFile()?.basename || '';
		text
		  .setPlaceholder('Enter a filename…')
		  .setValue(this.toBindFilename)
		  .onChange(value => {
			this.toBindFilename = value.trim();
		  });
	  });
	
    // Access type checkboxes
    // Generate button
    new Setting(keyGenWrapper)
	.addButton(btn =>
		btn
		  .setButtonText('Generate & Save')
		  .setCta()
		  .onClick(async () => {
			// Call createCollabNote and grab the new KeyItem
			let newKey = await this.plugin.createCollabNote();
	  
			if (!newKey || !newKey.filePath) {
			  new Notice('Failed to create collaboration note.', 3000);
			  return;
			}
	  
			// Build a share‐string including noteName if you like:
			// (here we bake in the file basename as the “note” label)
			const noteName = newKey.filePath.split('/').pop()!.replace(/\.md$/, '');
			const shareString = `${newKey.noteKey}:${newKey.apiKey}|${noteName}`;
	  
			// Copy it to the clipboard
			await navigator.clipboard.writeText(shareString);
			new Notice(`Key copied: ${shareString}`, 3000);
	  
			// Refresh the settings UI to show the new row
			this.display();
		  })
	  )
	  
    // Navigation to other modals
    const nav = containerEl.createDiv({ cls: 'settings-nav-buttons' });
    nav.style.display = 'flex';
    nav.style.justifyContent = 'space-between';
    nav.style.marginBottom = '16px';
    new ButtonComponent(nav)
      .setButtonText('Key List')
      .onClick(() => new KeyListModal(this.app, this.plugin).open());
	  new ButtonComponent(nav)
	  .setButtonText('Link Note')
	  .onClick(() => {
		new LinkNoteModal(this.app, this.plugin).open();
	  });
		// Layout adjustments
    containerEl.querySelectorAll('.setting-item').forEach(el => {
      (el as HTMLElement).style.marginBottom = '12px';
    });
  }
}
