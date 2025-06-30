import { App, Plugin, Notice, TFile, MarkdownView, WorkspaceLeaf, WorkspaceSidedock } from 'obsidian';

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
import { NoteKeyPickerModal } from './views/NoteKeyPickerModal';



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
}

export interface MyPluginSettings {
  apiBaseUrl:   string;
  collabId:     string;
  keys:         KeyItem[];      // ← now required
  activeKey?:   string;         // ← noteKey of the “current” one
  personalNotes: PersonalNote[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  apiBaseUrl:    'https://…',
  collabId:      'alice',
  keys:          [],
  activeKey:     undefined,
  personalNotes: []
};
  


export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;
  private _debounceTimeout: NodeJS.Timeout;

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
      callback: async () => {
        const active = this.settings.keys.find(k => k.noteKey === this.settings.activeKey);
        if (!active) {
          return new Notice('No active collaboration note! Please import or select one.');
        }
        const { noteKey, apiKey } = active;
        const { apiBaseUrl } = this.settings;
                console.log(noteKey, apiKey);
        if (!noteKey || !apiKey) {
          return new Notice('No noteKey/apiKey—please restart to bootstrap.');
        }
    
        new Notice('Fetching master note…');
        let remote: string;
        try {
          remote = await fetchMaster(apiBaseUrl, noteKey, apiKey);
        } catch (err) {
          console.error('[Pull] fetch error', err);
          return new Notice(`Pull failed: ${err.message}`);
        }
    
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!(leaf?.view instanceof MarkdownView)) {
          return new Notice('Please focus a Markdown note to pull into.');
        }
        const file = leaf.view.file;
        if (!file) {
          return new Notice('No file found to read.');
        }
        const current = await this.app.vault.read(file);
    
        // If there’s a diff, show the modal
        if (current !== remote) {
          new ReceivedPushConfirmation(
            this.app,
            'A newer version was found on the server. Overwrite your local copy?',
            current,
            remote,
            (confirmed: boolean) => {
              if (confirmed) {
                if(file) {
                this.app.vault.modify(file, remote).then(() => {
                  new Notice('Master note updated');
                }).catch(err => {
                  console.error('Error updating note:', err);
                  new Notice('Failed to update note');
                });
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
    });
    this.addCommand({
      id: 'create-collab-note',
      name: 'Create Collaboration Note',
      callback: async () => {
        const { apiBaseUrl, collabId, keys } = this.settings;
    
        if (!apiBaseUrl || !collabId) {
          new Notice(
            'Please configure API Base URL and your Collaborator ID in settings first.',
            4000
          );
          return;
        }
    
        try {
          const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
    
          const keyItem: KeyItem = {
            noteKey,
            apiKey,
          };
    
          keys.push(keyItem);
          this.settings.activeKey = noteKey;
          await this.saveSettings();
    
          new Notice(`New collaboration note created! Key: ${noteKey}`, 5000);
        } catch (err: any) {
          console.error('[CreateNote] Error:', err);
          new Notice(`Failed to create note: ${err.message}`, 5000);
        }
      }
    });
    
    this.addCommand({
      id: 'push-offer',
      name: 'Push Offer to Server',
      callback: async () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) {
          new Notice('Open a Markdown file to push your offer.', 3000);
          return;
        }
        const content = await this.app.vault.read(view.file);
        const { apiBaseUrl, keys, collabId, activeKey } = this.settings;
    
        if (!apiBaseUrl || !keys.length || !activeKey || !collabId) {
          new Notice('Missing required settings. Please check your configuration.', 4000);
          return;
        }
    
        const activeItem = keys.find(k => k.noteKey === activeKey);
        if (!activeItem) {
          new Notice(`Couldn’t find imported key “${activeKey}” in your settings.`, 4000);
          return;
        }
    
        try {
          await pushOffer(
            apiBaseUrl,
            activeItem.noteKey,
            activeItem.apiKey,
            collabId,
            content
          );
          new Notice('Offer pushed successfully.', 3000);
        } catch (e: any) {
          console.error('[Push] Error pushing offer:', e);
          new Notice(`Failed to push offer: ${e.message}`, 4000);
        }
      }
    });
      this.addCommand({
        id: 'make-current-master',
        name: 'Promote current note as master',
        callback: async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view?.file) {
            return new Notice('Open a Markdown file to promote as master.', 3000);
          }
      
          const content = await this.app.vault.read(view.file);
          const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
      
          if (!apiBaseUrl || !collabId || !keys.length || !activeKey) {
            return new Notice('Missing settings; cannot promote master.', 4000);
          }
      
          const activeItem = keys.find(k => k.noteKey === activeKey);
          if (!activeItem) {
            return new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
          }
      
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
      });
      
      
      this.addCommand({
        id: 'make-current-master',
        name: 'Promote current note as master',
        callback: async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view?.file) {
            return new Notice('Open a Markdown file to promote as master.', 3000);
          }
      
          const content = await this.app.vault.read(view.file);
          const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
      
          if (!apiBaseUrl || !keys.length || !activeKey || !collabId) {
            return new Notice('Missing settings; cannot promote master.', 4000);
          }
      
          const activeItem = keys.find(k => k.noteKey === activeKey);
          if (!activeItem) {
            return new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
          }
      
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
      });
            this.addCommand({
        id: 'import-collab-note',
        name: 'Import Collaboration Note by Key',
        callback: () => {
          new ImportNoteModal(this.app, async (noteKey, apiKey) => {
            // prevent duplicates
            if ((this.settings.keys ?? []).some(k => k.noteKey === noteKey)) {
              new Notice('That note is already imported');
              return;
            }
            this.settings.keys.push({
              noteKey,
              apiKey,
            });
            this.settings.activeKey = noteKey;
            await this.saveSettings();
            new Notice(`Imported and activated note ${noteKey}`, 3000);
          }).open();
        }
      });

      this.addCommand({
        id: 'resolve-master-note',
        name: 'Merge & Publish Master from Offers',
        callback: async () => {
          const { apiBaseUrl, collabId, keys, activeKey } = this.settings;
      
          if (!apiBaseUrl || !collabId || !keys.length || !activeKey) {
            return new Notice('Missing settings; cannot resolve master.', 4000);
          }
      
          // find the active KeyItem
          const activeItem = keys.find(k => k.noteKey === activeKey);
          if (!activeItem) {
            return new Notice(`Couldn’t find imported key “${activeKey}”.`, 4000);
          }
          const { noteKey, apiKey } = activeItem;
      
          // fetch current master
          let current: string;
          try {
            current = await fetchMaster(apiBaseUrl, noteKey, apiKey);
          } catch (err: any) {
            console.error('[Resolve] fetchMaster failed', err);
            return new Notice(`Failed to fetch master: ${err.message}`, 5000);
          }
      
          // fetch all offers
          let offersArr: { content: string }[];
          try {
            offersArr = await getOffers(apiBaseUrl, noteKey, apiKey);
          } catch (err: any) {
            console.error('[Resolve] getOffers failed', err);
            return new Notice(`Failed to fetch offers: ${err.message}`, 5000);
          }
      
          if (!offersArr.length) {
            return new Notice('No offers to merge.', 3000);
          }
      
          // open the multi‐offer modal
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
      });


      // does not work 
      this.addCommand({
        id: 'activate-note-from-current-file',
        name: 'Use Current File as Collaboration Note',
        callback: async () => {
          // 1) Make sure user has a note open
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view?.file) {
            return new Notice('Open a Markdown file to activate its note key.', 3000);
          }
      
          // 2) Derive the candidate key from the file name
          //    (e.g. if the file is "abc123.md", candidateKey = "abc123")
          const candidateKey = view.file.basename;
      
          // 3) Find that key in your imported list
          const match = this.settings.keys.find(k => k.noteKey === candidateKey);
          if (!match) {
            return new Notice(
              `No collaboration note with key "${candidateKey}" found in settings.`,
              3000
            );
          }
      
          // 4) Set it active and persist
          this.settings.activeKey = candidateKey;
          await this.saveSettings();
          new Notice(`Activated collaboration note: ${candidateKey}`, 2000);
        }
      });
      this.addCommand({
        id: 'copy-active-note-key',
        name: 'Copy Active Collaboration Note Key',
        callback: async () => {
          const { activeKey } = this.settings;
          if (!activeKey) {
            return new Notice('No active collaboration note key set.', 4000);
          }
          try {
            await navigator.clipboard.writeText(activeKey);
            new Notice(`Copied noteKey to clipboard: ${activeKey}`, 2000);
          } catch (err) {
            console.error('[CopyKey] Clipboard write failed', err);
            new Notice('Failed to copy noteKey to clipboard.', 4000);
          }
        }
      });
      
      // Copy apiKey for activeKey to clipboard
      this.addCommand({
        id: 'copy-active-api-key',
        name: 'Copy API Key for Active Collaboration Note',
        callback: async () => {
          const { activeKey, keys } = this.settings;
          if (!activeKey) {
            return new Notice('No active collaboration note key set.', 4000);
          }
          const activeItem = keys.find(k => k.noteKey === activeKey);
          if (!activeItem) {
            return new Notice(
              `Active noteKey (“${activeKey}”) not found in imported keys.`,
              4000
            );
          }
          try {
            await navigator.clipboard.writeText(activeItem.apiKey);
            new Notice(`Copied apiKey to clipboard ${activeItem.apiKey}`, 2000);
          } catch (err) {
            console.error('[CopyAPI] Clipboard write failed', err);
            new Notice('Failed to copy apiKey to clipboard.', 4000);
          }
        }
      });
            
      
                  
            
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

  private async ensureNoteCredentials() {
    const { keys, apiBaseUrl, collabId } = this.settings;
    // if we haven't imported/created any notes yet, create one
    if (!keys.length) {
      try {
        const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
        const first: KeyItem = { noteKey, apiKey };
        this.settings.keys.push(first);
        this.settings.activeKey = noteKey;
        await this.saveSettings();
        new Notice('Bootstrapped your first collaboration note');
      } catch (err) {
        console.error('[Bootstrap]', err);
        new Notice('Could not create initial note—check your API settings');
      }
    }
  }
    
  
}

