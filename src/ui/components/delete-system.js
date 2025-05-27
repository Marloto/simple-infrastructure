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
        this.isMultiDelete = false;
        this.systemsToDelete = [];
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
            if (this.isMultiDelete) {
                this.deleteMultipleSystems(this.systemsToDelete);
            } else {
                const confirmId = this.confirm.getAttribute('data-id');
                if (confirmId) {
                    this.deleteSystem(confirmId);
                }
            }
            this.hide();
        });

        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when visualization container is focused/active
            const visualizationContainer = document.getElementById('visualization-container');
            if (!visualizationContainer || !document.activeElement) return;

            // Check if we're in an input field or modal
            const activeTag = document.activeElement.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(activeTag)) return;

            // Check for Delete/Backspace keys
            if (event.key === 'Delete' || event.key === 'Backspace') {
                const selectedSystems = this.dependencies.visualizer.getSelectedSystems();
                if (selectedSystems.length > 0) {
                    event.preventDefault();
                    this.handleDeleteSelected(selectedSystems);
                }
            }
        });
    }

    /**
     * Shows the delete confirmation for a single system
     * @param {string} systemId - The ID of the system to delete
     */
    showDeleteConfirmation(systemId) {
        const system = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        this.isMultiDelete = false;
        this.systemsToDelete = [];

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
        this.confirm.textContent = 'Delete';

        // Show modal
        this.show();
    }

    /**
     * Handles deletion of selected nodes
     */
    handleDeleteSelected() {
        const selectedSystems = this.dependencies.visualizer.getSelectedSystems();
        if (selectedSystems.length === 0) return;
    }

    /**
     * Shows the delete confirmation for multiple systems
     * @param {Array} systems - Array of system objects to delete
     */
    showMultiDeleteConfirmation(systems) {
        if (!systems || systems.length === 0) return;

        if (systems.length === 1) {
            // Fall back to single system deletion
            this.showDeleteConfirmation(systems[0].id);
            return;
        }

        this.isMultiDelete = true;
        this.systemsToDelete = systems;

        // Calculate total dependencies that will be affected
        const data = this.dependencies.dataManager.getData();
        const systemIds = systems.map(s => s.id);
        
        const affectedDependencies = data.dependencies.filter(dep => 
            systemIds.includes(dep.source) || systemIds.includes(dep.target)
        );

        // Generate system list for display (limit to show first few)
        const displayLimit = 5;
        const systemList = systems.slice(0, displayLimit).map(s => s.name).join(', ');
        const hasMore = systems.length > displayLimit;
        const moreText = hasMore ? ` and ${systems.length - displayLimit} more` : '';

        let message = `Do you really want to delete <strong>${systems.length} systems</strong>?`;
        
        // Show system names (truncated if too many)
        message += `<br><br><div class="alert alert-info">
            <strong>Systems to delete:</strong><br>
            ${systemList}${moreText}
        </div>`;

        if (affectedDependencies.length > 0) {
            message += `<div class="alert alert-warning">
                <strong>Warning:</strong> This will also delete ${affectedDependencies.length} 
                dependencies between these systems and other systems.
            </div>`;
        }

        // Add detailed breakdown in collapsible section
        message += `
            <div class="accordion" id="deleteDetailsAccordion">
                <div class="accordion-item">
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                                data-bs-target="#deleteDetails" aria-expanded="false">
                            Show detailed breakdown
                        </button>
                    </h2>
                    <div id="deleteDetails" class="accordion-collapse collapse">
                        <div class="accordion-body">
                            ${this.generateDetailedBreakdown(systems, affectedDependencies)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.message.innerHTML = message;
        this.confirm.removeAttribute('data-id');
        this.confirm.textContent = `Delete ${systems.length} Systems`;

        // Show modal
        this.show();
    }

    /**
     * Generates detailed breakdown for multi-delete confirmation
     */
    generateDetailedBreakdown(systems, affectedDependencies) {
        let html = '<div class="row">';
        
        // Systems breakdown by category
        const categoryCount = {};
        systems.forEach(system => {
            categoryCount[system.category] = (categoryCount[system.category] || 0) + 1;
        });

        html += '<div class="col-md-6">';
        html += '<h6>Systems by Category:</h6>';
        html += '<ul class="list-unstyled">';
        Object.entries(categoryCount).forEach(([category, count]) => {
            html += `<li><span class="badge bg-secondary me-2">${category}</span>${count}</li>`;
        });
        html += '</ul></div>';

        // Dependencies breakdown
        html += '<div class="col-md-6">';
        html += '<h6>Dependencies Impact:</h6>';
        html += `<ul class="list-unstyled">
            <li><strong>Total affected:</strong> ${affectedDependencies.length}</li>
            <li><strong>Will be deleted:</strong> All connections to/from selected systems</li>
        </ul></div>`;

        html += '</div>';

        // List all systems (for detailed view)
        html += '<h6 class="mt-3">All Systems to Delete:</h6>';
        html += '<div style="max-height: 200px; overflow-y: auto;">';
        systems.forEach(system => {
            html += `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <div>
                        <strong>${system.name}</strong>
                        <small class="text-muted d-block">${system.description}</small>
                    </div>
                    <div>
                        <span class="badge bg-secondary me-1">${system.category}</span>
                        <span class="badge bg-info">${system.status}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        return html;
    }

    /**
     * Deletes a single system and its dependencies
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

    /**
     * Deletes multiple systems and their dependencies
     * @param {Array} systems - Array of system objects to delete
     */
    deleteMultipleSystems(systems) {
        if (!systems || systems.length === 0) return;

        const systemNames = systems.map(s => s.name);

        // Delete all systems (batch operation for better performance)
        systems.forEach(system => {
            this.dependencies.dataManager.deleteSystem(system.id, false); // Don't emit events for each
        });

        // Emit single data change event at the end
        this.dependencies.dataManager.emit('dataChanged', this.dependencies.dataManager.getData());

        // Clear selection since systems are deleted
        this.dependencies.visualizer.clearSelection();

        // Show success notification
        const message = systems.length <= 3 
            ? `Systems "${systemNames.join('", "')}" have been deleted`
            : `${systems.length} systems have been deleted`;
        
        showNotification(message, 'success');
    }

    onShow() {
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
        // Reset state
        this.isMultiDelete = false;
        this.systemsToDelete = [];
    }
}