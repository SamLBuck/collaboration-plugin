import type MyPlugin from "../main";

export function renderSettingsPage(container: HTMLElement, plugin: MyPlugin) {
	container.empty(); // clear popup content

	// Title
	container.createEl("h2", { text: "Settings" });

	// Input for key
	const keyInput = container.createEl("input", {
		type: "text",
		placeholder: "Enter or generate key...",
	});

	// Button to generate key
	const generateBtn = container.createEl("button", { text: "Generate" });
	generateBtn.onclick = () => {
		keyInput.value = generateRandomKey(); // put random key in box
	};

	// Input for note name
	const noteInput = container.createEl("input", {
		type: "text",
		placeholder: "Note name...",
	});

	// Create access type checkboxes
	const accessTypes = ["View", "Edit", "View and Comment", "Edit w/ Approval"];
	const checkboxes: Record<string, HTMLInputElement> = {};
	const accessDiv = container.createDiv();
	accessDiv.createEl("h3", { text: "Access Type" });

	accessTypes.forEach((type) => {
		const label = accessDiv.createEl("label", { text: type });
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		label.prepend(checkbox);
		accessDiv.appendChild(label);
		checkboxes[type] = checkbox;
	});

	// Add the inputs and buttons to the screen
	container.appendChild(keyInput);
	container.appendChild(generateBtn);
	container.appendChild(noteInput);
	container.appendChild(accessDiv);

	// Navigation buttons
	const listBtn = container.createEl("button", { text: "List of keys" });
	const linkBtn = container.createEl("button", { text: "Link Note" });

	container.appendChild(listBtn);
	container.appendChild(linkBtn);
}

// Simple random key maker
function generateRandomKey(): string {
	return Math.random().toString(36).slice(2, 10);
}
