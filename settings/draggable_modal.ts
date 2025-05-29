import { App, Component } from "obsidian";

export class DraggableCommentModal extends Component {
	private containerEl: HTMLElement;
	private modalEl: HTMLElement;
	private offsetX = 0;
	private offsetY = 0;
	private isDragging = false;

	constructor(
		private app: App,
		private initialText: string = "",
		private onUpdate?: (content: string) => void
	) {
		super();
		this.createModal();
	}

	private createModal() {
		this.containerEl = createDiv("draggable-comment-modal-container");
		this.modalEl = this.containerEl.createDiv("draggable-comment-modal");

		// Styling
		Object.assign(this.containerEl.style, {
			position: "fixed",
			top: "100px",
			left: "100px",
			backgroundColor: "white",
			border: "1px solid var(--background-modifier-border)",
			boxShadow: "var(--shadow-s)",
			padding: "10px",
			zIndex: "9999",
			cursor: "move",
			maxWidth: "90vw"
		});

		// Close Button
		const closeBtn = this.modalEl.createEl("button", { text: "×" });
		closeBtn.addClass("modal-close-button");
		Object.assign(closeBtn.style, {
			position: "absolute",
			top: "2px",
			right: "4px",
			fontSize: "16px",
			background: "none",
			border: "none",
			cursor: "pointer"
		});
		closeBtn.onclick = () => this.close();

		// Text Input
		const input = this.modalEl.createEl("textarea");
		input.value = this.initialText;
		Object.assign(input.style, {
			width: "100%",
			resize: "both",
			marginBottom: "0px"
		});

		// Auto-save/notify callback on change
		input.addEventListener("input", () => {
			this.onUpdate?.(input.value);
		});

		document.body.appendChild(this.containerEl);

		// Dragging
		this.containerEl.addEventListener("mousedown", this.onMouseDown);
		document.addEventListener("mousemove", this.onMouseMove);
		document.addEventListener("mouseup", this.onMouseUp);
	}

	private onMouseDown = (e: MouseEvent) => {
		if (e.target instanceof HTMLElement && e.target.closest("button, textarea")) return;
		this.isDragging = true;
		const rect = this.containerEl.getBoundingClientRect();
		this.offsetX = e.clientX - rect.left;
		this.offsetY = e.clientY - rect.top;
	};

	private onMouseMove = (e: MouseEvent) => {
		if (!this.isDragging) return;
		this.containerEl.style.left = `${e.clientX - this.offsetX}px`;
		this.containerEl.style.top = `${e.clientY - this.offsetY}px`;
	};

	private onMouseUp = () => {
		this.isDragging = false;
	};

	public close() {
		this.containerEl.remove();
		document.removeEventListener("mousemove", this.onMouseMove);
		document.removeEventListener("mouseup", this.onMouseUp);
	}
}
