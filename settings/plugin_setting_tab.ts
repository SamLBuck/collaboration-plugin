// views/PluginSettingsTab.ts
import {
	App,
	PluginSettingTab,
	Setting,
	ButtonComponent,
	TextComponent,
	Notice,
	Modal,
	TFile
  } from 'obsidian';
  import type MyPlugin from '../main';
  import { KeyListModal } from './key_list_page02';
  import { LinkNoteModal } from './link_note_page03';
  import { nanoid } from 'nanoid';
  
  class EditCollabIdModal extends Modal {
	private proposed = '';
  
	constructor(
	  app: App,
	  private currentId: string | undefined,
	  private onSave: (id: string) => void
	) {
	  super(app);
	}
  
	onOpen(): void {
	  this.contentEl.empty();
	  this.contentEl.createEl('h2', { text: 'Set Your Collaborator ID' });
	  this.contentEl.createEl('p', {
		text:
		  'Pick any short string (letters, numbers, - or _). ' +
		  'Leave blank and click “Random” for an auto-generated ID.'
	  });
  
	  let idInput!: TextComponent;
	  new Setting(this.contentEl)
		.addText((t) => {
		  idInput = t;
		  t
			.setPlaceholder('e.g. sam-dev or 4k7g92')
			.setValue(this.currentId ?? '')
			.onChange((v) => (this.proposed = v.trim()));
		})
		.addExtraButton((b) =>
		  b
			.setIcon('dice')
			.setTooltip('Random 12-char ID')
			.onClick(() => {
			  const rnd = nanoid(12);
			  this.proposed = rnd;
			  idInput.setValue(rnd);
			})
		);
  
	  new Setting(this.contentEl).addButton((b) =>
		b
		  .setButtonText('Save')
		  .setCta()
		  .onClick(() => {
			const id = (this.proposed || idInput.getValue()).trim() || nanoid(12);
			if (!/^[A-Za-z0-9_-]{3,32}$/.test(id)) {
			  new Notice('ID must be 4–32 chars (letters, numbers, - or _).');
			  return;
			}
			this.close();
			this.onSave(id);
		  })
	  );
	}
  
	onClose(): void {
	  this.contentEl.empty();
	}
  }
  
  export class PluginSettingsTab extends PluginSettingTab {
	private toBindFilename = '';
	private wrapper!: HTMLDivElement;
  
	constructor(app: App, public plugin: MyPlugin) {
	  super(app, plugin);
	}
  
	display(): void {
	  // 1) Clear & create wrapper
	  this.containerEl.empty();
	  this.wrapper = this.containerEl.createDiv({ cls: 'aws-collab-wrapper' });
  
	  const w = this.wrapper;
  
	  // Header
	  w.createEl('h2', { text: 'Collaboration Settings' });
	  w.createEl('p', {
		text: 'Create collaboration notes, view keys, and set your Collaborator ID.'
	  });
  
	  // ========== Collaborator ID ==========
	  const idBox = w.createDiv({ cls: 'collab-id-box' });
	  Object.assign(idBox.style, {
		border: '1px solid var(--background-modifier-border)',
		borderRadius: '8px',
		padding: '16px',
		marginBottom: '24px',
		backgroundColor: 'var(--background-secondary)'
	  });
	  idBox.createEl('h3', { text: 'Your Collaborator ID' });
  
	  new Setting(idBox)
		.setName('Collaborator ID')
		.setDesc('Behaves like your username when syncing notes.')
		.addText((text) =>
		  text.setValue(this.plugin.settings.collabId ?? '').setDisabled(true)
		)
		.addExtraButton((btn) =>
		  btn
			.setIcon('pencil')
			.setTooltip('Edit / regenerate')
			.onClick(() =>
			  new EditCollabIdModal(
				this.app,
				this.plugin.settings.collabId,
				async (newId) => {
				  this.plugin.settings.collabId = newId;
				  await this.plugin.saveSettings();
				  this.display();
				  new Notice(`Collaborator ID set to ${newId}`, 3000);
				}
			  ).open()
			)
		);
  
	  // ========== New-note generator ==========
	  const keyGen = w.createDiv({ cls: 'key-gen-box' });
	  Object.assign(keyGen.style, {
		border: '1px solid var(--background-modifier-border)',
		borderRadius: '8px',
		padding: '16px',
		marginBottom: '24px',
		backgroundColor: 'var(--background-secondary)'
	  });
	  keyGen.createEl('h3', { text: 'New Collaboration Note' });
  
	  new Setting(keyGen)
		.setName('File to Bind')
		.setDesc('Which note this collaboration key should attach to')
		.addText((text) => {
		  this.toBindFilename =
			this.app.workspace.getActiveFile()?.basename || '';
		  text
			.setPlaceholder('Enter a filename…')
			.setValue(this.toBindFilename)
			.onChange((v) => (this.toBindFilename = v.trim()));
		});
  
	  new Setting(keyGen).addButton((btn) =>
		btn
		  .setButtonText('Generate & Save')
		  .setCta()
		  .onClick(async () => {
			const raw =
			  this.toBindFilename ||
			  this.app.workspace.getActiveFile()?.basename;
			if (!raw?.trim()) {
			  new Notice('Please enter a filename.', 3500);
			  return;
			}
			const filePath = raw.endsWith('.md') ? raw : `${raw}.md`;
			const file = this.app.vault.getAbstractFileByPath(
			  filePath
			) as TFile;
			if (!file) {
			  new Notice(`File “${filePath}” not found.`, 4000);
			  return;
			}
  
			const newKey = await this.plugin.createCollabNoteWithFile(file);
			if (!newKey) {
			  new Notice('Failed to create collaboration note.', 4000);
			  return;
			}
  
			const noteName = newKey.filePath
			  .split('/')
			  .pop()!
			  .replace(/\.md$/, '');
			const share = `${newKey.noteKey}:${newKey.apiKey}|${noteName}`;
			await navigator.clipboard.writeText(share);
  
			new Notice(`Key copied: ${share}`, 3000);
			this.display();
			await this.plugin.saveSettings();
			this.plugin.events.trigger('collaboration-key-updated');
		  })
	  );
  
	  // ========== Navigation buttons ==========
	  const nav = w.createDiv({ cls: 'settings-nav-buttons' });
	  Object.assign(nav.style, { display: 'flex', gap: '8px', marginTop: '8px' });
  
	  new ButtonComponent(nav)
		.setButtonText('Key List')
		.onClick(() => new KeyListModal(this.app, this.plugin).open());
  
	  new ButtonComponent(nav)
		.setButtonText('Link Note')
		.onClick(() => new LinkNoteModal(this.app, this.plugin).open());
	}
  }
  