import { DataManager } from './data-manager.js';
import { SystemVisualizer } from './ui/components/visualizer.js';
import { HistoryManager } from './history-manager.js';
import { LlmConfig } from './llm-config.js';
import { LlmIntegrationManager } from './llm-integration-manager.js';
import { showNotification } from './utilities.js';

import { ChatConfig } from './ui/components/chat-config.js';
import { ChatInterface } from './ui/components/chat-interface.js';
import { ExportImage } from './ui/components/export.js';
import { EditSystemComponent } from './ui/components/edit-system.js';
import { DeleteSystemComponent } from './ui/components/delete-system.js';
import { DeleteDependencyComponent } from './ui/components/delete-dependency.js';
import { DependencyManager } from './ui/components/dependency-manager.js';
import { Toolbar } from './ui/components/toolbar.js';
import { HistoryHelper } from './ui/components/history.js';
import { SearchOverlay } from './ui/components/search.js';
import { FilterOverlay } from './ui/components/filter.js';
import { LegendOverlay } from './ui/components/legend.js';
import { DownloadHelper } from './ui/components/download.js';
import { UploadHelper } from './ui/components/upload.js';
import { ResetData } from './ui/components/reset.js';
import { ResetZoomHelper } from './ui/components/reset-zoom.js';
import { DetailsOverlay } from './ui/components/details-overlay.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Systemdaten laden und DataManager initialisieren
    const dataManager = new DataManager();
    console.log('Systemdaten geladen:', dataManager.data);

    // Create HistoryManager for undo/redo functionality
    const historyManager = new HistoryManager(dataManager);

    // LLM-Integration initialisieren (NEU)
    const llmConfig = new LlmConfig();
    const llmManager = new LlmIntegrationManager({
        apiKey: (await llmConfig.loadLlmApiKey()) || "", // API-Key aus localStorage
        llmType: llmConfig.llmType || "", // claude, openai, custom
        llmModel: llmConfig.llmModel || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        llmSystemPrompt: llmConfig.llmSystemPrompt || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        llmPromptPrefix: llmConfig.llmPromptPrefix || "", // Modell je nach LLM-Typ, e.g. claude-3-7-sonnet-20250219
        llmUrl: llmConfig.llmUrl || "", // Nur für custom-Typ
    });
    llmManager.initialize(dataManager);

    // UI Components
    const visualizer = new SystemVisualizer('#visualization-container', {dataManager});
    const toolbar = new Toolbar('.controls-overlay', {});
    const editSystemComponent = new EditSystemComponent('body', { dataManager, toolbar });
    const dependencyManager = new DependencyManager('body', {
        dataManager, 
        visualizer, 
        toolbar,
    });
    const chatConfig = new ChatConfig('body', {llmManager, llmConfig});
    const chatInterface = new ChatInterface('.main-container', { llmManager, chatConfig, toolbar });
    const deleteSystemComponent = new DeleteSystemComponent('body', { dataManager });

    [
        visualizer,
        editSystemComponent, 
        dependencyManager, 
        chatConfig, 
        chatInterface, 
        deleteSystemComponent, 
        new DeleteDependencyComponent('body', { dataManager, dependencyManager }),
        new HistoryHelper('body', { historyManager, toolbar }),
        new SearchOverlay('.main-container', { toolbar, visualizer, dataManager }),
        new FilterOverlay('.main-container', { toolbar, visualizer, dataManager }),
        new LegendOverlay('.main-container', { toolbar, visualizer, dataManager }),
        new ResetZoomHelper('.main-container', { toolbar, visualizer }),
        new ExportImage('body', { toolbar }), 
        new UploadHelper('.main-container', { toolbar, dataManager }),
        new DownloadHelper('.main-container', { toolbar, dataManager }),
        new ResetData('body', { toolbar, dataManager, llmConfig, llmManager, chatInterface, visualizer }),
        new DetailsOverlay('.main-container', { dataManager, visualizer, editSystemComponent, deleteSystemComponent }),
    ].forEach(component => {
        component.initialize();
    });
});