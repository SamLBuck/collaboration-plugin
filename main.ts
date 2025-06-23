import {
    App,
    Plugin,
    Notice,
    TFile,
    MarkdownView,
    WorkspaceLeaf,
    WorkspaceSidedock,
  } from 'obsidian';
  
  import { v4 as uuidv4 } from 'uuid';
  import { stripPersonalNoteBlocks } from './utils/stripPersonalNotes';
  import { registerPersonalNotePostProcessor } from './utils/pnpp';
  import { updatePersonalNoteLocations } from './utils/updatePersonalNoteLocations';
  
  // Views & Commands
  import { CollaborationPanelView } from './views/CollaborationPanelView';
  import { PersonalNotesView } from './views/PersonalNotesView';
  import { COLLABORATION_VIEW_TYPE, PERSONAL_NOTES_VIEW_TYPE } from './constants/viewTypes';
  
  interface MyPluginSettings {
    apiBaseUrl: string;        // AWS API Gateway base URL
    noteKey: string;          // Shared note identifier
    apiKey: string;           // x-api-key header value
    collabId: string;         // Unique ID for this collaborator
    personalNotes: PersonalNote[];
  }
  
  const DEFAULT_SETTINGS: MyPluginSettings = {
    apiBaseUrl: '',
    noteKey: '',
    apiKey: '',
    collabId: '',
    personalNotes: []
  };
  
  // Personal Note model
  interface PersonalNote {
    id: string;
    targetFilePath: string;
    lineNumber: number;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    isExpanded: boolean;
  }
  
  export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    private _debounceTimeout: NodeJS.Timeout;
  
    async onload() {
      await this.loadSettings();
      // Register views
      this.registerView(COLLABORATION_VIEW_TYPE, leaf => new CollaborationPanelView(leaf, this));
      this.registerView(PERSONAL_NOTES_VIEW_TYPE, leaf => new PersonalNotesView(leaf, this));
  
      // Ribbon icons
      this.addRibbonIcon('columns-3', 'Open Collaboration Panel', () => this.activateView(COLLABORATION_VIEW_TYPE));
      this.addRibbonIcon('file-user', 'Open Personal Notes', () => this.activateView(PERSONAL_NOTES_VIEW_TYPE));
  
      // Register fetch/push/resolve commands
      this.addCommand({
        id: 'pull-master',
        name: 'Pull Master Note',
        callback: async () => {
          try {
            const content = await this.fetchMaster();
            new Notice('Master content fetched, check console.');
            console.log('Master:', content);
          } catch (e) {
            new Notice('Failed to pull master: ' + e.message, 4000);
          }
        }
      });
  
      this.addCommand({
        id: 'push-offer',
        name: 'Push Offer',
        callback: async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) { new Notice('Open a Markdown file to offer changes',4000); return; }
          const content = await this.app.vault.read(view.file);
          try {
            await this.pushOffer(content);
            new Notice('Offer pushed successfully');
          } catch (e) {
            new Notice('Failed to push offer: ' + e.message,4000);
          }
        }
      });
      addCommand({
        id: 'resolve-master',
        name: 'Resolve Master Note',
        callback: () => {
          // Open collaboration panel for manual resolve
          activateView(COLLABORATION_VIEW_TYPE);
        }
      });
    
  
      this.addCommand({
        id: 'resolve-master',
        name: 'Resolve Master from Offers',
        callback: async () => {
          // Show resolve UI in CollaborationPanelView
          this.activateView(COLLABORATION_VIEW_TYPE);
        }
      });
  
      // Personal notes handlers
      registerPersonalNotePostProcessor(this);
      this.registerEvent(this.app.vault.on('modify', file => this.updatePersonalLocations(file)));
  
    }
  
    onunload() {
      this.app.workspace.detachLeavesOfType(COLLABORATION_VIEW_TYPE);
      this.app.workspace.detachLeavesOfType(PERSONAL_NOTES_VIEW_TYPE);
    }
  
    async loadSettings() {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
  
    async saveSettings() {
      await this.saveData(this.settings);
      (this.app.workspace as any).trigger('plugin:personal-notes-updated');
    }
  
    // HTTP helpers
    private async fetchMaster(): Promise<string> {
      const url = `${this.settings.apiBaseUrl}/notes/${encodeURIComponent(this.settings.noteKey)}/master`;
      const resp = await fetch(url, { headers: { 'x-api-key': this.settings.apiKey } });
      if (!resp.ok) throw new Error(resp.statusText);
      const { content } = await resp.json();
      return content;
    }
  
    private async pushOffer(content: string): Promise<void> {
      const url = `${this.settings.apiBaseUrl}/notes/${encodeURIComponent(this.settings.noteKey)}/offer/${encodeURIComponent(this.settings.collabId)}`;
      const resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.settings.apiKey },
        body: JSON.stringify({ content })
      });
      if (!resp.ok) throw new Error(resp.statusText);
    }
  
    private async resolveMaster(mergedContent: string): Promise<void> {
      const url = `${this.settings.apiBaseUrl}/notes/${encodeURIComponent(this.settings.noteKey)}/resolve`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.settings.apiKey },
        body: JSON.stringify({ mergedContent, resolverId: this.settings.collabId })
      });
      if (!resp.ok) throw new Error(resp.statusText);
    }
  
    // Sidebar activation
    private async activateView(viewType: string) {
      const { workspace } = this.app;
      let leaf: WorkspaceLeaf;
      const existing = workspace.getLeavesOfType(viewType).find(l => l.parent instanceof WorkspaceSidedock);
      leaf = existing ?? (workspace.getRightLeaf(false) ?? workspace.createLeafBySplit(workspace.getLeavesOfType(viewType)[0], 'horizontal'));
      await leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
    }
  
    // Debounced personal note updates
    private updatePersonalLocations(file: TFile) {
      if (file.extension !== 'md') return;
      if (this._debounceTimeout) clearTimeout(this._debounceTimeout);
      this._debounceTimeout = setTimeout(() => updatePersonalNoteLocations(this, file.path), 500);
    }
  }
  