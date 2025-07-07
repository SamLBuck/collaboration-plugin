import { App, Plugin, Notice, TFile, MarkdownView, WorkspaceLeaf, WorkspaceSidedock, Events } from 'obsidian';

// Utils
import { stripPersonalNoteBlocks } from './utils/stripPersonalNotes';
import { registerPersonalNotePostProcessor } from './utils/pnpp';
import { updatePersonalNoteLocations } from './utils/updatePersonalNoteLocations';
import { PluginSettingsTab } from './settings/plugin_setting_tab';

// Views & Types
import { CollaborationPanelView } from './views/CollaborationPanelView';
import { PersonalNotesView } from './views/PersonalNotesView';
import { COLLABORATION_VIEW_TYPE, PERSONAL_NOTES_VIEW_TYPE } from './constants/viewTypes';
import { createNote, fetchMaster, getOffers, pushOffer, resolveMaster, testWrite } from './utils/api';
import { ReceivedPushConfirmation } from './settings/ReceivedPushConfirmation';
import { ResolveConfirmation } from './settings/ResolveConfirmation';
import { ImportNoteModal } from './views/ImportNoteModal';



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
  noteKey: string;
  apiKey: string;
  filePath:  string;            // which file this key is bound to
}

export interface MyPluginSettings {
  apiBaseUrl:   string;
  collabId:     string;
  keys:         KeyItem[];      // ← now required
  linkedKeys:  KeyItem[]; //
  activeKey?:   string;         // ← noteKey of the “current” one
  personalNotes: PersonalNote[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  apiBaseUrl:    'https://px2zhqk65h.execute-api.us-east-1.amazonaws.com',
  collabId:      '',
  keys:          [],
  linkedKeys:    [],
  activeKey:     undefined,
  personalNotes: []
};
  


export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;
  private _debounceTimeout: NodeJS.Timeout;
  events = new Events();  // <-- add this line


  async onload() {

    console.log('[Plugin] Loading collaboration plugin...');
    await this.loadSettings();
    await this.ensureNoteCredentials();


    // Register settings tab
    this.addSettingTab(new PluginSettingsTab(this.app, this));

    // Register views
    this.registerView(COLLABORATION_VIEW_TYPE, leaf => new CollaborationPanelView(leaf, this));
    this.registerView(PERSONAL_NOTES_VIEW_TYPE, leaf => new PersonalNotesView(leaf, this));

    // Ribbon icons
    this.addRibbonIcon('columns-3', 'Open Collaboration Panel', () => this.activateView(COLLABORATION_VIEW_TYPE));
    this.addRibbonIcon('file-user', 'Open Personal Notes', () => this.activateView(PERSONAL_NOTES_VIEW_TYPE));
    // Personal notes processing
    registerPersonalNotePostProcessor(this);
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) {
          this.updatePersonalLocations(file);
        }
      })
    );
    this.addCommand({
      id: 'pull-master-note',
      name: 'Pull master note from server',
      callback: () => this.pullMasterNote()
    });
    this.addCommand({
      id: 'create-collab-note',
      name: 'Create Collaboration Note',
      callback: () => this.createCollabNote()
    });
        
    this.addCommand({
      id: 'push-offer',
      name: 'Push Offer to Server',
      callback: () => this.pushOfferToServer()
    });

    this.addCommand({
      id: 'make-current-master',
      name: 'Promote current note as master',
      callback: () => this.promoteCurrentNoteAsMaster()
    });

    this.addCommand({
      id: 'import-collab-note',
      name: 'Import Collaboration Note by Key',
      callback: () => this.openImportCollabModal()
    });
    
    this.addCommand({
      id: 'activate-current-file-note',
      name: 'Activate Collaboration Note for Current File',
      callback: () => this.activateCurrentFileNote()
    });
    
    this.addCommand({
      id: 'clear-all-collab-keys',
      name: 'Clear All Collaboration Keys',
      callback: () => this.clearAllCollabKeys()
    });  

      this.addCommand({
        id: 'unbind-current-file-collab-key',
        name: 'Unbind Collaboration Key from Current File',
        callback: () => this.unbindCurrentFileCollabKey()
      });
      
      this.addCommand({
        id: 'resolve-master-note',
        name: 'Merge & Publish Master from Offers',
        callback: () => this.resolveMasterNote()
      });
      
      this.addCommand({
        id: 'copy-active-note-key',
        name: 'Copy Active Collaboration Note Key',
        callback: () => this.copyActiveNoteKey()
      });

      this.addCommand({
        id: 'copy-active-api-key',
        name: 'Copy API Key for Active Collaboration Note',
        callback: () => this.copyActiveApiKey()
      });

      this.registerEvent(
        this.app.vault.on('modify', async (file) => {
          if (!(file instanceof TFile)) return;
      
          // See if this file has a bound KeyItem
          const keyItem = this.settings.keys.find(k => k.filePath === file.path);
          if (keyItem && this.settings.activeKey !== keyItem.noteKey) {
            // Update activeKey & persist
            this.settings.activeKey = keyItem.noteKey;
            await this.saveSettings();
            console.log(`[Collab] activeKey set to ${keyItem.noteKey} on modify of ${file.path}`);
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

  public async activateView(viewType: string) {
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

  private async ensureNoteCredentials() {
    const { keys, apiBaseUrl, collabId } = this.settings;
    if (keys.length === 0) {
      try {
        // 1) Create a new note remotely
        const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
  
        // 2) Try to bind to the current Markdown file
        let filePath = '';
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (leaf?.view instanceof MarkdownView && leaf.view.file) {
          filePath = leaf.view.file.path;
        }
  
        // 3) Build & save the KeyItem
        const first: KeyItem = {
          noteKey,
          apiKey,
          filePath,
        };
        keys.push(first);
        this.settings.activeKey = noteKey;
        await this.saveSettings();
  
        new Notice(
          filePath
            ? `Bootstrapped note ${noteKey} bound to ${filePath}`
            : `Bootstrapped note ${noteKey} (no file bound)`
        );
      } catch (err: any) {
        console.error('[Bootstrap]', err);
        new Notice('Could not create initial note—check your API settings', 4000);
      }
    }
  }
  
  private getKeyForCurrentFile(): KeyItem | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return null;
    return (
      this.settings.keys.find(k => view.file && k.filePath === view.file.path) ??
      null
    );
  }
  
    
  
  public async pullMasterNote(): Promise<void> {
    // find the active key
    const active = this.settings.keys.find(k => k.noteKey === this.settings.activeKey);
    if (!active) {
      new Notice('No active collaboration note! Please import or select one.');
      return;
    }
  
    const { noteKey, apiKey } = active;
    const { apiBaseUrl } = this.settings;
    if (!apiBaseUrl) {
      new Notice('Missing API base URL in settings.');
      return;
    }
  
    new Notice('Fetching master note…');
    let remote: string;
    try {
      remote = await fetchMaster(apiBaseUrl, noteKey, apiKey);
    } catch (err: any) {
      console.error('[Pull] fetch error', err);
      new Notice(`Pull failed: ${err.message}`);
      return;
    }
  
    // grab the current leaf & file
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!(leaf?.view instanceof MarkdownView) || !leaf.view.file) {
      new Notice('Please focus a Markdown note to pull into.');
      return;
    }
    const file = leaf.view.file;
    const current = await this.app.vault.read(file);
  
    // if it’s different, prompt & write
    if (current !== remote) {
      new ReceivedPushConfirmation(
        this.app,
        'A newer version was found on the server. Overwrite your local copy?',
        current,
        remote,
        async (confirmed: boolean) => {
          if (confirmed) {
            try {
              await this.app.vault.modify(file, remote);
              new Notice('Master note updated');
            } catch (e) {
              console.error('Error updating note:', e);
              new Notice('Failed to update note');
            }
          } else {
            new Notice('Kept your local version');
          }
        }
      ).open();
    } else {
      new Notice('Already up to date');
    }
  }
  public async createCollabNoteWithFile(targetFile?: TFile): Promise<KeyItem|void> {
    const { apiBaseUrl, collabId, keys } = this.settings;
    if (!apiBaseUrl || !collabId) {
      new Notice('Please configure API Base URL and your Collaborator ID first.', 4000);
      return;
    }
  
    // 1) Figure out which file to bind
    let file: TFile | undefined;
    if (targetFile) {
      file = targetFile;
    } else {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      file = view?.file ?? undefined;
    }
  
    if (!file) {
      new Notice('Open—or pass in—a Markdown file to bind your new collaboration note to.', 4000);
      return;
    }
    const filePath = file.path;
  
    try {
      // 2) Create the note on the server
      const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
  
      // 3) Bind locally & save
      const keyItem: KeyItem = { noteKey, apiKey, filePath };
      keys.push(keyItem);
      this.settings.activeKey = noteKey;
      await this.saveSettings();
  
      // 4) Push current file as master
      const content = await this.app.vault.read(file);
      await resolveMaster(apiBaseUrl, noteKey, apiKey, collabId, content);
  
      new Notice(`Created & promoted master: ${file.basename} → ${noteKey}`, 5000);
      return keyItem;
    } catch (err: any) {
      console.error('[CreateNote] Error:', err);
      new Notice(`Failed to create or push master: ${err.message}`, 5000);
    }
  }
  
  public async createCollabNote(): Promise<KeyItem | void> {
    const { apiBaseUrl, collabId, keys } = this.settings;
    if (!apiBaseUrl || !collabId) {
      new Notice('Please configure API Base URL and your Collaborator ID first.', 4000);
      return;
    }
  
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('Open a Markdown file to bind your new collaboration note to.', 4000);
      return;
    }
    const filePath = view.file.path;
  
    try {
      //  Create the note on the server
      const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
      //Bind locally
      const keyItem: KeyItem = { noteKey, apiKey, filePath };
      keys.push(keyItem);
      this.settings.activeKey = noteKey;
      await this.saveSettings();
      //  Push current file as master
      const content = await this.app.vault.read(view.file);
      await resolveMaster(apiBaseUrl, noteKey, apiKey, collabId, content);

      new Notice(`Created & promoted master: ${view.file.basename} → ${noteKey}`, 5000);
      //  Return the KeyItem so UI can use it immediately
      return keyItem;
    } catch (err: any) {
      console.error('[CreateNote] Error:', err);
      new Notice(`Failed to create or push master: ${err.message}`, 5000);
    }
  }
// In your main plugin class:

public async pushOfferToServer(): Promise<void> {
  const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
  if (!apiBaseUrl || !collabId || !keys.length || !activeKey) {
    new Notice('Missing required settings. Please check your configuration.', 4000);
    return;
  }
  // 1) Find the bound KeyItem
  const activeItem = keys.find(k => k.noteKey === activeKey);
  if (!activeItem) {
    new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
    return;
  }
  // 2) Grab the TFile via its stored path
  const file = this.app.vault.getAbstractFileByPath(activeItem.filePath);
  if (!(file instanceof TFile)) {
    new Notice(`Could not locate file at ${activeItem.filePath}`, 3000);
    return;
  }
  // 3) Read its contents
  const content = await this.app.vault.read(file);

  // 4) Push the offer
  try {
    await pushOffer(
      apiBaseUrl,
      activeItem.noteKey,
      activeItem.apiKey,
      collabId,
      content
    );
    new Notice('Changes sent successfully.', 3000);
  } catch (e: any) {
    console.error('[Push] Error pushing offer:', e);
    new Notice(`Failed to push offer: ${e.message}`, 4000);
  }
}

public async promoteCurrentNoteAsMaster(): Promise<void> {
  const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
  if (!apiBaseUrl || !collabId || !keys.length || !activeKey) {
    new Notice('Missing settings; cannot promote master.', 4000);
    return;
  }
  // 1) Find the KeyItem
  const activeItem = keys.find(k => k.noteKey === activeKey);
  if (!activeItem) {
    new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
    return;
  }
  // 2) Load the file
  const file = this.app.vault.getAbstractFileByPath(activeItem.filePath);
  if (!(file instanceof TFile)) {
    new Notice(`Could not locate file at ${activeItem.filePath}`, 3000);
    return;
  }
  // 3) Read its content
  const content = await this.app.vault.read(file);

  // 4) Promote to master
  try {
    await resolveMaster(
      apiBaseUrl,
      activeItem.noteKey,
      activeItem.apiKey,
      collabId,
      content
    );
    new Notice('Current note promoted to master', 3000);
  } catch (err: any) {
    console.error('[MakeMaster]', err);
    new Notice(`Failed to promote master: ${err.message}`, 5000);
  }
}
  public async unbindCurrentFileCollabKey(): Promise<void> {
    // Ensure a file is open
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('Open a Markdown file first.', 3000);
      return;
    }
    // Filter out any KeyItem bound to this file
    const filePath = view.file.path;
    const beforeCount = this.settings.keys.length;
    this.settings.keys = this.settings.keys.filter(k => k.filePath !== filePath);
    // If the removed key was the activeKey, clear it
    const stillBound = this.settings.keys.some(k => k.filePath === filePath);
    if (this.settings.activeKey && !stillBound) {
      this.settings.activeKey = undefined;
    }
    // Notify if nothing changed
    if (this.settings.keys.length === beforeCount) {
      new Notice(`No collaboration key was bound to ${view.file.name}.`, 3000);
      return;
    }
    // Persist and confirm
    await this.saveSettings();
    new Notice(`Unbound collaboration key from ${view.file.name}`, 3000);
  }
  
  public async resolveMasterNote(): Promise<void> {
    const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
    // Guard required settings
    if (!apiBaseUrl || !collabId || !keys.length || !activeKey) {
      new Notice('Missing settings; cannot resolve master.', 4000);
      return;
    }
    // Find the active KeyItem
    const activeItem = keys.find(k => k.noteKey === activeKey);
    if (!activeItem) {
      new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
      return;
    }
    const { noteKey, apiKey } = activeItem;
    //Fetch the current master
    let current: string;
    try {
      current = await fetchMaster(apiBaseUrl, noteKey, apiKey);
    } catch (err: any) {
      console.error('[Resolve] fetchMaster failed', err);
      new Notice(`Failed to fetch master: ${err.message}`, 5000);
      return;
    }
    //Fetch all offers
    let offersArr: { content: string }[];
    try {
      offersArr = await getOffers(apiBaseUrl, noteKey, apiKey);
    } catch (err: any) {
      console.error('[Resolve] getOffers failed', err);
      new Notice(`Failed to fetch offers: ${err.message}`, 5000);
      return;
    }
    if (!offersArr.length) {
      new Notice('No offers to merge.', 3000);
      return;
    }
    new ResolveConfirmation(
      this.app,
      'Review each offer and choose what to accept:',
      current,
      offersArr.map(o => o.content),
      async (mergedContent: string) => {
        try {
          await resolveMaster(apiBaseUrl, noteKey, apiKey, collabId, mergedContent);
          new Notice('Master resolved with your selections', 3000);
        } catch (err: any) {
          console.error('[Resolve] resolveMaster failed', err);
          new Notice(`Failed to publish master: ${err.message}`, 5000);
        }
      }
    ).open();
  }

  public async copyActiveNoteKey(): Promise<void> {
    const { activeKey } = this.settings;
    if (!activeKey) {
      new Notice('No active collaboration note key set.', 4000);
      return;
    }
    try {
      await navigator.clipboard.writeText(activeKey);
      new Notice(`Copied noteKey to clipboard: ${activeKey}`, 2000);
    } catch (err) {
      console.error('[CopyKey] Clipboard write failed', err);
      new Notice('Failed to copy noteKey to clipboard.', 4000);
    }
  }
  /** Opens the modal to import a note key & API key */
public openImportCollabModal(): void {
  new ImportNoteModal(this.app, (noteKey: string, apiKey: string) => {
    this.handleImportCollabNote(noteKey, apiKey);
  }).open();
}
/** Called when the user submits a noteKey & apiKey from the modal */
public async handleImportCollabNote(noteKey: string, apiKey: string): Promise<void> {
  // prevent duplicates
  if (this.settings.keys.some(k => k.noteKey === noteKey)) {
    new Notice('That note is already imported');
    return;
  }
  // ensure a Markdown file is open
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) {
    new Notice('Open a Markdown file to bind your new collaboration note to.', 4000);
    return;
  }
  const filePath = view.file.path;
  // store and activate
  this.settings.keys.push({ noteKey, apiKey, filePath });
  this.settings.activeKey = noteKey;
  await this.saveSettings();

  new Notice(`Imported and activated note ${noteKey}`, 3000);
}

public async copyActiveApiKey(): Promise<void> {
  const { activeKey, keys } = this.settings;
  if (!activeKey) {
    new Notice('No active collaboration note key set.', 4000);
    return;
  }
  const activeItem = keys.find(k => k.noteKey === activeKey);
  if (!activeItem) {
    new Notice(
      `Active noteKey (“${activeKey}”) not found in imported keys.`,
      4000
    );
    return;
  }
  try {
    await navigator.clipboard.writeText(activeItem.apiKey);
    new Notice(`Copied apiKey to clipboard: ${activeItem.apiKey}`, 2000);
  } catch (err) {
    console.error('[CopyAPI] Clipboard write failed', err);
    new Notice('Failed to copy apiKey to clipboard.', 4000);
  }
}

public async activateCurrentFileNote(): Promise<void> {
  // Ensure a Markdown file is open
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) {
    new Notice('Open a Markdown file first.', 3000);
    return;
  }
  // Find the KeyItem bound to this file
  const filePath = view.file.path;
  const activeItem = this.settings.keys.find(k => k.filePath === filePath);
  if (!activeItem) {
    new Notice(
      `No collaboration note bound to "${view.file.name}". Pull or create one here first.`,
      4000
    );
    return;
  }
  // Flip the global activeKey and persist
  this.settings.activeKey = activeItem.noteKey;
  await this.saveSettings();
  new Notice(
    `Activated note ${activeItem.noteKey} for ${view.file.name}`,
    2000
  );
}

public async clearAllCollabKeys(): Promise<void> {
  this.settings.keys = [];
  this.settings.activeKey = undefined;
  await this.saveSettings();
  new Notice('All collaboration keys cleared.', 3000);
}


}

