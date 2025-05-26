import { OverlayComponent } from '../base/overlay-component.js';
import { showNotification } from '../../utils/utilities.js';

const deleteSystemModalTemplate = () => `
    <div class="modal fade" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Confirmation required</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="confirm-system-message">
                    Do you really want to delete this element?
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" id="confirm-system-action">Delete</button>
                </div>
            </div>
        </div>
    </div>
`;

export class DeleteSystemComponent extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
        this.modalElement = null;
        this.modal = null;
    }

    setupDOM() {
        this.modalElement = this.render(deleteSystemModalTemplate());
        this.element.appendChild(this.modalElement);
        this.modal = new bootstrap.Modal(this.modalElement);

        this.confirm = this.modalElement.querySelector('#confirm-system-action');
        this.message = this.modalElement.querySelector('#confirm-system-message');
    }

    bindEvents() {
        this.confirm.addEventListener('click', () => {
            const confirmId = this.confirm.getAttribute('data-id');

            if (confirmId) {
                this.deleteSystem(confirmId);
                this.hide();
            }
        });
    }

    /**
     * Shows the delete confirmation for a system
     * @param {string} systemId - The ID of the system to delete
     */
    showDeleteConfirmation(systemId) {
        const system = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        // Check if the system is used in dependencies
        const data = this.dependencies.dataManager.getData();
        const incomingDeps = data.dependencies.filter(dep => dep.target === systemId);
        const outgoingDeps = data.dependencies.filter(dep => dep.source === systemId);

        let message = `Do you really want to delete the system "${system.name}"?`;

        if (incomingDeps.length > 0 || outgoingDeps.length > 0) {
            message += `<br><br><div class="alert alert-warning">
                <strong>Warning:</strong> This system has ${incomingDeps.length + outgoingDeps.length} 
                dependencies that will also be deleted.
            </div>`;
        }

        this.message.innerHTML = message;
        this.confirm.setAttribute('data-id', systemId);

        // Show modal
        this.show();
    }

    /**
     * Deletes a system and its dependencies
     * @param {string} systemId - The ID of the system to delete
     */
    deleteSystem(systemId) {
        // Find system and store name for notification
        const system = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        const systemName = system.name;

        // Delete system via DataManager
        this.dependencies.dataManager.deleteSystem(systemId);

        showNotification(`System "${systemName}" and related dependencies have been deleted`, 'success');
    }

    onShow() {
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
    }
}