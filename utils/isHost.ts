function isHostForNote(plugin: MyPlugin, note: string): boolean {
    return plugin.settings.keys.some(k => k.note === note);
  }
  
  function getLinkedViewersForNote(plugin: MyPlugin, note: string): KeyItem[] {
    return plugin.settings.linkedKeys.filter(k => k.note === note);
  }
  