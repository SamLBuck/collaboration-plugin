import { Modal, Setting, App } from "obsidian";

export class ReceivedPushConfirmation extends Modal {
	message: string;
	currentContent: string;
	incomingContent: string;
	callback: (confirmed: boolean) => void;

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
        this.modalEl.style.minWidth = "1200px"; // You can tweak this to 900px or whatever looks good
    
        contentEl.createEl("h2", { text: "Incoming Push Note" });
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
        currentBox.createEl("pre", { text: this.currentContent });
    
        const incomingBox = container.createDiv();
        incomingBox.style.flex = "1";
        incomingBox.style.maxHeight = "500px";
        incomingBox.style.overflowY = "auto";
        incomingBox.style.border = "1px solid var(--background-modifier-border)";
        incomingBox.style.padding = "0.5em";
        incomingBox.createEl("strong", { text: "Incoming Content" });
        incomingBox.createEl("pre", { text: this.incomingContent });
    
        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Accept Incoming")
                    .setCta()
                    .setClass("mod-cta")
                    .onClick(() => {
                        this.close();
                        this.callback(true);
                    })
            )
            .addButton((btn) =>
                btn.setButtonText("Keep Current").onClick(() => {
                    this.close();
                    this.callback(false);
                })
            );
    }
    
	onClose() {
		this.contentEl.empty();
	}
}
