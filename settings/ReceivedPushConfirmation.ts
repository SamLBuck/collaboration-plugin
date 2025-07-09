import { Modal, Setting, App } from "obsidian";

export class ReceivedPushConfirmation extends Modal {
	message: string;
	currentContent: string;
	incomingContent: string;
    callback: (confirmed: boolean, editedContent?: string) => void;
    incomingBoxEl: HTMLDivElement | null = null; 


	constructor(
		app: App,
		message: string,
		currentContent: string,
		incomingContent: string,
		callback: (confirmed: boolean) => void
	) {
		super(app);
		this.message = message;
		this.currentContent = currentContent;
		this.incomingContent = incomingContent;
		this.callback = callback;
	}

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
    
        // Set wider modal dimensions
        this.modalEl.style.minWidth = "1200px";
    
        contentEl.createEl("h2", { text: "Incoming Master Note" });
        contentEl.createEl("p", { text: this.message });
    
        const container = contentEl.createDiv();
        container.style.display = "flex";
        container.style.gap = "12px";
    
        const currentBox = container.createDiv();
        currentBox.style.flex = "1";
        currentBox.style.maxHeight = "500px";
        currentBox.style.overflowY = "auto";
        currentBox.style.border = "1px solid var(--background-modifier-border)";
        currentBox.style.padding = "0.5em";
        
        currentBox.createEl("strong", { text: "Current Content" });
        const currentTextarea = currentBox.createEl("textarea");
        currentTextarea.value = this.currentContent;
        currentTextarea.style.width = "100%";
        currentTextarea.style.height = "400px";
        currentTextarea.style.whiteSpace = "pre-wrap";
        
        this.incomingBoxEl = container.createDiv();
        const incomingBox = this.incomingBoxEl;
        incomingBox.style.flex = "1";
        incomingBox.style.maxHeight = "500px";
        incomingBox.style.overflowY = "auto";
        incomingBox.style.border = "1px solid var(--background-modifier-border)";
        incomingBox.style.padding = "0.5em";
        
        incomingBox.createEl("strong", { text: "Incoming Content" });
        const incomingTextarea = incomingBox.createEl("textarea");
        incomingTextarea.value = this.incomingContent;
        incomingTextarea.style.width = "100%";
        incomingTextarea.style.height = "400px";
        incomingTextarea.style.whiteSpace = "pre-wrap";
            
new Setting(contentEl)
	.addButton((btn) =>
		btn.setButtonText("Accept Incoming")
			.setCta()
			.setClass("mod-cta")
			.onClick(() => {
				this.close();
                this.callback(true, incomingTextarea.value);
			})
	)
	.addButton((btn) =>
		btn.setButtonText("Keep Current").onClick(() => {
			this.close();
			this.callback(false);
		})
	)
    }
    
	onClose() {
		this.contentEl.empty();
	}
}
