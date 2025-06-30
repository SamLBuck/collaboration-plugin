import { SuggestModal, Notice, Modal, App } from 'obsidian';
import type MyPlugin from '../main';

// 1) Create a SuggestModal subclass
export class NoteKeyPickerModal extends Modal {
  plugin: MyPlugin;
  constructor(app: App, plugin: MyPlugin) {
    super(app);
    this.plugin = plugin;
  }

  // list all noteKeys
  getItems(): string[] {
    return this.plugin.settings.keys.map(k => k.noteKey);
  }

  // what to show in the dropdown
  getItemText(item: string): string {
    return item;
  }

  // when they pick one
  async onChooseItem(item: string): Promise<void> {
    this.plugin.settings.activeKey = item;
    await this.plugin.saveSettings();
    new Notice(`Activated collaboration note: ${item}`, 2000);
  }
}

