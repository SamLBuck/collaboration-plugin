import { App, Modal, TextComponent, ButtonComponent, Notice } from "obsidian";

export class tempIPInputModal extends Modal {
  onSubmit: (ip: string, key: string) => void;

  constructor(app: App, onSubmit: (ip: string, key: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Pull Note from Server Registry" });

    const combinedInput = new TextComponent(contentEl);
    combinedInput.setPlaceholder("192.168.1.100-noteName");

    new ButtonComponent(contentEl)
      .setButtonText("Pull")
      .setCta()
      .onClick(() => {
        const input = combinedInput.getValue().trim();

        const [ip, key] = input.split("-");

        if (ip && key) {
          this.close();
          this.onSubmit(ip, key);
        } else {
          new Notice("Please enter in format: IP-NOTEKEY (e.g., 192.168.1.100-noteName)");
        }
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
