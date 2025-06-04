async pullNoteByKey(key: string) {
    const noteInfo = this.linkedNotes[key];
    const file = this.app.vault.getAbstractFileByPath(noteInfo.filename);
  
    if (file instanceof TFile) {
      const newContent = await fetchNoteFromPeer(key); // Your own function
      await this.app.vault.modify(file, newContent);
      this.linkedNotes[key].lastPulled = Date.now();
    }
  }
  