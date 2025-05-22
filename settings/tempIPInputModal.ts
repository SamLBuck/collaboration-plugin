import { App, Modal, TextComponent, ButtonComponent } from "obsidian";

export class tempIPInputModal extends Modal {
  onSubmit: (ip: string, key: string) => void;

  constructor(app: App, onSubmit: (ip: string, key: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Pull Note from Server Registry" });

    const urlInput = new TextComponent(contentEl);
    urlInput.setPlaceholder("ws://192.168.1.100:3010");

    const keyInput = new TextComponent(contentEl);
    keyInput.setPlaceholder("Note key");

    new ButtonComponent(contentEl)
      .setButtonText("Pull")
      .setCta()
      .onClick(() => {
        const ip = urlInput.getValue().trim();
        const key = keyInput.getValue().trim();
        if (ip && key) {
          this.close();
          this.onSubmit(ip, key);
        }
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
