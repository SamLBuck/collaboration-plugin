import { Plugin, Notice, TFile } from "obsidian";
import { DraggableCommentModal } from "../settings/draggable_modal";

interface PersonalComment {
	key: string;
	line: number;
	column: number;
	content: string;
}

export function registerAddPersonalCommentCommand(plugin: Plugin & {
	settings: { personalComments?: PersonalComment[] };
	saveSettings: () => Promise<void>;
}) {
	plugin.addCommand({
		id: "add-personal-comment",
		name: "Add Personal Comment",
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice("No active file to attach comment to.");
				return;
			}

			const key = file.basename;
			const line = 20;   // Stub for now
			const column = 5;

			const modal = new DraggableCommentModal(plugin.app, "Add your comment here");
			const content = "Default comment content"; // Initialize content variable
				if (!plugin.settings.personalComments) plugin.settings.personalComments = [];
				plugin.settings.personalComments.push({ key, line, column, content });
				await plugin.saveSettings();
				new Notice("Comment added.");


			modal.open();
		}
	});
}
