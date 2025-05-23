const { SharedNoteManager } = require("./dist/sharedNoteManager.js");
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
}

module.exports = { SharedNoteManager };
