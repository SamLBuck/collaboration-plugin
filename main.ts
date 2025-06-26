import { App, Plugin, Notice, TFile, MarkdownView, WorkspaceLeaf, WorkspaceSidedock } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';

// Utils
import { stripPersonalNoteBlocks } from './utils/stripPersonalNotes';
import { registerPersonalNotePostProcessor } from './utils/pnpp';
import { updatePersonalNoteLocations } from './utils/updatePersonalNoteLocations';
import { registerPullCommands } from './commands/pullCommands';
import { PluginSettingsTab } from './settings/plugin_setting_tab';

// Views & Types
import { CollaborationPanelView } from './views/CollaborationPanelView';
import { PersonalNotesView } from './views/PersonalNotesView';
import { COLLABORATION_VIEW_TYPE, PERSONAL_NOTES_VIEW_TYPE } from './constants/viewTypes';
import { registerCreateNoteCommand } from './commands/createNoteCommand';
import { registerTestWriteCommand } from './commands/testWriteCommand';


// Settings interface
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

export interface KeyItem {
  /** The unique identifier for the shared note */
  noteKey: string;
  /** The API key (x-api-key) that grants access to that note */
  apiKey: string;
  /** Human-friendly “access level” if you still need one (e.g. "Edit" | "View") */
  accessType: string;
  /** When this key was minted, for display/sorting */
  createdAt: number;
}

export interface MyPluginSettings {
  apiBaseUrl: string;
  /** The “master” noteKey you’re currently working on */
  noteKey: string;
  
  /** Your own collaborator ID */
  collabId: string;
  /** All of the keys you’ve created or been given */
  keys?: KeyItem[];
  personalNotes: PersonalNote[];
  /** The API key (optional, for backward compatibility) */
  apiKey?: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    apiBaseUrl: 'https://px2zhqk65h.execute-api.us-east-1.amazonaws.com',
    noteKey: 'test-note',        // any existing or dummy key
    apiKey:  'your-real-apiKey',  // paste the API key you got from a prior run
    collabId:'alice',
    keys: [],
    personalNotes: []
  };
  

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;
  private _debounceTimeout: NodeJS.Timeout;

  async onload() {

    registerCreateNoteCommand(this);
    registerTestWriteCommand(this);


    console.log('[Plugin] Loading collaboration plugin...');
    await this.loadSettings();

    // Register settings tab
    this.addSettingTab(new PluginSettingsTab(this.app, this));

    // Register views
    this.registerView(COLLABORATION_VIEW_TYPE, leaf => new CollaborationPanelView(leaf, this));
    this.registerView(PERSONAL_NOTES_VIEW_TYPE, leaf => new PersonalNotesView(leaf, this));

    // Ribbon icons
    this.addRibbonIcon('columns-3', 'Open Collaboration Panel', () => this.activateView(COLLABORATION_VIEW_TYPE));
    this.addRibbonIcon('file-user', 'Open Personal Notes', () => this.activateView(PERSONAL_NOTES_VIEW_TYPE));

    // Collaboration commands (HTTP-based)
    registerPullCommands(this);

    // Personal notes processing
    registerPersonalNotePostProcessor(this);
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) {
          this.updatePersonalLocations(file);
        }
      })
    );

    console.log('[Plugin] Collaboration plugin loaded.');
  }

  onunload() {
    console.log('[Plugin] Unloading collaboration plugin...');
    this.app.workspace.detachLeavesOfType(COLLABORATION_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(PERSONAL_NOTES_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  
  async saveSettings() {
    await this.saveData(this.settings);
    // Notify views for personal notes updates
    (this.app.workspace as any).trigger('plugin:personal-notes-updated');
  }

  private async activateView(viewType: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf;
    const existing = workspace.getLeavesOfType(viewType).find(l => l.parent instanceof WorkspaceSidedock);
    leaf = existing ?? workspace.getRightLeaf(false) ?? workspace.getUnpinnedLeaf();
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
  }

  private updatePersonalLocations(file: TFile) {
    if (file.extension !== 'md') return;
    if (this._debounceTimeout) clearTimeout(this._debounceTimeout);
    this._debounceTimeout = setTimeout(() => updatePersonalNoteLocations(this, file.path), 500);
  }
}
