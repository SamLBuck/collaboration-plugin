import { App, TFile, Notice, Modal } from "obsidian";
import { updateNoteRegistry, deleteNoteFromRegistry } from "../../storage/registryStore";
import { requestNoteFromPeer, registerNoteWithPeer } from "./client";

import type MyPlugin from "../../main";
import { PullConfirmationModal } from "../../settings/pull_confirmation_modal";
import { ConfirmationModal } from "../../settings/key_list_page02";
import { ReceivedPushConfirmation } from "../../settings/ReceivedPushConfirmation";


export class NoteManager {
    private plugin: MyPlugin;
	private serverUrl: string;

    constructor(plugin: MyPlugin, serverUrl: string) {
        this.plugin = plugin;
        this.serverUrl = serverUrl;
    }

    async shareNote(key: string, content: string): Promise<void> {
    registerNoteWithPeer(this.serverUrl, key, content);
        await updateNoteRegistry(this.plugin, key, content);
    }

    async pullNote(key: string): Promise<string> {
    const content = await requestNoteFromPeer(this.serverUrl, key);
        await updateNoteRegistry(this.plugin, key, content);
        return content;
    }

    async removeNote(key: string): Promise<void> {
    await deleteNoteFromRegistry(this.plugin, key);
    }
    async handleIncomingPush(key: string, content: string) {
        const filePath = `${key}.md`;
        let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        let overwrite = false;
        let currentContent = "";
    
        if (file && file instanceof TFile) {
            currentContent = await this.plugin.app.vault.read(file);
        }
    
        overwrite = await new Promise(resolve => {
            new ReceivedPushConfirmation(
                this.plugin.app,
                `Note "${filePath}" already exists. Overwrite it?`,
                currentContent,
                content,
                resolve
            ).open();
        });
    
        if (!overwrite) {
            new Notice(`Push cancelled for "${filePath}".`, 3000);
            return;
        }
    
        if (file && file instanceof TFile) {
            await this.plugin.app.vault.modify(file, content);
        } else {
            await this.plugin.app.vault.create(filePath, content);
        }
    
        // Optionally open the file
        file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.plugin.app.workspace.getLeaf(true).openFile(file);
            new Notice(`Note '${key}' pushed and opened successfully.`, 3000);
        }
    
        await updateNoteRegistry(this.plugin, key, content);
    }
}