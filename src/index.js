import { DataManager } from './data-manager.js';
import { SystemVisualizer } from './visualizer.js';
import { DependencyManager } from './dependency-manager.js';
import { SystemManager } from './system-manager.js';
import { LlmIntegrationManager } from './llm-integration-manager.js';
import { showNotification } from './utilities.js';

window.DataManager = DataManager;
window.SystemVisualizer = SystemVisualizer;
window.DependencyManager = DependencyManager;
window.SystemManager = SystemManager;
window.LlmIntegrationManager = LlmIntegrationManager;

window.showNotification = showNotification;
