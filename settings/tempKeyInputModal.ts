import { App, Modal, TextComponent, ButtonComponent } from "obsidian";

export class tempKeyInputModal extends Modal {
  onSubmit: (key: string) => void;

  constructor(app: App, onSubmit: (key: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Enter the key of the note to pull" });

    const input = new TextComponent(contentEl);
    input.inputEl.style.width = "100%";

    new ButtonComponent(contentEl)
      .setButtonText("Pull")
      .setCta()
      .onClick(() => {
        const value = input.getValue().trim();
        if (value) {
          this.close();
          this.onSubmit(value);
        }
      });

    input.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const value = input.getValue().trim();
        if (value) {
          this.close();
          this.onSubmit(value);
        }
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
