// noteRegistry.cjs - REVERTED TO ORIGINAL (NO SANITIZATION)

const fs = require("fs");
const sharedNotes = new Map();

function registerNote(key, content) {
    sharedNotes.set(key, content);
    console.log(`note registered with key: '${key}'`); // Log with quotes for clarity
    printSharedNotes(); // log current state
}

function registerNoteFromFile(key, filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        registerNote(key, content);
    } catch (err) {
        console.error(`Failed to read file ${filePath}:`, err);
    }
}

function getNote(key) {
    console.log(`Attempting to get note with key: '${key}'`); // Log with quotes for clarity
    return sharedNotes.get(key);
}

function deleteNote(key) {
    if (sharedNotes.has(key)) {
        sharedNotes.delete(key);
        console.log(`Note '${key}' deleted from registry.`);
    } else {
        console.log(`Note '${key}' not found in registry for deletion.`);
    }
    printSharedNotes();
    return !sharedNotes.has(key); // Return true if deleted, false otherwise
}

function printSharedNotes() {
    console.log("Current sharedNotes:");
    if (sharedNotes.size === 0) {
        console.log("  (empty)");
    } else {
        for (const [key, value] of sharedNotes.entries()) {
            console.log(`- '${key}' (${value ? value.length : 'N/A'} chars)`); // Added null check
        }
    }
}

module.exports = {
    registerNote,
    registerNoteFromFile,
    getNote,
    deleteNote,
    sharedNotes
};