import { OverlayComponent } from '../base/overlay-component.js';
import { showNotification } from '../../utils/utilities.js';

const createResetModalTemplate = () => `
    <div class="modal fade" id="reset-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog" style="max-width: 50vw;">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Delete data</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="confirm-message">
                    Do you want to delete all local infrastructure data and LLM configuration?
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-warning" id="reset-modal-llm-action">LLM configuration</button>
                    <button type="button" class="btn btn-warning" id="reset-modal-data-action">Infrastructure</button>
                    <button type="button" class="btn btn-danger" id="reset-modal-all-action">Delete all</button>
                </div>
            </div>
        </div>
    </div>
`;

export class ResetData extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.modalElement = this.render(createResetModalTemplate());
        this.element.appendChild(this.modalElement);
        this.modal = new bootstrap.Modal(this.modalElement);
    }

    bindEvents() {
        this.dependencies.toolbar.button('bi-x-circle', 'Reset data', () => {
            this.show();
        }, 'import-export');

        // Nur LLM-Konfiguration zurücksetzen
        this.modalElement.querySelector('#reset-modal-llm-action').addEventListener('click', () => {
            this.dependencies.llmConfig.reset();
            this.dependencies.llmManager.updateConfig();
            this.dependencies.chatInterface.hide();

            this.hide();

            showNotification("LLM-Konfiguration wurde zurückgesetzt.", "info");
        });

        // Nur Daten zurücksetzen
        this.modalElement.querySelector('#reset-modal-data-action').addEventListener('click', () => {
            this.dependencies.dataManager.clearData();
            this.dependencies.visualizer.nodeCache.clear(true);

            this.hide();

            showNotification("Daten wurden zurückgesetzt.", "info");
        });

        // Alles zurücksetzen
        this.modalElement.querySelector('#reset-modal-all-action').addEventListener('click', () => {
            this.dependencies.llmConfig.reset();
            this.dependencies.llmManager.updateConfig();
            this.dependencies.chatInterface.hide();
            
            this.dependencies.dataManager.clearData();
            this.dependencies.visualizer.nodeCache.clear(true);
            
            this.hide();

            showNotification("All data and configurations have been deleted.", "info");
        });
    }

    onShow() {
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
    }
}