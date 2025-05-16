import { DataManager } from './data-manager.js';
import { SystemVisualizer } from './visualizer.js';
import { DependencyManager } from './dependency-manager.js';
import { SystemManager } from './system-manager.js';
import { LlmIntegrationManager } from './llm-integration-manager.js';
import { downloadSystemData, uploadSystemData } from './data-loader.js';
import { showNotification, retrieveAndDecrypt, encryptAndStore } from './utilities.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Systemdaten laden und DataManager initialisieren
    const dataManager = new DataManager();
    console.log('Systemdaten geladen:', dataManager.data);

    // Visualizer erstellen und mit DataManager verknüpfen
    const visualizer = new SystemVisualizer('visualization-container', dataManager);
    visualizer.initialize();

    // DependencyManager initialisieren
    const dependencyManager = new DependencyManager();
    dependencyManager.initialize(dataManager, visualizer);

    // Visualizer Dependency-Klick an Dependency-Manager weitergeben übergeben
    visualizer.on('dependencyClick', (ref) => {
        const { event, data } = ref;
        dependencyManager.showLinkControls(event, data)
    });
    window.vis = visualizer;

    // SystemManager initialisieren
    const systemManager = new SystemManager();
    systemManager.initialize(dataManager);

    // LLM-Integration initialisieren (NEU)
    const llmManager = new LlmIntegrationManager({
        apiKey: (await retrieveAndDecrypt("llmApiKey")) || "", // API-Key aus localStorage
        llmType: localStorage.getItem("llmType") || "", // claude, openai, custom
        llmModel: localStorage.getItem("llmModel") || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        llmSystemPrompt: localStorage.getItem("llmSystemPrompt") || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        llmPromptPrefix: localStorage.getItem("llmPromptPrefix") || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        // llmUrl: "https://deine-custom-api-url.com", // Nur für custom-Typ
    });
    llmManager.initialize(dataManager);

    // Chat-Interface einrichten (NEU)
    setupLlmChatInterface(llmManager);

    window.llm = llmManager; // Optional: Für Zugriff über die Konsole

    setupGroupsUI(systemManager);

    // Toggle-Buttons für die Overlays
    document.getElementById('toggle-search').addEventListener('click', () => toggleOverlay('search-panel'));
    document.getElementById('toggle-filters').addEventListener('click', () => toggleOverlay('filter-panel'));
    document.getElementById('toggle-legend').addEventListener('click', () => toggleOverlay('legend-panel'));

    // Event-Listener für den Upload-Button
    document.getElementById('upload-data').addEventListener('click', () => uploadSystemData(dataManager));

    // Event-Listener für den Download-Button
    document.getElementById('download-data').addEventListener('click', () => downloadSystemData(dataManager));

    // Event-Listener für den Add-System-Button
    document.getElementById('add-system').addEventListener('click', () => systemManager.showSystemModal());

    // "System speichern"-Button Event im Modal
    document.getElementById('save-system').addEventListener('click', () => systemManager.saveSystem());

    // "System speichern"-Button Event im Modal
    document.getElementById('clear-data').addEventListener('click', () => {
        // Öffne das Reset-Modal
        const resetModal = new bootstrap.Modal(document.getElementById('reset-modal'));
        resetModal.show();

        // Handler entfernen, um Mehrfachbindung zu vermeiden
        document.getElementById('reset-modal-llm-action').onclick = null;
        document.getElementById('reset-modal-data-action').onclick = null;
        document.getElementById('reset-modal-all-action').onclick = null;

        // Nur LLM-Konfiguration zurücksetzen
        document.getElementById('reset-modal-llm-action').onclick = () => {
            localStorage.removeItem("llmType");
            localStorage.removeItem("llmModel");
            localStorage.removeItem("llmSystemPrompt");
            localStorage.removeItem("llmPromptPrefix");
            localStorage.removeItem("llmApiKey", ""); // Leeren Key speichern
            llmManager.updateConfig();
            document.getElementById('llm-chat-container').style.display = 'none';
            resetModal.hide();
            showNotification("LLM-Konfiguration wurde zurückgesetzt.", "info");
        };

        // Nur Daten zurücksetzen
        document.getElementById('reset-modal-data-action').onclick = () => {
            dataManager.clearData();
            visualizer.nodeCache.clear(true);
            resetModal.hide();
            showNotification("Daten wurden zurückgesetzt.", "info");
        };

        // Alles zurücksetzen
        document.getElementById('reset-modal-all-action').onclick = () => {
            dataManager.clearData();
            visualizer.nodeCache.clear(true);
            localStorage.clear();
            llmManager.updateConfig();
            document.getElementById('llm-chat-container').style.display = 'none';
            resetModal.hide();
            showNotification("Alle Daten und Konfigurationen wurden gelöscht.", "info");
        };
    });

    // Event-Handler für Bearbeiten- und Löschen-Buttons in der Detailansicht
    document.querySelector('.edit-system-btn').addEventListener('click', () => {
        const systemId = document.getElementById('detail-title').getAttribute('data-system-id');
        if (systemId) {
            systemManager.showSystemModal(systemId);
        }
    });

    document.querySelector('.delete-system-btn').addEventListener('click', () => {
        const systemId = document.getElementById('detail-title').getAttribute('data-system-id');
        if (systemId) {
            systemManager.showDeleteConfirmation(systemId);
        }
    });

    // Event-Handler für Bestätigungs-Modal
    document.getElementById('confirm-action').addEventListener('click', () => {
        const confirmAction = document.getElementById('confirm-action').getAttribute('data-action');
        const confirmId = document.getElementById('confirm-action').getAttribute('data-id');

        if (confirmAction === 'delete-system' && confirmId) {
            systemManager.deleteSystem(confirmId);
            bootstrap.Modal.getInstance(document.getElementById('confirm-modal')).hide();
        } else if (confirmAction === 'delete-dependency') {
            const sourceId = document.getElementById('confirm-action').getAttribute('data-source');
            const targetId = document.getElementById('confirm-action').getAttribute('data-target');
            if (sourceId && targetId) {
                dependencyManager.deleteDependency(sourceId, targetId);
                bootstrap.Modal.getInstance(document.getElementById('confirm-modal')).hide();
            }
        }
    });

    document.querySelector('.toggle-fix-btn').addEventListener('click', () => {
        const systemId = document.getElementById('detail-title').getAttribute('data-system-id');
        if (systemId) {
            const isNowFixed = visualizer.toggleNodeFixed(systemId);
        }
    });

    visualizer.on('toggleFixed', (data) => {
        const systemId = document.getElementById('detail-title').getAttribute('data-system-id');
        const { id, state } = data;

        if (id !== systemId) return;

        const toggleButton = document.querySelector('.toggle-fix-btn');
        if (state) {
            toggleButton.classList.add('active');
            toggleButton.title = 'Position freigeben';
            showNotification('Position wurde fixiert', 'info');
        } else {
            toggleButton.classList.remove('active');
            toggleButton.title = 'Position fixieren';
            showNotification('Position wurde freigegeben', 'info');
        }
    });

    // Close-Buttons in den Overlays
    document.querySelectorAll('.close-overlay').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-close-target');
            document.getElementById(targetId).classList.remove('active');
        });
    });

    // Overlay-Funktion
    function toggleOverlay(id) {
        const panel = document.getElementById(id);

        // Alle anderen Overlays schließen
        document.querySelectorAll('.overlay').forEach(overlay => {
            if (overlay.id !== id) overlay.classList.remove('active');
        });

        // Ausgewähltes Overlay umschalten
        panel.classList.toggle('active');
    }
});
function setupGroupsUI(systemManager) {
    const groupInput = document.getElementById('system-groups-input');
    const addButton = document.getElementById('add-group-btn');

    // Event-Listener für das Hinzufügen von Gruppen mit dem Button
    addButton.addEventListener('click', () => {
        const value = groupInput.value.trim();
        if (value) {
            // Wenn Kommas enthalten sind, mehrere Gruppen gleichzeitig hinzufügen
            if (value.includes(',')) {
                const groups = value.split(',').map(g => g.trim()).filter(g => g !== '');
                groups.forEach(group => systemManager.addGroupBadge(group));
            } else {
                systemManager.addGroupBadge(value);
            }
            groupInput.value = '';
        }
    });

    // Event-Listener für das Hinzufügen von Gruppen mit Enter
    groupInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addButton.click();
        }
    });

    // Auto-Vervollständigung bei Komma
    groupInput.addEventListener('input', () => {
        const value = groupInput.value;
        if (value.endsWith(',')) {
            const newGroup = value.slice(0, -1).trim();
            if (newGroup) {
                systemManager.addGroupBadge(newGroup);
                groupInput.value = '';
            }
        }
    });
}
// Diese Funktion nach der LlmIntegrationManager-Initialisierung aufrufen
function setupLlmChatInterface(llmManager) {
    // UI-Elemente
    const chatContainer = document.getElementById('llm-chat-container');
    const chatMessages = document.getElementById('llm-chat-messages');
    const chatInput = document.getElementById('llm-chat-input');
    const sendButton = document.getElementById('llm-chat-send');
    const closeButton = document.getElementById('llm-chat-close');
    const loadingIndicator = document.getElementById('llm-chat-loading');
    const toggleLlmChat = document.getElementById('toggle-llm-chat');
    const saveLlmConfig = document.getElementById('save-llm-config');
    const cancelLlmConfig = document.getElementById('cancel-llm-config');

    function isVisible() {
        return !chatContainer.classList.contains('active');
    }

    // Toggle-Button zur Controls-Leiste hinzufügen
    const controlsOverlay = document.querySelector('.controls-overlay .btn-group');
    if (controlsOverlay) {
        // Event-Listener für den Toggle-Button
        toggleLlmChat.addEventListener('click', toggleChat);
    }

    const hiddenKeyIfNotEmpty = "-----hidden-----";
    const configModal = new bootstrap.Modal(document.getElementById('llm-config-modal'));
    function changeLlmConfig() {
        // Felder mit gespeicherter Konfiguration befüllen
        document.getElementById('llm-type').value = localStorage.getItem("llmType") || "claude";
        document.getElementById('llm-api-key').value = localStorage.getItem("llmApiKey") ? hiddenKeyIfNotEmpty : "";
        document.getElementById('llm-model').value = localStorage.getItem("llmModel") || "";
        document.getElementById('llm-system-prompt').value = localStorage.getItem("llmSystemPrompt") || llmManager.getDefaultSystemPrompt();
        document.getElementById('llm-prompt-prefix').value = localStorage.getItem("llmPromptPrefix") || llmManager.getDefaultPromptPrefix();
        configModal.show();
    }

    function checkIfConfiguratedOrCloseChat() {
        if (!llmManager.isConfigurated()) {
            if (isVisible()) {
                chatContainer.style.display = 'none';
                toggleLlmChat.classList.remove('active');
                showNotification("Bitte konfiguriere den Chat-Assistenten.", "warning");
            }
            return false;
        }
        return true;
    }

    if (!llmManager.isConfigurated()) {
        chatContainer.style.display = 'none';
    }

    function saveConfig() {
        const llmType = document.getElementById('llm-type').value;
        const llmApiKey = document.getElementById('llm-api-key').value;
        const llmModel = document.getElementById('llm-model').value;
        const llmSystemPrompt = document.getElementById('llm-system-prompt').value;
        const llmPromptPrefix = document.getElementById('llm-prompt-prefix').value;

        // Konfiguration speichern
        localStorage.setItem("llmType", llmType);
        if (llmApiKey !== hiddenKeyIfNotEmpty) {
            encryptAndStore("llmApiKey", llmApiKey).then(() => {
                console.log("API-Key gespeichert");
            }).catch((error) => {
                console.error("Fehler beim Speichern des API-Keys:", error);
            });
        }
        localStorage.setItem("llmModel", llmModel);
        localStorage.setItem("llmSystemPrompt", llmSystemPrompt);
        localStorage.setItem("llmPromptPrefix", llmPromptPrefix);
        llmManager.updateConfig(llmType, llmModel, llmApiKey, llmSystemPrompt, llmPromptPrefix);
        if (checkIfConfiguratedOrCloseChat()) {
            chatContainer.style.display = 'flex';
            if (isVisible()) {
                chatInput.focus();
                if (chatMessages.children.length === 0) {
                    addSystemMessage("Wie kann ich dir bei der Verwaltung deiner IT-Infrastruktur helfen? Du kannst mir Änderungen beschreiben, und ich aktualisiere das Modell für dich.");
                }
            }
        }
        configModal.hide();
    }

    document.getElementById('llm-chat-settings').addEventListener('click', changeLlmConfig);
    document.querySelector('#llm-config-modal .btn-close').addEventListener('click', () => {
        checkIfConfiguratedOrCloseChat();
    });
    cancelLlmConfig.addEventListener('click', () => {
        checkIfConfiguratedOrCloseChat();
    });
    saveLlmConfig.addEventListener('click', () => {
        saveConfig();
    });

    // Chat öffnen/schließen
    function toggleChat() {
        const wasVisible = isVisible();
        if (wasVisible) {
            chatContainer.classList.add('active');
            toggleLlmChat.classList.remove('active');
        } else {
            chatContainer.classList.remove('active');
            toggleLlmChat.classList.add('active');
        }

        if (!wasVisible) {
            if (!llmManager.isConfigurated()) {
                changeLlmConfig();
            } else {
                chatInput.focus();

                // Willkommensnachricht anzeigen, wenn der Chat leer ist
                if (chatMessages.children.length === 0) {
                    addSystemMessage("Wie kann ich dir bei der Verwaltung deiner IT-Infrastruktur helfen? Du kannst mir Änderungen beschreiben, und ich aktualisiere das Modell für dich.");
                }
            }
        }
    }

    chatInput.addEventListener('focus', () => {
        if (chatContainer.classList.contains('active')) {
            chatContainer.classList.remove('active');
            if (!llmManager.isConfigurated()) {
                changeLlmConfig();
            } else {
                // Willkommensnachricht anzeigen, wenn der Chat leer ist
                if (chatMessages.children.length === 0) {
                    addSystemMessage("Wie kann ich dir bei der Verwaltung deiner IT-Infrastruktur helfen? Du kannst mir Änderungen beschreiben, und ich aktualisiere das Modell für dich.");
                }
            }
        }
    });

    // Let Chat-Input growth (chatInput)
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        const maxRows = 3;
        const lines = chatInput.value.split('\n').length;
        const rows = Math.min(lines, maxRows);
        chatInput.rows = rows;
    });

    // Close-Button
    closeButton.addEventListener('click', () => {
        chatContainer.classList.add('active');
        document.getElementById('toggle-llm-chat').classList.remove('active');
    });

    // Nachrichten senden
    sendButton.addEventListener('click', sendMessage);

    // Enter-Taste zum Senden (ohne Shift)
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Nachricht senden und LLM-Antwort verarbeiten
    async function sendMessage() {
        const userInput = chatInput.value.trim();
        if (!userInput) return;

        // Benutzereingabe anzeigen
        addUserMessage(userInput);
        chatInput.value = '';

        // Loading-Indikator anzeigen
        loadingIndicator.style.display = 'flex';

        // Aktuelle Nachricht im UI zusammenbauen
        let currentAssistantMessage = '';
        const messageElement = addAssistantMessage('');

        // LLM-Anfrage verarbeiten
        let currentResult = "";
        const result = await llmManager.processUserInput(userInput, (token) => {
            currentResult += token;
            messageElement.innerHTML = marked ? marked.parse(currentResult) : currentResult;
        });
        console.log(result);

        // Loading-Indikator ausblenden
        loadingIndicator.style.display = 'none';

        // Antwort anzeigen
        messageElement.innerHTML = marked ? marked.parse(result.originalResponse) : result.originalResponse;

        // Bei YAML-Antwort mit Änderungen
        if (result.success && result.yamlData) {
            showUpdateConfirmation(result.yamlData, result.differences);
        }
    }

    // Zeigt Bestätigungsdialog für Änderungen an
    function showUpdateConfirmation(newData, differences) {
        // Nur bestätigen lassen, wenn es Änderungen gibt
        if (differences.added.systems.length === 0 &&
            differences.modified.systems.length === 0 &&
            differences.removed.systems.length === 0 &&
            differences.added.dependencies.length === 0 &&
            differences.modified.dependencies.length === 0 &&
            differences.removed.dependencies.length === 0) {
            return;
        }

        // Zusammenfassung der Änderungen erstellen
        let summaryText = "Folgende Änderungen wurden erkannt:\n\n";

        // Systeme
        if (differences.added.systems.length > 0) {
            summaryText += `➕ ${differences.added.systems.length} neue Systeme: ${differences.added.systems.map(s => s.name).join(', ')}\n`;
        }
        if (differences.modified.systems.length > 0) {
            summaryText += `✏️ ${differences.modified.systems.length} geänderte Systeme: ${differences.modified.systems.map(s => s.name).join(', ')}\n`;
        }
        if (differences.removed.systems.length > 0) {
            summaryText += `❌ ${differences.removed.systems.length} entfernte Systeme: ${differences.removed.systems.map(s => s.name).join(', ')}\n`;
        }

        // Abhängigkeiten
        if (differences.added.dependencies.length > 0) {
            summaryText += `➕ ${differences.added.dependencies.length} neue Verbindungen\n`;
        }
        if (differences.modified.dependencies.length > 0) {
            summaryText += `✏️ ${differences.modified.dependencies.length} geänderte Verbindungen\n`;
        }
        if (differences.removed.dependencies.length > 0) {
            summaryText += `❌ ${differences.removed.dependencies.length} entfernte Verbindungen\n`;
        }

        // Nachricht erstellen
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-system-message';
        messageElement.textContent = summaryText;

        // Aktions-Buttons hinzufügen
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'llm-update-actions';

        const applyButton = document.createElement('button');
        applyButton.className = 'btn btn-primary';
        applyButton.textContent = 'Änderungen anwenden';
        applyButton.addEventListener('click', () => {
            // Daten im DataManager aktualisieren
            llmManager.applyChanges(differences);

            // Feedback anzeigen
            addSystemMessage("Die Änderungen wurden erfolgreich angewendet.");

            // Button-Container entfernen
            messageElement.removeChild(actionsDiv);
        });

        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn btn-outline-secondary';
        cancelButton.textContent = 'Verwerfen';
        cancelButton.addEventListener('click', () => {
            addSystemMessage("Die Änderungen wurden verworfen.");

            // Button-Container entfernen
            messageElement.removeChild(actionsDiv);
        });

        actionsDiv.appendChild(applyButton);
        actionsDiv.appendChild(cancelButton);
        messageElement.appendChild(actionsDiv);

        // Zum Chat hinzufügen
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Hilfsfunktionen zum Hinzufügen von Nachrichten

    function addUserMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-user-message';
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }

    function addAssistantMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-assistant-message';
        messageElement.innerHTML = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }

    function addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-system-message';
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }
}