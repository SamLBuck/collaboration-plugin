//const { SharedNoteManager } = require("./dist/sharedNoteManager.js");
const { updateNoteRegistry, deleteNoteFromRegistry } = require("./dist/registryStore.js");
const { requestNoteFromPeer, registerNoteWithPeer } = require("./dist/client.js");

class SharedNoteManager {
	constructor(plugin, serverUrl) {
		this.plugin = plugin;
		this.serverUrl = serverUrl;
	}

	async shareNote(key, content) {
		registerNoteWithPeer(this.serverUrl, key, content);
		await updateNoteRegistry(this.plugin, key, content);
	}

	async pullNote(key) {
		const content = await requestNoteFromPeer(this.serverUrl, key);
		await updateNoteRegistry(this.plugin, key, content);
		return content;
	}

	async removeNote(key) {
		await deleteNoteFromRegistry(this.plugin, key);
	}
	async handleIncomingPush(key, content) {
		const filePath = `${key}.md`;
		let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		let overwrite = false;
	
		if (file) {
			overwrite = await new Promise(resolve => {
				new ConfirmationModal(this.plugin.app, `Note "${filePath}" already exists. Overwrite it?`, resolve).open();
			});
	
			if (!overwrite) {
				new Notice(`Push cancelled for "${filePath}".`, 3000);
				return;
			}
		}
	
		if (file && overwrite) {
			await this.plugin.app.vault.modify(file, content);
		} else {
			await this.plugin.app.vault.create(filePath, content);
		}
	
		// Optionally open the file
		file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (file) {
			await this.plugin.app.workspace.getLeaf(true).openFile(file);
			new Notice(`Note '${key}' pushed and opened successfully.`, 3000);
		}
	
		// Save to internal registry (if needed)
		await updateNoteRegistry(this.plugin, key, content);
	}
	
}

module.exports = { SharedNoteManager };
