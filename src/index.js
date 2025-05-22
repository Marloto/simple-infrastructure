import { DataManager } from './data-manager.js';
import { SystemVisualizer } from './visualizer.js';
import { DependencyManager } from './dependency-manager.js';
import { SystemManager } from './system-manager.js';
import { LlmIntegrationManager } from './llm-integration-manager.js';
import { downloadSystemData, uploadSystemData, downloadVisualizationAsSVG, downloadVisualizationAsPNG } from './data-loader.js';
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
        llmUrl: localStorage.getItem("llmUrl") || "", // Nur für custom-Typ
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
            showNotification("All data and configurations have been deleted.", "info");
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
            toggleButton.title = 'Release position';
            showNotification('Position has been fixed', 'info');
        } else {
            toggleButton.classList.remove('active');
            toggleButton.title = 'Fix position';
            showNotification('Position has been released', 'info');
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
    const llmUrlContainer = document.getElementById('llm-url-container');
    const llmUrlElement = document.getElementById('llm-url');
    const llmTypeElement = document.getElementById('llm-type');
    const llmApiKeyElement = document.getElementById('llm-api-key');
    const llmModelElement = document.getElementById('llm-model');
    const llmSystemPromptElement = document.getElementById('llm-system-prompt');
    const llmPromptPrefixElement = document.getElementById('llm-prompt-prefix');

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
        llmTypeElement.value = localStorage.getItem("llmType") || "claude";
        llmApiKeyElement.value = localStorage.getItem("llmApiKey") ? hiddenKeyIfNotEmpty : "";
        llmModelElement.value = localStorage.getItem("llmModel") || "";
        llmSystemPromptElement.value = localStorage.getItem("llmSystemPrompt") || llmManager.getDefaultSystemPrompt();
        llmPromptPrefixElement.value = localStorage.getItem("llmPromptPrefix") || llmManager.getDefaultPromptPrefix();
        llmUrlElement.value = localStorage.getItem("llmUrl") || "";
        toggleLlmUrl();
        configModal.show();
    }

    function checkIfConfiguratedOrCloseChat() {
        if (!llmManager.isConfigurated()) {
            if (isVisible()) {
                chatContainer.style.display = 'none';
                toggleLlmChat.classList.remove('active');
                showNotification("Please configure the chat assistant.", "warning");
            }
            return false;
        }
        return true;
    }

    if (!llmManager.isConfigurated()) {
        chatContainer.style.display = 'none';
    }

    function addWelcome() {
        if (chatMessages.children.length === 0) {
            addSystemMessage("How can I assist you with managing your IT infrastructure? You can describe changes to me, and I will update the model for you.");
        }
    }

    function saveConfig() {
        const llmType = llmTypeElement.value;
        const llmApiKey = llmApiKeyElement.value;
        const llmModel = llmModelElement.value;
        const llmSystemPrompt = llmSystemPromptElement.value;
        const llmPromptPrefix = llmPromptPrefixElement.value;
        const llmUrl = llmUrlElement.value;

        // Konfiguration speichern
        localStorage.setItem("llmType", llmType);
        if (llmApiKey !== hiddenKeyIfNotEmpty) {
            encryptAndStore("llmApiKey", llmApiKey).then(() => {
                console.log("API key saved");
            }).catch((error) => {
                console.error("Error saving API key:", error);
            });
        }
        localStorage.setItem("llmModel", llmModel);
        localStorage.setItem("llmSystemPrompt", llmSystemPrompt);
        localStorage.setItem("llmPromptPrefix", llmPromptPrefix);
        localStorage.setItem("llmUrl", llmUrl);
        llmManager.updateConfig(llmType, llmModel, llmApiKey, llmSystemPrompt, llmPromptPrefix, llmUrl);
        if (checkIfConfiguratedOrCloseChat()) {
            chatContainer.style.display = 'flex';
            if (isVisible()) {
                chatInput.focus();
                addWelcome();
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

    function toggleLlmUrl() {
        llmUrlContainer.style.display = llmTypeElement.value === 'custom' ? '' : 'none';
        llmUrlElement.required = llmTypeElement.value === 'custom';
    }
    llmTypeElement.addEventListener('change', toggleLlmUrl);
    toggleLlmUrl();

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
                addWelcome();
            }
        }
    }

    chatInput.addEventListener('focus', () => {
        if (chatContainer.classList.contains('active')) {
            chatContainer.classList.remove('active');
            if (!llmManager.isConfigurated()) {
                changeLlmConfig();
            } else {
                addWelcome();
            }
        }
    });

    // Let chat input grow (chatInput)
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

    // Send messages
    sendButton.addEventListener('click', sendMessage);

    // Enter key to send (without Shift)
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Send message and process LLM response
    async function sendMessage() {
        const userInput = chatInput.value.trim();
        if (!userInput) return;

        // Display user input
        addUserMessage(userInput);
        chatInput.value = '';

        // Show loading indicator
        loadingIndicator.style.display = 'flex';

        // Build current message in the UI
        let currentAssistantMessage = '';
        const messageElement = addAssistantMessage('');

        // Process LLM request
        let currentResult = "";
        const result = await llmManager.processUserInput(userInput, (token) => {
            currentResult += token;
            messageElement.innerHTML = marked ? marked.parse(currentResult) : currentResult;
        });
        console.log(result);

        // Hide loading indicator
        loadingIndicator.style.display = 'none';

        // Display response
        messageElement.innerHTML = marked ? marked.parse(result.originalResponse) : result.originalResponse;

        // If YAML response with changes
        if (result.success && result.yamlData) {
            showUpdateConfirmation(result.yamlData, result.differences);
        }
    }

    // Shows confirmation dialog for changes
    function showUpdateConfirmation(newData, differences) {
        // Only show confirmation if there are changes
        if (
            differences.added.systems.length === 0 &&
            differences.modified.systems.length === 0 &&
            differences.removed.systems.length === 0 &&
            differences.added.dependencies.length === 0 &&
            differences.modified.dependencies.length === 0 &&
            differences.removed.dependencies.length === 0
        ) {
            return;
        }

        // Create summary of changes
        let summaryText = "The following changes were detected:\n\n";

        // Systems
        if (differences.added.systems.length > 0) {
            summaryText += `➕ ${differences.added.systems.length} new systems: ${differences.added.systems.map(s => s.name).join(', ')}\n`;
        }
        if (differences.modified.systems.length > 0) {
            summaryText += `✏️ ${differences.modified.systems.length} modified systems: ${differences.modified.systems.map(s => s.name).join(', ')}\n`;
        }
        if (differences.removed.systems.length > 0) {
            summaryText += `❌ ${differences.removed.systems.length} removed systems: ${differences.removed.systems.map(s => s.name).join(', ')}\n`;
        }

        // Dependencies
        if (differences.added.dependencies.length > 0) {
            summaryText += `➕ ${differences.added.dependencies.length} new connections\n`;
        }
        if (differences.modified.dependencies.length > 0) {
            summaryText += `✏️ ${differences.modified.dependencies.length} modified connections\n`;
        }
        if (differences.removed.dependencies.length > 0) {
            summaryText += `❌ ${differences.removed.dependencies.length} removed connections\n`;
        }

        // Create message
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-system-message';
        messageElement.textContent = summaryText;

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'llm-update-actions';

        const applyButton = document.createElement('button');
        applyButton.className = 'btn btn-primary';
        applyButton.textContent = 'Apply changes';
        applyButton.addEventListener('click', () => {
            // Update data in DataManager
            llmManager.applyChanges(differences);

            // Show feedback
            addSystemMessage("The changes have been applied successfully.");

            // Remove button container
            messageElement.removeChild(actionsDiv);
        });

        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn btn-outline-secondary';
        cancelButton.textContent = 'Discard';
        cancelButton.addEventListener('click', () => {
            addSystemMessage("The changes have been discarded.");

            // Remove button container
            messageElement.removeChild(actionsDiv);
        });

        actionsDiv.appendChild(applyButton);
        actionsDiv.appendChild(cancelButton);
        messageElement.appendChild(actionsDiv);

        // Add to chat
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

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

    function setupImageExport() {
        const downloadButton = document.getElementById('download-image');

        if (!downloadButton) {
            console.warn('Download image button not found');
            return;
        }

        // Track whether the dropup is currently visible
        let dropupVisible = false;
        let dropupMenu = null;

        // Event listener for the button
        downloadButton.addEventListener('click', function (event) {
            event.stopPropagation();

            // If the menu is already shown, remove it
            if (dropupVisible && dropupMenu) {
                document.body.removeChild(dropupMenu);
                dropupVisible = false;
                return;
            }

            // Create a dropdown menu below the button
            dropupMenu = document.createElement('div');
            dropupMenu.className = 'dropdown-menu show';
            dropupMenu.style.position = 'absolute';

            // Calculate position (below the button as a dropdown)
            const buttonRect = downloadButton.getBoundingClientRect();
            dropupMenu.style.top = (buttonRect.bottom + 5) + 'px'; // 5px gap to the button
            dropupMenu.style.left = buttonRect.left + 'px';
            dropupMenu.style.minWidth = '140px';
            dropupMenu.style.backgroundColor = '#fff';
            dropupMenu.style.border = '1px solid rgba(0,0,0,.15)';
            dropupMenu.style.borderRadius = '.25rem';
            dropupMenu.style.padding = '.5rem 0';
            dropupMenu.style.zIndex = '1000';
            dropupMenu.style.boxShadow = '0 0.5rem 1rem rgba(0, 0, 0, 0.15)';

            // Add menu items
            dropupMenu.innerHTML = `
            <a class="dropdown-item px-3 py-2" href="#" id="download-svg">
                <i class="bi bi-filetype-svg me-2"></i>As SVG
            </a>
            <a class="dropdown-item px-3 py-2" href="#" id="download-png">
                <i class="bi bi-filetype-png me-2"></i>As PNG
            </a>
        `;

            // Add to body
            document.body.appendChild(dropupMenu);
            dropupVisible = true;

            // Event listeners for menu items
            document.getElementById('download-svg').addEventListener('click', function (e) {
                e.preventDefault();
                downloadVisualizationAsSVG();
                document.body.removeChild(dropupMenu);
                dropupVisible = false;
            });

            document.getElementById('download-png').addEventListener('click', function (e) {
                e.preventDefault();
                downloadVisualizationAsPNG();
                document.body.removeChild(dropupMenu);
                dropupVisible = false;
            });

            // Clicking outside the menu closes it
            document.addEventListener('click', function closeDropup(e) {
                if (dropupVisible && !dropupMenu.contains(e.target) && e.target !== downloadButton) {
                    document.body.removeChild(dropupMenu);
                    dropupVisible = false;
                    document.removeEventListener('click', closeDropup);
                }
            });
        });

        console.log('Image export functionality has been added');
    }

    setupImageExport();
}