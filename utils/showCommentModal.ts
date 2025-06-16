import { App } from "obsidian";
import { DraggableCommentModal } from "../settings/draggable_modal";

interface PersonalComment {
	key: string;
	line: number;
	column: number;
	content: string;
}

export function showAllPersonalCommentsForKey(app: App, key: string, comments: PersonalComment[]) {
	const matches = comments.filter(comment => comment.key === key);
	for (const comment of matches) {
		const modal = new DraggableCommentModal(app, comment.content);
		modal.open();
		const top = comment.line * 20 + 100;
		const left = comment.column * 8 + 50;
		setTimeout(() => {
			modal.modalEl.style.top = `${top}px`;
			modal.modalEl.style.left = `${left}px`;
		}, 0);
	}
}
