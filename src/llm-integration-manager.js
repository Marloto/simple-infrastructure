import {createGenerator, handleSse} from './completion.js'
import { showNotification } from './utilities.js';

/**
 * LlmIntegrationManager - Manages the integration of an LLM into the system visualization.
 * Focuses on the core functionality of LLM communication and data model updates.
 */
export class LlmIntegrationManager {
    constructor(options = {}) {
        this.dataManager = null;
        this.initialized = false;
        this.isProcessing = false;

        // Configuration with default values
        this.config = {
            apiKey: options.apiKey || "",
            llmType: options.llmType || "", // claude, openai, custom
            llmModel: options.llmModel || "", // like claude-3-7-sonnet-20250219
            llmUrl: options.llmUrl || "", // Only needed for custom
            systemPrompt: options.systemPrompt || "",
            promptPrefix: options.promptPrefix || "",
            onMessageReceived: options.onMessageReceived || null,
            onTyping: options.onTyping || null
        };
    }

    /**
     * Updates the LLM integration configuration with the provided parameters.
     *
     * @param {string} llmType - The type of the language model (e.g., 'openai', 'anthropic').
     * @param {string} llmModel - The specific model to use (e.g., 'gpt-4', 'claude-2').
     * @param {string} llmApiKey - The API key for authenticating requests to the LLM service.
     * @param {string} [llmSystemPrompt] - Optional system prompt to use; defaults to the class's default if not provided.
     * @param {string} [llmPromptPrefix] - Optional prefix to prepend to prompts; defaults to an empty string if not provided.
     */
    updateConfig(llmType = undefined, llmModel = undefined, llmApiKey = undefined, llmSystemPrompt = undefined, llmPromptPrefix = undefined) {
        this.config.llmType = llmType;
        this.config.llmModel = llmModel;
        this.config.apiKey = llmApiKey;
        this.config.systemPrompt = llmSystemPrompt || this.getDefaultSystemPrompt();
        this.config.promptPrefix = llmPromptPrefix || this.getDefaultPromptPrefix();

        if(this.isConfigurated()) {
            this.createLlmGenerator();
        }
    }

    /**
     * Checks if the configuration is complete by verifying the presence of
     * `apiKey`, `llmType`, and `llmModel` properties in the config object.
     *
     * @returns {boolean} Returns `true` if all required configuration properties are set; otherwise, `false`.
     */
    isConfigurated() {
        return this.config.apiKey && this.config.llmType && this.config.llmModel;
    }

    /**
     * Initializes the LlmIntegrationManager
     * @param {DataManager} dataManager - The DataManager for data management
     */
    initialize(dataManager) {
        if (this.initialized) return;

        if (!dataManager) {
            console.error("No DataManager provided");
            return;
        }

        this.dataManager = dataManager;

        this.initialized = true;
        console.log("LlmIntegrationManager has been initialized");
    }

    /**
     * Creates the LLM generator based on the configuration
     */
    createLlmGenerator() {
        const variables = {
            example: this.getExampleDataAsPromptBlock(),
            dataStructure: this.getDataStructureAsPromptBlock()
        };

        // Create generator using the createGenerator function
        const generator = createGenerator(
            variables,
            this.config.systemPrompt || this.getDefaultSystemPrompt(),
            this.config.promptPrefix || this.getDefaultPromptPrefix(),
            {
                llmType: this.config.llmType,
                llmModel: this.config.llmModel,
                llmApiKey: this.config.apiKey,
                llmUrl: this.config.llmUrl
            }
        );

        if (!generator) {
            console.error("Error creating the LLM generator");
            showNotification("LLM integration could not be initialized", "danger");
        }

        return generator;
    }

    /**
     * Processes a user request and sends it to the LLM
     * @param {string} userInput - The user input
     * @returns {Promise<Object>} - Processing result with response and data changes
     */
    async processUserInput(userInput, callback) {
        if (!this.isConfigurated()) {
            return { success: false, message: "Missing configuration for connecting to ChatBot provider" };
        }

        let generator;
        try {
            generator = this.createLlmGenerator();
        } catch (error) {
            console.error("Error creating the LLM generator:", error);
            return { success: false, message: "Error creating the LLM generator" };
        }

        if (!userInput || this.isProcessing) {
            return { success: false, message: "Input cannot be processed" };
        }

        this.isProcessing = true;
        let result = {
            success: false,
            message: "",
            originalResponse: "",
            yamlData: null,
            differences: null
        };

        try {
            // Aktuelle Daten vorbereiten
            const currentData = this.dataManager.getData();

            // Nachricht an das LLM senden
            generator.attachMessageAsUserUsingPrefix({
                userInput: userInput,
                currentData: this.getCurrentDataAsPromptBlock(currentData),
                example: this.getExampleDataAsPromptBlock(),
            });

            // Stream-Antwort verarbeiten
            const response = await handleSse(
                generator,
                (error, token) => {
                    if (error) {
                        console.error("Stream-Error:", error);
                        return;
                    }

                    // Token an Handler übergeben, falls definiert
                    if (this.config.onTyping && token) {
                        this.config.onTyping(token);
                    }
                    if (callback && token) {
                        callback(token);
                    }
                }
            );

            // Vollständige Antwort speichern
            result.originalResponse = response;
            generator.attachMessageAsAssistant(response);

            // Antwort parsen und YAML extrahieren
            const yamlContent = this.extractYamlFromResponse(response);

            if (yamlContent) {
                try {
                    // YAML parsen
                    const parsedData = jsyaml.load(yamlContent);

                    // Daten validieren
                    if (this.validateSystemData(parsedData)) {
                        result.yamlData = parsedData;

                        // Unterschiede berechnen
                        result.differences = this.calculateDifferences(currentData, parsedData);
                        result.success = true;
                    } else {
                        result.message = "The YAML structure is invalid";
                    }
                } catch (error) {
                    console.error("Error parsing the YAML response:", error);
                    result.message = "The YAML response could not be processed";
                }
            } else {
                // Normale Konversation ohne YAML-Änderungen
                result.success = true;
                result.message = "No infrastructure changes detected";
            }

            // Falls ein Callback für empfangene Nachrichten definiert ist, diesen aufrufen
            if (this.config.onMessageReceived) {
                this.config.onMessageReceived(result);
            }

            return result;
        } catch (error) {
            console.error("Error during LLM processing:", error);
            result.message = "An error occurred during processing";
            return result;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Erstellt einen YAML-Markdown-Block für die aktuelle Infrastruktur
     * @param {Object} currentData - Aktuelle Infrastrukturdaten
     * @returns {string} - Die formatierte Nachricht mit Kontext
     */
    getCurrentDataAsPromptBlock(currentData) {
        return `
\`\`\`yaml
systems:
${currentData.systems.map(sys => `  - id: ${sys.id}
    name: ${sys.name}
    description: ${sys.description}
    category: ${sys.category}${this.formatGroups(sys)}
    status: ${sys.status}
    knownUsage: ${sys.knownUsage}${sys.tags && sys.tags.length > 0 ? `\n    tags:\n${sys.tags.map(tag => `      - ${tag}`).join('\n')}` : ''}
`).join('\n')}

dependencies:
${currentData.dependencies.map(dep => `  - source: ${dep.source}
    target: ${dep.target}
    type: ${dep.type}
    description: ${dep.description || 'No Description'}
    protocol: ${dep.protocol || 'API'}
`).join('\n')}
\`\`\`
`;
    }

    /**
     * Erstellt einen YAML-Markdown-Block als Beispiel für den Prompt
     * @returns {string} - Die formatierte Nachricht mit Kontext
     */
    getDataStructureAsPromptBlock() {
        return `
\`\`\`yaml
systems:
  - id: systemId
    name: System Name
    description: Description for the system
    category: core/legacy/data/service/external
    groups:
      - gruppe1
      - gruppe2
    status: active/planned/deprecated/retired
    knownUsage: true/false
    delete: true/false
    tags:
      - tag1
      - tag2

dependencies:
  - source: sourceSystemId
    target: targetSystemId
    type: data/integration/authentication/monitoring
    description: Description for the dependency
    delete: true/false
    protocol: Name of Protocol
\`\`\`
`;
    }

    /**
     * Creates a YAML markdown block as an example for the prompt
     * @returns {string} - The formatted message with context
     */
    getExampleDataAsPromptBlock() {
        return `
\`\`\`yaml
systems:
  - id: system1
    name: System Name
    description: Some description for the system
    category: core
    groups:
      - group1
      - group2
    status: active
    delete: false
    knownUsage: true

dependencies:
  - source: system1
    target: system2
    type: data
    description: Some description for the dependency
    delete: false
    protocol: Protocol
\`\`\`
`;
    }
    /**
     * Helper function to format the groups information for the YAML representation
     * @param {Object} system - The system object
     * @returns {string} - Formatted groups information
     */
    formatGroups(system) {
        let groupsText = '';

        // System has a groups array with entries
        if (Array.isArray(system.groups) && system.groups.length > 0) {
            groupsText = '\n    groups:';
            system.groups.forEach(group => {
                groupsText += `\n      - ${group}`;
            });
        }

        return groupsText;
    }

    /**
     * Applies data changes to the data model
     * @param {Object} differences - The changed data
     * @returns {boolean} - True on success
     */
    applyChanges(differences) {
        try {
            // Update data in the DataManager
            this.dataManager.applyBatch(differences);
            showNotification("Changes have been successfully applied", "success");
            return true;
        } catch (error) {
            console.error("Error applying changes:", error);
            showNotification("Error applying changes", "danger");
            return false;
        }
    }

    /**
     * Calculates the differences between two data models
     * @param {Object} currentData - Current data
     * @param {Object} newData - New data
     * @returns {Object} Differences (added, modified, removed)
     */
    calculateDifferences(currentData, newData) {
        const differences = {
            added: {
                systems: [],
                dependencies: []
            },
            modified: {
                systems: [],
                dependencies: []
            },
            removed: {
                systems: [],
                dependencies: []
            }
        };

        // Compare systems
        const currentSystemIds = new Set(currentData.systems.map(s => s.id));

        // Added and removed systems
        newData.systems.forEach(newSystem => {
            // Removed systems
            if (newSystem.delete) {
                differences.removed.systems.push(newSystem);
                return;
            }
            if (!currentSystemIds.has(newSystem.id)) {
                differences.added.systems.push(newSystem);
            } else {
                // Modified systems
                const currentSystem = currentData.systems.find(s => s.id === newSystem.id);
                if (!this.areSystemsEqual(currentSystem, newSystem)) {
                    differences.modified.systems.push(newSystem);
                }
            }
        });

        // Compare dependencies
        const currentDepKeys = new Set(currentData.dependencies.map(d => `${d.source}-${d.target}`));

        // Added and removed dependencies
        newData.dependencies.forEach(newDep => {
            if (newDep.delete) {
                differences.removed.dependencies.push(newDep);
                return;
            }
            const key = `${newDep.source}-${newDep.target}`;
            if (!currentDepKeys.has(key)) {
                differences.added.dependencies.push(newDep);
            } else {
                // Modified dependencies
                const currentDep = currentData.dependencies.find(d =>
                    d.source === newDep.source && d.target === newDep.target);
                if (!this.areDependenciesEqual(currentDep, newDep)) {
                    differences.modified.dependencies.push(newDep);
                }
            }
        });

        return differences;
    }

    /**
     * Compares two systems for equality, adapted for multi-group support
     * @param {Object} system1 - First system
     * @param {Object} system2 - Second system
     * @returns {boolean} True if the systems are equal
     */
    areSystemsEqual(system1, system2) {
        if (!system1 || !system2) return false;

        // Compare main properties
        if (system1.name !== system2.name ||
            system1.description !== system2.description ||
            system1.category !== system2.category ||
            system1.status !== system2.status ||
            system1.knownUsage !== system2.knownUsage) {
            return false;
        }

        // Compare groups
        const groups1 = this.getSystemGroups(system1);
        const groups2 = this.getSystemGroups(system2);

        if (groups1.length !== groups2.length) {
            return false;
        }

        // Check if all groups match (order does not matter)
        for (const group of groups1) {
            if (!groups2.includes(group)) {
                return false;
            }
        }

        // Compare tags (if present)
        if (Array.isArray(system1.tags) && Array.isArray(system2.tags)) {
            if (system1.tags.length !== system2.tags.length) {
                return false;
            }

            for (let i = 0; i < system1.tags.length; i++) {
                if (!system2.tags.includes(system1.tags[i])) {
                    return false;
                }
            }
        } else if ((system1.tags && !system2.tags) || (!system1.tags && system2.tags)) {
            return false;
        }

        return true;
    }

    /**
     * Helper function to extract all groups of a system
     * @param {Object} system - The system object
     * @returns {Array} Array with all group names
     */
    getSystemGroups(system) {
        let groups = [];

        if (Array.isArray(system.groups) && system.groups.length > 0) {
            groups = [...system.groups];
        } else if (system.group && typeof system.group === 'string') {
            groups = [system.group];
        }

        return groups;
    }

    /**
     * Compares two dependencies for equality
     * @param {Object} dep1 - First dependency
     * @param {Object} dep2 - Second dependency
     * @returns {boolean} True if the dependencies are equal
     */
    areDependenciesEqual(dep1, dep2) {
        if (!dep1 || !dep2) return false;

        return dep1.type === dep2.type &&
            dep1.description === dep2.description &&
            dep1.protocol === dep2.protocol;
    }

    /**
     * Validates the data structure
     * @param {Object} data - The data structure to validate
     * @returns {boolean} True if the data is valid
     */
    validateSystemData(data) {
        // Check if the basic structure exists
        if (!data || (!Array.isArray(data.systems) && !Array.isArray(data.dependencies))) {
            return false;
        }

        data.systems = data.systems || [];
        data.dependencies = data.dependencies || [];

        // Check if all systems have an ID
        const allSystemsHaveId = data.systems.every(system => !!system.id);
        if (!allSystemsHaveId) {
            return false;
        }

        // Check if all dependencies have valid source and target
        const currentData = this.dataManager.getData();
        const allDependenciesValid = data.dependencies.every(dep =>
            !!dep.source && !!dep.target &&
            (data.systems.some(sys => sys.id === dep.source) || currentData.systems.some(sys => sys.id === dep.source)) &&
            (data.systems.some(sys => sys.id === dep.target) || currentData.systems.some(sys => sys.id === dep.target))
        );

        return allDependenciesValid;
    }

    /**
     * Extracts YAML content from an LLM response
     * @param {string} response - The LLM response
     * @returns {string|null} The extracted YAML content or null
     */
    extractYamlFromResponse(response) {
        // Search for YAML blocks in the response (with Markdown code block)
        const yamlRegex = /```(?:yaml)?\s*([\s\S]*?)\s*```/i;
        const match = response.match(yamlRegex);

        if (match && match[1]) {
            return match[1].trim();
        }

        return null;
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

Wenn keine Änderungen erforderlich sind, antworte mit normaler Konversation. Gib YAML nur zurück, wenn Infrastrukturänderungen angefordert wurden.
`;
        } else {
            return `
Here is the current YAML representation of the infrastructure:

{{currentData}}

User request:

{{userInput}}

If you are asked to make changes to the infrastructure, return the new, updated, or deleted elements in YAML using the following format:

{{example}}

If no changes are required, respond with a normal conversation. Only return YAML if infrastructure changes are requested.
`;
        }
    }
}