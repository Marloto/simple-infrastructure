import { retrieveAndDecrypt, encryptAndStore } from '../utils/utilities.js';
export class LlmConfigManager {
    get llmType() {
        return localStorage.getItem("llmType") || "claude";
    }

    set llmType(value) {
        localStorage.setItem("llmType", value);
    }

    async hasLlmApiKey() {
        return !!localStorage.getItem("llmApiKey");
    }

    async loadLlmApiKey() {
        return await retrieveAndDecrypt("llmApiKey");
    }

    async updateLlmApiKey(value) {
        return await encryptAndStore("llmApiKey", value);
    }

    get llmModel() {
        return localStorage.getItem("llmModel") || "";
    }

    set llmModel(value) {
        localStorage.setItem("llmModel", value);
    }

    get llmSystemPrompt() {
        return localStorage.getItem("llmSystemPrompt") || this.getDefaultSystemPrompt();
    }

    set llmSystemPrompt(value) {
        localStorage.setItem("llmSystemPrompt", value);
    }

    get llmPromptPrefix() {
        return localStorage.getItem("llmPromptPrefix") || this.getDefaultPromptPrefix();
    }

    set llmPromptPrefix(value) {
        localStorage.setItem("llmPromptPrefix", value);
    }

    get llmUrl() {
        return localStorage.getItem("llmUrl") || "";
    }

    set llmUrl(value) {
        localStorage.setItem("llmUrl", value);
    }

    reset() {
        localStorage.removeItem("llmType");
        localStorage.removeItem("llmModel");
        localStorage.removeItem("llmSystemPrompt");
        localStorage.removeItem("llmPromptPrefix");
        localStorage.removeItem("llmApiKey");
        localStorage.removeItem("llmUrl");
    }

    /**
     * Returns the default system prompt
     * @returns {string} The default system prompt
     */
    getDefaultSystemPrompt() {
        const isGerman = typeof navigator !== "undefined" && navigator.language && navigator.language.startsWith("de");
        if (isGerman) {
            return `Du bist ein Infrastruktur-Assistent, der dabei hilft, IT-Systeme und deren Abhängigkeiten zu verwalten. IT-Systeme bestehen aus id, name, description, category, status, knownUsage, groups (array, optional) und tags (array, optional). Abhängigkeiten zwischen Systemen haben die Attribute source, target, type, description und protocol. Du analysierst Benutzeranfragen und wandelst sie in strukturierte YAML-Definitionen um.

Akzeptable Kategorien (category) für Systeme sind:
- core: Zentrale Systeme
- legacy: Veraltete Systeme
- data: Datenspeicher und -verarbeitung
- service: Dienste und Anwendungen
- external: Externe Systeme

Verbindungstypen (type) zwischen Systemen können sein:
- data: Datenaustausch
- integration: Systemintegration
- authentication: Authentifizierung
- monitoring: Überwachung

Status-Werte (status) für Systeme:
- active: Aktiv im Einsatz
- planned: Geplant
- deprecated: Veraltet
- retired: Außer Betrieb

Wenn der Benutzer dich bittet, die Infrastruktur zu ändern (z.B. Systeme hinzuzufügen, zu bearbeiten oder zu löschen), 
antworte mit den neuen, geänderten und gelöschten Elementen in der YAML-Struktur. Gelöschte Elemente werden mit dem Attribut \`delete: true\` markiert. 
Füge keine Erklärungen innerhalb des YAML-Blocks hinzu.

Halte dich an dieses Format:

{{dataStructure}}

Wenn du nach allgemeinen Informationen über die Infrastrukturvisualisierung gefragt wirst, 
antworte mit hilfreichen Erklärungen, ohne YAML zurückzugeben.`;
        } else {
            return `You are an infrastructure assistant that helps manage IT systems and their dependencies. IT systems consist of id, name, description, category, status, knownUsage, groups (array, optional), and tags (array, optional). Dependencies between systems have the attributes source, target, type, description, and protocol. You analyze user requests and convert them into structured YAML definitions.

Acceptable categories (category) for systems are:
- core: Core systems
- legacy: Legacy systems
- data: Data storage and processing
- service: Services and applications
- external: External systems

Connection types (type) between systems can be:
- data: Data exchange
- integration: System integration
- authentication: Authentication
- monitoring: Monitoring

Status values (status) for systems:
- active: Active in use
- planned: Planned
- deprecated: Deprecated
- retired: Retired

If the user asks you to change the infrastructure (e.g., add, edit, or delete systems), 
respond with the new, changed, and deleted elements in the YAML structure. Deleted elements are marked with the attribute \`delete: true\`. 
Do not include explanations inside the YAML block.

Stick to this format:

{{dataStructure}}

If you are asked general questions about infrastructure visualization, 
respond with helpful explanations without returning YAML.`;
        }
    }

    /**
     * Creates the default prompt header, use {{currentData}}, {{userInput}} and {{example}} as placeholders
     * 
     * @returns {string} - The formatted message with context
     */
    getDefaultPromptPrefix() {
        const isGerman = typeof navigator !== "undefined" && navigator.language && navigator.language.startsWith("de");
        if (isGerman) {
            return `
Hier ist die aktuelle YAML-Darstellung der Infrastruktur:

{{currentData}}

Benutzeranfrage:

{{userInput}}

Wenn du Änderungen an der Infrastruktur vornehmen sollst, gib die neuen, aktualisierten oder zu löschenden Elemente in YAML im folgenden Format zurück:

{{example}}

Wenn keine Änderungen erforderlich sind, antworte mit normaler Konversation. Gib YAML immer im korrekten Markdown-Codeblock zurück.
`;
        } else {
            return `
Here is the current YAML representation of the infrastructure:

{{currentData}}

User request:

{{userInput}}

If you are asked to make changes to the infrastructure, return the new, updated, or deleted elements in YAML using the following format:

{{example}}

If no changes are required, respond with a normal conversation. Always return YAML in a correct Markdown code block.
`;
        }
    }
}