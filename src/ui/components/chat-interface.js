import { UIComponent } from '../base/ui-component.js';
import { showNotification } from '../../utilities.js';

const chatUiTemplate = () => `
    <div id="llm-chat-container" class="llm-chat-container active" style="display: flex;">
        <div class="llm-chat-header align-items-center justify-content-between">
            <h5>Infrastructure Assistant</h5>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm p-0 me-2" id="llm-chat-settings" title="Settings">
                    <i class="bi bi-gear fs-5"></i>
                </button>
                <button type="button" class="btn-close" id="llm-chat-close" aria-label="Close"></button>
            </div>
        </div>
        <div class="llm-chat-messages" id="llm-chat-messages">
            <!-- Chat messages will be inserted here -->
        </div>
        <div class="llm-chat-input-container">
            <textarea id="llm-chat-input" class="llm-chat-input"
                placeholder="Describe changes to the infrastructure..." rows="1"></textarea>
            <button id="llm-chat-send" class="llm-chat-send btn btn-primary">
                <i class="bi bi-send"></i>
            </button>
            <div class="llm-chat-loading" id="llm-chat-loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Processing...</span>
                </div>
            </div>
        </div>
    </div>
`;

export class ChatInterface extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.chatContainer = this.render(chatUiTemplate());
        this.element.appendChild(this.chatContainer);

        this.chatMessages = this.chatContainer.querySelector('#llm-chat-messages');
        this.chatInput = this.chatContainer.querySelector('#llm-chat-input');
        this.sendButton = this.chatContainer.querySelector('#llm-chat-send');
        this.closeButton = this.chatContainer.querySelector('#llm-chat-close');
        this.loadingIndicator = this.chatContainer.querySelector('#llm-chat-loading');
        this.chatSettings = this.chatContainer.querySelector('#llm-chat-settings')

        if (!this.dependencies.llmManager.isConfigurated()) {
            this.chatContainer.style.display = 'none';
        }
    }

    hide() {
        this.chatContainer.style.display = 'none';
    }

    addWelcome() {
        if (this.chatMessages.children.length === 0) {
            this.addSystemMessage("How can I assist you with managing your IT infrastructure? You can describe changes to me, and I will update the model for you.");
        }
    }

    bindEvents() {
        this.toggleLlmChat = this.dependencies.toolbar.button('bi-chat-dots', 'Chat assistant', () => {
            this.toggleChat()
        }, 'create', ['toggle-llm-chat']);
        this.chatSettings.addEventListener('click', () => this.openSettings());
        this.chatInput.addEventListener('focus', () => {
            if (this.chatContainer.classList.contains('active')) {
                this.chatContainer.classList.remove('active');
                if (!this.dependencies.llmManager.isConfigurated()) {
                    this.changeLlmConfig();
                } else {
                    this.addWelcome();
                }
            }
        });
        
        this.chatInput.addEventListener('input', () => {
            this.chatInput.style.height = 'auto';
            const maxRows = 3;
            const lines = this.chatInput.value.split('\n').length;
            const rows = Math.min(lines, maxRows);
            this.chatInput.rows = rows;
        });

        this.closeButton.addEventListener('click', () => {
            this.chatContainer.classList.add('active');
            document.getElementById('toggle-llm-chat').classList.remove('active');
        });

        this.sendButton.addEventListener('click', () => this.sendMessage());

        this.chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        });
        
        this.dependencies.chatConfig.on('hidden', () => this.checkIfConfiguratedOrCloseChat());

        this.dependencies.chatConfig.on('saved', () => {
            if (this.checkIfConfiguratedOrCloseChat()) {
                this.chatContainer.style.display = 'flex';
                if (this.isVisible()) {
                    this.chatInput.focus();
                    this.addWelcome();
                }
            } else {
                this.toggleLlmChat.classList.remove('active');
            }
        });
    }

    async sendMessage() {
        const userInput = this.chatInput.value.trim();
        if (!userInput) return;

        // Display user input
        this.addUserMessage(userInput);
        this.chatInput.value = '';

        // Show loading indicator
        this.loadingIndicator.style.display = 'flex';

        // Build current message in the UI
        let currentAssistantMessage = '';
        const messageElement = this.addAssistantMessage('');

        // Process LLM request
        let currentResult = "";
        const result = await this.dependencies.llmManager.processUserInput(userInput, (token) => {
            currentResult += token;
            messageElement.innerHTML = marked ? marked.parse(currentResult) : currentResult;
        });
        console.log(result);

        // Hide loading indicator
        this.loadingIndicator.style.display = 'none';

        // Display response
        messageElement.innerHTML = marked ? marked.parse(result.originalResponse) : result.originalResponse;

        // If YAML response with changes
        if (result.success && result.yamlData) {
            this.showUpdateConfirmation(result.yamlData, result.differences);
        }
    }

    showUpdateConfirmation(newData, differences) {
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
            this.dependencies.llmManager.applyChanges(differences);

            // Show feedback
            this.addSystemMessage("The changes have been applied successfully.");

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
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addUserMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-user-message';
        messageElement.textContent = message;
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return messageElement;
    }

    addAssistantMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-assistant-message';
        messageElement.innerHTML = message;
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return messageElement;
    }

    addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'llm-chat-message llm-system-message';
        messageElement.textContent = message;
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return messageElement;
    }

    toggleChat() {
        const wasVisible = this.isVisible();
        if (wasVisible) {
            this.chatContainer.classList.add('active');
            this.toggleLlmChat.classList.remove('active');
        } else {
            this.chatContainer.classList.remove('active');
            this.toggleLlmChat.classList.add('active');
        }

        if (!wasVisible) {
            if (!this.dependencies.llmManager.isConfigurated()) {
                this.openSettings();
            } else {
                this.chatInput.focus();
                this.addWelcome();
            }
        }
    }

    openSettings = () => {
        this.dependencies.chatConfig.show();
    }

    isVisible() {
        return !this.chatContainer.classList.contains('active');
    }

    checkIfConfiguratedOrCloseChat() {
        if (!this.dependencies.llmManager.isConfigurated()) {
            if (this.isVisible()) {
                this.chatContainer.style.display = 'none';
                this.toggleLlmChat.classList.remove('active');
                showNotification("Please configure the chat assistant.", "warning");
            }
            return false;
        }
        return true;
    }
}