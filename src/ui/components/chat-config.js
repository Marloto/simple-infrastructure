import { OverlayComponent } from '../base/overlay-component.js';

const chatConfigModalTemplate = () => `
    <div class="modal fade" id="llm-config-modal" tabindex="-1" aria-labelledby="llm-config-modal-label"
        aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="llm-config-modal-label">Chatbot / LLM Configuration</h5>
                    <button type="button" class="btn-close" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="llm-config-form">
                        <div class="form-floating mb-3">
                            <select class="form-select" id="llm-type" required>
                                <option value="claude">Anthropic Claude</option>
                                <option value="openai">OpenAI</option>
                                <option value="custom">Custom</option>
                            </select>
                            <label for="llm-type">LLM Provider</label>
                        </div>
                        <div class="form-floating mb-3">
                            <input type="password" class="form-control" id="llm-api-key" autocomplete="off" required
                                placeholder="API Key">
                            <label for="llm-api-key">API Key</label>
                        </div>
                        <div class="form-floating mb-3">
                            <input type="text" class="form-control" id="llm-model" required placeholder="Model name">
                            <label for="llm-model">Model name</label>
                        </div>
                        <div class="form-floating mb-3" id="llm-url-container" style="display: none;">
                            <input type="text" class="form-control" id="llm-url" placeholder="URL (Optional)">
                            <label for="llm-url">Backend URL</label>
                        </div>
                        <div class="accordion" id="llm-advanced-settings">
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="headingAdvanced">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                                        data-bs-target="#collapseAdvanced" aria-expanded="false"
                                        aria-controls="collapseAdvanced">
                                        Advanced settings (optional)
                                    </button>
                                </h2>
                                <div id="collapseAdvanced" class="accordion-collapse collapse"
                                    aria-labelledby="headingAdvanced" data-bs-parent="#llm-advanced-settings">
                                    <div class="accordion-body">
                                        <div class="form-floating mb-3">
                                            <textarea class="form-control" id="llm-system-prompt" rows="3"
                                                placeholder="Optional system prompt" style="height: 120px"></textarea>
                                            <label for="llm-system-prompt">System prompt</label>
                                            <div class="form-text text-muted">
                                                You can use {{dataStructure}} to refer to the data structure.
                                            </div>
                                        </div>

                                        <div class="form-floating mb-3">
                                            <textarea class="form-control" id="llm-prompt-prefix" rows="3"
                                                placeholder="Optional prompt prefix" style="height: 120px"></textarea>
                                            <label for="llm-prompt-prefix">Prompt prefix</label>
                                            <div class="form-text text-muted">
                                                You can use {{currentData}} to refer to the current data and {{example}} to prompt how it should look like. For the user request use {{userInput}}.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="cancel-llm-config">Cancel</button>
                    <button type="button" class="btn btn-primary" id="save-llm-config">Save</button>
                </div>
            </div>
        </div>
    </div>
`;

const hiddenKeyIfNotEmpty = "-----hidden-----";

export class ChatConfig extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
        this.modalElement = null;
        this.modal = null;
    }

    setupDOM() {
        this.modalElement = this.render(chatConfigModalTemplate());
        this.element.appendChild(this.modalElement);
        this.modal = new bootstrap.Modal(this.modalElement);

        this.saveLlmConfig = this.modalElement.querySelector('#save-llm-config');
        this.cancelLlmConfig = this.modalElement.querySelector('#cancel-llm-config');
        this.llmUrlContainer = this.modalElement.querySelector('#llm-url-container');
        this.llmUrlElement = this.modalElement.querySelector('#llm-url');
        this.llmTypeElement = this.modalElement.querySelector('#llm-type');
        this.llmApiKeyElement = this.modalElement.querySelector('#llm-api-key');
        this.llmModelElement = this.modalElement.querySelector('#llm-model');
        this.llmSystemPromptElement = this.modalElement.querySelector('#llm-system-prompt');
        this.llmPromptPrefixElement = this.modalElement.querySelector('#llm-prompt-prefix');

        this.toggleLlmUrl();
    }
    
    bindEvents() {
        this.llmTypeElement.addEventListener('change', () => this.toggleLlmUrl());
        this.modalElement.querySelector('.btn-close').addEventListener('click', () => this.hide());
        this.cancelLlmConfig.addEventListener('click', () => this.hide());
        this.saveLlmConfig.addEventListener('click', () => this.saveConfig());
    }

    saveConfig() {
        const llmType = this.llmTypeElement.value;
        const llmApiKey = this.llmApiKeyElement.value;
        const llmModel = this.llmModelElement.value;
        const llmSystemPrompt = this.llmSystemPromptElement.value;
        const llmPromptPrefix = this.llmPromptPrefixElement.value;
        const llmUrl = this.llmUrlElement.value;

        // Save config
        const llmConfig = this.dependencies.llmConfig;
        llmConfig.llmType = llmType;
        if (llmApiKey !== hiddenKeyIfNotEmpty) {
            llmConfig.updateLlmApiKey(llmApiKey).then(() => {
                console.log("API key saved");
            }).catch((error) => {
                console.error("Error saving API key:", error);
            });
        }
        llmConfig.llmModel = llmModel;
        llmConfig.llmSystemPrompt = llmSystemPrompt;
        llmConfig.llmPromptPrefix = llmPromptPrefix;
        llmConfig.llmUrl = llmUrl;
        
        this.dependencies.llmManager.updateConfig(llmType, llmModel, llmApiKey, llmSystemPrompt, llmPromptPrefix, llmUrl);

        this.emit("saved");

        this.hide();
    }
    
    toggleLlmUrl() {
        this.llmUrlContainer.style.display = this.llmTypeElement.value === 'custom' ? '' : 'none';
        this.llmUrlElement.required = this.llmTypeElement.value === 'custom';
    }

    onShow() {
        const llmConfig = this.dependencies.llmConfig;
        this.llmTypeElement.value = llmConfig.llmType;
        this.llmApiKeyElement.value = llmConfig.hasLlmApiKey() ? hiddenKeyIfNotEmpty : "";
        this.llmModelElement.value = llmConfig.llmModel;
        this.llmSystemPromptElement.value = llmConfig.llmSystemPrompt;
        this.llmPromptPrefixElement.value = llmConfig.llmPromptPrefix;
        this.llmUrlElement.value = llmConfig.llmUrl;
        this.toggleLlmUrl();
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
    }
}