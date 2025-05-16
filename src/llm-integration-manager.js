import {createGenerator, handleSse} from './completion.js'
import { showNotification } from './utilities.js';

/**
 * LlmIntegrationManager - Verwaltet die Integration eines LLM in die Systemvisualisierung
 * Konzentriert sich auf die Kernfunktionalität der LLM-Kommunikation und Datenmodell-Updates
 */
export class LlmIntegrationManager {
    constructor(options = {}) {
        this.dataManager = null;
        this.initialized = false;
        this.isProcessing = false;

        // Konfiguration mit Standardwerten
        this.config = {
            apiKey: options.apiKey || "",
            llmType: options.llmType || "", // claude, openai, custom
            llmModel: options.llmModel || "", // like claude-3-7-sonnet-20250219
            llmUrl: options.llmUrl || "", // Nur für custom notwendig
            systemPrompt: options.systemPrompt || "",
            promptPrefix: options.promptPrefixs || "",
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
    updateConfig(llmType, llmModel, llmApiKey, llmSystemPrompt = undefined, llmPromptPrefix = undefined) {
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
     * Initialisiert den LlmIntegrationManager
     * @param {DataManager} dataManager - Der DataManager für die Datenverwaltung
     */
    initialize(dataManager) {
        if (this.initialized) return;

        if (!dataManager) {
            console.error("Kein DataManager bereitgestellt");
            return;
        }

        this.dataManager = dataManager;

        this.initialized = true;
        console.log("LlmIntegrationManager wurde initialisiert");
    }

    /**
     * Erstellt den LLM-Generator basierend auf der Konfiguration
     */
    createLlmGenerator() {
        const variables = {
            example: this.getExampleDataAsPromptBlock(),
            dataStructure: this.getDataStructureAsPromptBlock()
        };

        // Generator mit der createGenerator-Funktion erstellen
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
            console.error("Fehler beim Erstellen des LLM-Generators");
            showNotification("LLM-Integration konnte nicht initialisiert werden", "danger");
        }

        return generator;
    }

    /**
     * Verarbeitet eine Benutzeranfrage und sendet sie an das LLM
     * @param {string} userInput - Die Benutzereingabe
     * @returns {Promise<Object>} - Verarbeitungsergebnis mit Antwort und Datenänderungen
     */
    async processUserInput(userInput, callback) {
        if (!this.isConfigurated()) {
            return { success: false, message: "Fehlende Konfigurationen für die Anbindung an ChatBot-Provider" };
        }

        let generator;
        try {
            generator = this.createLlmGenerator();
        } catch (error) {
            console.error("Fehler beim Erstellen des LLM-Generators:", error);
            return { success: false, message: "Fehler beim Erstellen des LLM-Generators" };
        }

        if (!userInput || this.isProcessing) {
            return { success: false, message: "Eingabe kann nicht verarbeitet werden" };
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
                        console.error("Stream-Fehler:", error);
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
                        result.message = "Die YAML-Struktur ist ungültig";
                    }
                } catch (error) {
                    console.error("Fehler beim Parsen der YAML-Antwort:", error);
                    result.message = "Die YAML-Antwort konnte nicht verarbeitet werden";
                }
            } else {
                // Normale Konversation ohne YAML-Änderungen
                result.success = true;
                result.message = "Keine Infrastrukturänderungen erkannt";
            }

            // Falls ein Callback für empfangene Nachrichten definiert ist, diesen aufrufen
            if (this.config.onMessageReceived) {
                this.config.onMessageReceived(result);
            }

            return result;
        } catch (error) {
            console.error("Fehler bei der LLM-Verarbeitung:", error);
            result.message = "Es ist ein Fehler bei der Verarbeitung aufgetreten";
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
    description: Beschreibung
    category: kategorie
    groups:
      - gruppe1
      - gruppe2
    status: status
    knownUsage: true/false
    delete: true/false
    tags:
      - tag1
      - tag2

dependencies:
  - source: quellSystemId
    target: zielSystemId
    type: verbindungstyp
    description: Beschreibung der Verbindung
    delete: true/false
    protocol: Verwendetes Protokoll
\`\`\`
`;
    }

    /**
     * Erstellt einen YAML-Markdown-Block als Beispiel für den Prompt
     * @returns {string} - Die formatierte Nachricht mit Kontext
     */
    getExampleDataAsPromptBlock() {
        return `
\`\`\`yaml
systems:
  - id: system1
    name: System Name
    description: Beschreibung
    category: category
    groups:
      - group1
      - group2
    status: status
    delete: true/false
    knownUsage: true/false
    # Weitere Eigenschaften...

dependencies:
  - source: system1
    target: system2
    type: type
    description: Beschreibung
    delete: true/false
    protocol: Protokoll
\`\`\`
`;
    }

    /**
     * Hilfsfunktion zum Formatieren der Gruppen-Information für die YAML-Darstellung
     * @param {Object} system - Das System-Objekt
     * @returns {string} - Formatierte Gruppen-Information
     */
    formatGroups(system) {
        let groupsText = '';

        // Fall 1: system hat ein groups-Array mit Einträgen
        if (Array.isArray(system.groups) && system.groups.length > 0) {
            groupsText = '\n    groups:';
            system.groups.forEach(group => {
                groupsText += `\n      - ${group}`;
            });
        }
        // Fall 2: Legacy-Fall mit einfachem group-Feld
        else if (system.group && typeof system.group === 'string') {
            groupsText = `\n    group: ${system.group}`;
        }

        return groupsText;
    }

    /**
     * Wendet Datenänderungen auf das Datenmodell an
     * @param {Object} differences - Die geänderten Daten
     * @returns {boolean} - True bei Erfolg
     */
    applyChanges(differences) {
        try {
            // Daten im DataManager aktualisieren
            this.dataManager.applyBatch(differences);
            showNotification("Die Änderungen wurden erfolgreich angewendet", "success");
            return true;
        } catch (error) {
            console.error("Fehler beim Anwenden der Änderungen:", error);
            showNotification("Fehler beim Anwenden der Änderungen", "danger");
            return false;
        }
    }

    /**
     * Berechnet die Unterschiede zwischen zwei Datenmodellen
     * @param {Object} currentData - Aktuelle Daten
     * @param {Object} newData - Neue Daten
     * @returns {Object} Unterschiede (hinzugefügt, geändert, entfernt)
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

        // Systeme vergleichen
        const currentSystemIds = new Set(currentData.systems.map(s => s.id));

        // Hinzugefügte Systeme
        newData.systems.forEach(newSystem => {
            // Gelöschte Systeme
            if (newSystem.delete) {
                differences.removed.systems.push(newSystem);
                return;
            }
            if (!currentSystemIds.has(newSystem.id)) {
                differences.added.systems.push(newSystem);
            } else {
                // Geänderte Systeme
                const currentSystem = currentData.systems.find(s => s.id === newSystem.id);
                if (!this.areSystemsEqual(currentSystem, newSystem)) {
                    differences.modified.systems.push(newSystem);
                }
            }
        });

        // Abhängigkeiten vergleichen
        const currentDepKeys = new Set(currentData.dependencies.map(d => `${d.source}-${d.target}`));

        // Hinzugefügte Abhängigkeiten
        newData.dependencies.forEach(newDep => {
            if (newDep.delete) {
                differences.removed.dependencies.push(newDep);
                return;
            }
            const key = `${newDep.source}-${newDep.target}`;
            if (!currentDepKeys.has(key)) {
                differences.added.dependencies.push(newDep);
            } else {
                // Geänderte Abhängigkeiten
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
     * Vergleicht zwei Systeme auf Gleichheit, angepasst für Multi-Gruppen
     * @param {Object} system1 - Erstes System
     * @param {Object} system2 - Zweites System
     * @returns {boolean} True, wenn die Systeme gleich sind
     */
    areSystemsEqual(system1, system2) {
        if (!system1 || !system2) return false;

        // Vergleich der Haupteigenschaften
        if (system1.name !== system2.name ||
            system1.description !== system2.description ||
            system1.category !== system2.category ||
            system1.status !== system2.status ||
            system1.knownUsage !== system2.knownUsage) {
            return false;
        }

        // Gruppen vergleichen
        const groups1 = this.getSystemGroups(system1);
        const groups2 = this.getSystemGroups(system2);

        if (groups1.length !== groups2.length) {
            return false;
        }

        // Prüfen, ob alle Gruppen übereinstimmen (Reihenfolge unwichtig)
        for (const group of groups1) {
            if (!groups2.includes(group)) {
                return false;
            }
        }

        // Tags vergleichen (falls vorhanden)
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
     * Hilfsfunktion zum Extrahieren aller Gruppen eines Systems
     * @param {Object} system - Das System-Objekt
     * @returns {Array} Array mit allen Gruppennamen
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
     * Vergleicht zwei Abhängigkeiten auf Gleichheit
     * @param {Object} dep1 - Erste Abhängigkeit
     * @param {Object} dep2 - Zweite Abhängigkeit
     * @returns {boolean} True, wenn die Abhängigkeiten gleich sind
     */
    areDependenciesEqual(dep1, dep2) {
        if (!dep1 || !dep2) return false;

        return dep1.type === dep2.type &&
            dep1.description === dep2.description &&
            dep1.protocol === dep2.protocol;
    }

    /**
     * Validiert die Datenstruktur
     * @param {Object} data - Die zu validierende Datenstruktur
     * @returns {boolean} True, wenn die Daten valide sind
     */
    validateSystemData(data) {
        // Überprüfe, ob die Grundstruktur vorhanden ist
        if (!data || (!Array.isArray(data.systems) && !Array.isArray(data.dependencies))) {
            return false;
        }

        data.systems = data.systems || [];
        data.dependencies = data.dependencies || [];

        // Überprüfe, ob alle Systeme eine ID haben
        const allSystemsHaveId = data.systems.every(system => !!system.id);
        if (!allSystemsHaveId) {
            return false;
        }

        // Überprüfe, ob alle Abhängigkeiten gültige source und target haben
        const currentData = this.dataManager.getData();
        const allDependenciesValid = data.dependencies.every(dep =>
            !!dep.source && !!dep.target &&
            (data.systems.some(sys => sys.id === dep.source) || currentData.systems.some(sys => sys.id === dep.source)) &&
            (data.systems.some(sys => sys.id === dep.target) || currentData.systems.some(sys => sys.id === dep.target))
        );

        return allDependenciesValid;
    }

    /**
     * Extrahiert YAML-Inhalt aus einer LLM-Antwort
     * @param {string} response - Die LLM-Antwort
     * @returns {string|null} Der extrahierte YAML-Inhalt oder null
     */
    extractYamlFromResponse(response) {
        // Suche nach YAML-Blöcken in der Antwort (mit Markdown-Code-Block)
        const yamlRegex = /```(?:yaml)?\s*([\s\S]*?)\s*```/i;
        const match = response.match(yamlRegex);

        if (match && match[1]) {
            return match[1].trim();
        }

        return null;
    }

    /**
     * Gibt den Standard-Systemprompt zurück
     * @returns {string} Der Standard-Systemprompt
     */
    getDefaultSystemPrompt() {
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
    }

    /**
     * Erstellt den Standard-Prompt-Header
     * 
     * @returns {string} - Die formatierte Nachricht mit Kontext
     */
    getDefaultPromptPrefix() {
        return `
Hier ist die aktuelle YAML-Darstellung der Infrastruktur:

{{currentData}}

Benutzeranfrage:

{{userInput}}

Wenn du Änderungen an der Infrastruktur vornehmen sollst, gib die neuen, aktualisierten oder zu löschenden Elemente in YAML im folgenden Format zurück:

{{example}}

Wenn keine Änderungen erforderlich sind, antworte mit normaler Konversation. Gib YAML nur zurück, wenn Infrastrukturänderungen angefordert wurden.
`;
    }
}