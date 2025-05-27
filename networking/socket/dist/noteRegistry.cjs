// const fs = require("fs");
// const sharedNotes = new Map();

// function registerNote(key, content) {
//   sharedNotes.set(key, content);
//   console.log(`note registered with key: ${key}`);
//   printSharedNotes(); // log current state

// }

// function registerNoteFromFile(key, filePath) {
//   try {
//     const content = fs.readFileSync(filePath, "utf8");
//     registerNote(key, content);
//   } catch (err) {
//     console.error(`Failed to read file ${filePath}:`, err);
//   }
// }

// function getNote(key) {
//   return sharedNotes.get(key);
// }
// function printSharedNotes() {
//     console.log("Current sharedNotes:");
//     for (const [key, value] of sharedNotes.entries()) {
//       console.log(`- ${key} (${value.length} chars)`);
//     }
//   }
  
// module.exports = {
//   registerNote,
//   registerNoteFromFile,
//   getNote,
//   sharedNotes
// };

const fs = require("fs");
const sharedNotes = new Map();

function registerNote(key, content) {
  sharedNotes.set(key, content);
  console.log(`note registered with key: ${key}`);
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
  return sharedNotes.get(key);
}
function printSharedNotes() {
    console.log("Current sharedNotes:");
    for (const [key, value] of sharedNotes.entries()) {
      console.log(`- ${key} (${value.length} chars)`);
    }
  }
  
module.exports = {
  registerNote,
  registerNoteFromFile,
  getNote,
  sharedNotes
};

