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
import { createNote, fetchMaster, pushOffer, resolveMaster, testWrite } from './utils/api';
import { ReceivedPushConfirmation } from './settings/ReceivedPushConfirmation';



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
  noteKey: string;
    collabId: string;
  keys?: KeyItem[];
  personalNotes: PersonalNote[];
  apiKey?: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  apiBaseUrl: 'https://px2zhqk65h.execute-api.us-east-1.amazonaws.com',
  noteKey:    '',  // from curl POST /notes
  apiKey:     '',  // from curl POST /notes
  collabId:   'alice',
  keys:       [],
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
        const { apiBaseUrl, noteKey, apiKey } = this.settings;
        console.log(apiBaseUrl, noteKey, apiKey);
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
        const { apiBaseUrl, collabId } = this.settings;
        if (!apiBaseUrl || !collabId) {
          new Notice('Please configure API Base URL and your Collaborator ID in settings first.', 4000);
          return;
        }
        try {
          const { noteKey, apiKey } = await createNote(apiBaseUrl, collabId);
          // Store in settings for future pulls/pushes
          this.settings.noteKey = noteKey;
          this.settings.apiKey  = apiKey;
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
          if (!view) {
            new Notice('Open a Markdown file to push your offer.', 3000);
            return;
          }
          if (!view.file) {
            new Notice('No file is currently open.', 3000);
            return;
          }
          const content = await this.app.vault.read(view.file);
          const { apiBaseUrl, noteKey, apiKey, collabId } = this.settings;
          try {
            if (!apiBaseUrl || !noteKey || !apiKey || !collabId) {
              new Notice('Missing required settings (apiBaseUrl, noteKey, apiKey, collabId). Please check your configuration.', 4000);
              return;
            }
            await pushOffer(apiBaseUrl, noteKey, apiKey, collabId, content);
            new Notice('Offer pushed successfully.', 3000);
          } catch (err) {
            console.error('[Push] Error pushing offer:', err);
            new Notice(`Failed to push offer: ${err.message}`, 4000);
          }
        }
      });

      this.addCommand({
        id: 'test-write-to-dynamo',
        name: 'Test Write to DynamoDB',
        callback: async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) {
            return new Notice('Open a Markdown file to test-write its text.', 3000);
          }
          if (!view.file) {
            new Notice('No file is currently open.', 3000);
            return;
          }
          const content = await this.app.vault.read(view.file);
          try {
            const { apiBaseUrl, noteKey, apiKey } = this.settings;
            if (!apiKey) {
              new Notice('API Key is not configured. Please set it in the plugin settings.', 4000);
              return;
            }
            await testWrite(
              apiBaseUrl,
              noteKey,
              apiKey,
              content.slice(0, 1000) // limit size
            );
            new Notice('Wrote test record to DynamoDB!', 3000);
          } catch (e:any) {
            new Notice('testWrite error: ' + e.message, 5000);
          }
        }
      });
      this.addCommand({
        id: 'make-current-master',
        name: 'Promote current note as master',
        callback: async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || !view.file) {
            return new Notice('Open a Markdown file to promote as master.', 3000);
          }
          const content = await this.app.vault.read(view.file);
          const { apiBaseUrl, collabId } = this.settings;
          // pick active key
          const { noteKey, apiKey } = this.settings;
          if (!apiBaseUrl || !noteKey || !apiKey || !collabId) {
            return new Notice('Missing settings; cannot resolve master.', 4000);
          }
          try {
            await resolveMaster(apiBaseUrl, noteKey, apiKey, collabId, content);
            new Notice('Current note promoted to master', 3000);
          } catch (err:any) {
            console.error('[MakeMaster]', err);
            new Notice(`Failed to promote master: ${err.message}`, 5000);
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
    if (!this.settings.apiKey || !this.settings.noteKey) {
      try {
        const { noteKey, apiKey } = await createNote(
          this.settings.apiBaseUrl,
          this.settings.collabId
        );
        this.settings.noteKey = noteKey;
        this.settings.apiKey  = apiKey;
        await this.saveSettings();
        new Notice('Created new collaboration note');
      } catch (err) {
        console.error('Failed to bootstrap note:', err);
        new Notice('Could not create note—check your API');
      }
    }
  }
  
  
}

