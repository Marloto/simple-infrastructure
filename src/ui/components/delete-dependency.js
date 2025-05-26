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
                <div class="modal-body" id="confirm-dependency-message">
                    Do you really want to delete this element?
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-danger" id="confirm-dependency-action">Delete</button>
                </div>
            </div>
        </div>
    </div>
`;

export class DeleteDependencyComponent extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
        this.modalElement = null;
        this.modal = null;
    }

    setupDOM() {
        this.modalElement = this.render(deleteSystemModalTemplate());
        this.element.appendChild(this.modalElement);
        this.modal = new bootstrap.Modal(this.modalElement);

        this.confirm = this.modalElement.querySelector('#confirm-dependency-action');
        this.message = this.modalElement.querySelector('#confirm-dependency-message');
    }

    bindEvents() {
        this.confirm.addEventListener('click', () => {
            const sourceId = this.confirm.getAttribute('data-source');
            const targetId = this.confirm.getAttribute('data-target');
            if (sourceId && targetId) {
                this.deleteDependency(sourceId, targetId);
                this.hide();
            }
        });

        this.dependencies.connectionMode.on('linkDeleted', (data) => {
            this.showDeleteDependencyConfirmation(data.source, data.target);
        });
    }

    /**
     * Shows a confirmation prompt to delete a dependency
     */
    showDeleteDependencyConfirmation(sourceId, targetId) {
        const sourceSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Confirmation message
        const message = `Do you really want to delete the connection from "${sourceSystem.name}" to "${targetSystem.name}"?`;
        
        this.message.innerHTML = message;
        this.confirm.setAttribute('data-action', 'delete-dependency');
        this.confirm.setAttribute('data-source', sourceId);
        this.confirm.setAttribute('data-target', targetId);
        
        // Show modal
        this.show();
    }

    /**
     * Deletes a dependency
     */
    deleteDependency(sourceId, targetId) {
        // Find systems for notification
        const sourceSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Delete dependency via DataManager
        const success = this.dependencies.dataManager.deleteDependency({
            source: sourceId,
            target: targetId
        });
        
        if (success) {
            showNotification(
                `Connection from "${sourceSystem.name}" to "${targetSystem.name}" has been deleted`,
                'success'
            );
        } else {
            showNotification('Error deleting connection', 'danger');
        }
    }

    onShow() {
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
    }
}