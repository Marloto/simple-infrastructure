import { OverlayComponent } from '../base/overlay-component.js';
import { showNotification } from '../../utils/utilities.js';

const createDetailsOverlay = () => `
    <div class="details-overlay overlay">
        <div class="overlay-header">
            <h5 class="detail-title">System details</h5>
            <div class="btn-group me-2">
                <button class="btn btn-sm btn-outline-secondary edit-system-btn" title="Edit system">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary toggle-fix-btn" title="Lock system">
                    <i class="bi bi-lock"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-system-btn" title="Delete system">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <button class="btn-close close-overlay" data-close-target="details-panel"></button>
        </div>
        <div class="overlay-body" data-overscroll-behavior="contain" data-bs-smooth-scroll="true">
            <!-- System details will be inserted here -->
        </div>
    </div>
`;

export class DetailsOverlay extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.overlayElement = this.render(createDetailsOverlay());
        this.element.appendChild(this.overlayElement);
    }

    bindEvents() {
        const detailTitle = this.overlayElement.querySelector('.detail-title');

        // Close button
        this.overlayElement.querySelector('.close-overlay').addEventListener('click', () => {
            this.hide();
        });

        // Update the overlay when data is changed
        this.dependencies.dataManager.on('dataChanged', () => {
            if (this.overlayElement.classList.contains('active')) {
                const systemId = detailTitle.getAttribute('data-system-id');
                if (systemId) {
                    const updatedSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
                    if (updatedSystem) {
                        this.showSystemDetails(updatedSystem);
                    } else {
                        this.overlayElement.classList.remove('active');
                    }
                }
            }
        });

        // Open overlay if element is clicked
        this.dependencies.visualizer.on('systemClicked', (event) => {
            this.showSystemDetails(event.system);
        });

        // Switch toggle fix button
        this.dependencies.visualizer.on('toggleFixed', (data) => {
            const systemId = detailTitle.getAttribute('data-system-id');
            const { id, state } = data;

            if (id !== systemId) return;

            const toggleButton = this.overlayElement.querySelector('.toggle-fix-btn');
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

        this.dependencies.visualizer.on('systemsSelected', (event) => {
            this.showMultiSystemDetails(event.systems);
        });

        this.dependencies.visualizer.on('selectionChanged', (data) => {
            if (data.selected.length === 1) {
                // Single system selected - show single system details
                const system = this.dependencies.visualizer.getSelectedSystems()[0];
                if (system) {
                    this.showSystemDetails(system);
                }
            } else if (data.selected.length > 1) {
                // Multiple systems selected - show multi-system view
                const systems = this.dependencies.visualizer.getSelectedSystems();
                this.showMultiSystemDetails(systems);
            } else if (data.selected.length === 0) {
                // Nothing selected - hide overlay
                this.hide();
            }
        });

        // Event-Handler für Bearbeiten- und Löschen-Buttons in der Detailansicht
        this.overlayElement.querySelector('.edit-system-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                this.dependencies.editSystemComponent.showSystemModal(systemId);
            }
        });

        this.overlayElement.querySelector('.delete-system-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                // Single system deletion
                this.dependencies.deleteSystemComponent.showDeleteConfirmation(systemId);
            } else {
                // Multi-system deletion
                const selectedSystems = this.dependencies.visualizer.getSelectedSystems();
                if (selectedSystems.length > 0) {
                    this.dependencies.deleteSystemComponent.showMultiDeleteConfirmation(selectedSystems);
                }
            }
        });

        this.overlayElement.querySelector('.toggle-fix-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                // Single system toggle
                this.dependencies.visualizer.toggleNodeFixed(systemId);
            } else {
                // Multi-system toggle
                this.dependencies.visualizer.toggleSelectedNodesFixed();
            }
        });
    }

    /**
     * Displays details for multiple selected systems
     */
    showMultiSystemDetails(systems) {
        if (!systems || systems.length === 0) {
            this.hide();
            return;
        }

        if (systems.length === 1) {
            // Fall back to single system view
            this.showSystemDetails(systems[0]);
            return;
        }

        const detailsPanel = this.overlayElement;
        const detailsDiv = this.overlayElement.querySelector('.overlay-body');
        const detailTitle = this.overlayElement.querySelector('.detail-title');

        // Set title for multiple systems
        detailTitle.textContent = `Selected Systems (${systems.length})`;
        detailTitle.removeAttribute('data-system-id'); // Clear single system ID

        // Generate multi-system content
        const content = this.generateMultiSystemContent(systems);
        detailsDiv.innerHTML = content;

        // Update button states for multi-selection
        this.updateMultiSelectButtons(systems);

        // Show details panel
        detailsPanel.classList.add('active');
    }

    /**
     * Generates content for multiple system details
     */
    generateMultiSystemContent(systems) {
        const data = this.dependencies.dataManager.getData();

        // Get grouped properties for analysis
        const grouped = this.dependencies.visualizer.getSelectedNodesGroupedProperties();

        let html = `
            <div class="multi-system-summary">
                <div class="row mb-3">
                    <div class="col-6">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h5 class="card-title text-primary">${systems.length}</h5>
                                <p class="card-text small mb-0">Systems</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h5 class="card-title text-success">${grouped.knownUsage.true}</h5>
                                <p class="card-text small mb-0">Usages</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        // Categories breakdown
        const categoryEntries = Object.entries(grouped.categories);
        if (categoryEntries.length > 0) {
            html += `<h6 class="mt-3">Categories</h6>`;
            categoryEntries.forEach(([category, count]) => {
                const percentage = Math.round((count / systems.length) * 100);
                html += `
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="badge bg-${this.dependencies.visualizer.getCategoryClass(category)}">${category}</span>
                    <span class="text-muted">${count} (${percentage}%)</span>
                </div>
            `;
            });
        }

        // Status breakdown
        const statusEntries = Object.entries(grouped.statuses);
        if (statusEntries.length > 0) {
            html += `<h6 class="mt-3">Status</h6>`;
            statusEntries.forEach(([status, count]) => {
                const percentage = Math.round((count / systems.length) * 100);
                html += `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge bg-secondary">${status}</span>
                        <span class="text-muted">${count} (${percentage}%)</span>
                    </div>
                `;
            });
        }

        // Groups breakdown
        const groupEntries = Object.entries(grouped.groups);
        if (groupEntries.length > 0) {
            html += `<h6 class="mt-3">Groups</h6>`;
            groupEntries.forEach(([group, count]) => {
                const percentage = Math.round((count / systems.length) * 100);
                html += `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge bg-info">${group}</span>
                        <span class="text-muted">${count} (${percentage}%)</span>
                    </div>
                `;
            });
        }

        // Connections summary
        const totalIncoming = systems.reduce((sum, system) => {
            return sum + data.dependencies.filter(dep => dep.target === system.id).length;
        }, 0);

        const totalOutgoing = systems.reduce((sum, system) => {
            return sum + data.dependencies.filter(dep => dep.source === system.id).length;
        }, 0);

        if (totalIncoming > 0 || totalOutgoing > 0) {
            html += `
                <h6 class="mt-3">Connections Summary</h6>
                <div class="row">
                    <div class="col-6">
                        <div class="text-center">
                            <div class="text-success h5">${totalIncoming}</div>
                            <small class="text-muted">Incoming</small>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="text-center">
                            <div class="text-warning h5">${totalOutgoing}</div>
                            <small class="text-muted">Outgoing</small>
                        </div>
                    </div>
                </div>
            `;
        }

        // Systems list (collapsible)
        html += `
            <div class="accordion mt-3" id="systemsAccordion">
                <div class="accordion-item">
                    <h2 class="accordion-header" id="systemsHeading">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                                data-bs-target="#systemsList" aria-expanded="false" aria-controls="systemsList">
                            Individual Systems (${systems.length})
                        </button>
                    </h2>
                    <div id="systemsList" class="accordion-collapse collapse" aria-labelledby="systemsHeading">
                        <div class="accordion-body p-2">
        `;

        systems.forEach(system => {
            html += `
                <div class="card mb-2">
                    <div class="card-body p-2">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h6 class="card-title mb-1">${system.name}</h6>
                                <p class="card-text small text-muted mb-1">${system.description}</p>
                                <div>
                                    <span class="badge bg-${this.dependencies.visualizer.getCategoryClass(system.category)} me-1">${system.category}</span>
                                    <span class="badge bg-secondary">${system.status}</span>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-outline-primary" onclick="window.visualizer.clearSelection(); window.visualizer.addToSelection('${system.id}');">
                                <i class="bi bi-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        </div>
    `;

        return html;
    }

    toggle() {
        document.querySelectorAll('.overlay').forEach(overlay => {
            if (overlay !== this.overlayElement) overlay.classList.remove('active');
        });
        if (this.overlayElement.classList.contains('active')) {
            this.hide();
        } else {
            this.show();
        }
    }

    onShow() {
        this.overlayElement.classList.add('active');
    }

    onHide() {
        this.overlayElement.classList.remove('active');
    }

    /**
     * Resets buttons to single-system mode
     */
    resetButtonsToSingleMode() {
        const editButton = this.overlayElement.querySelector('.edit-system-btn');
        const deleteButton = this.overlayElement.querySelector('.delete-system-btn');
        const toggleButton = this.overlayElement.querySelector('.toggle-fix-btn');

        // Reset edit button
        if (editButton) {
            editButton.disabled = false;
            editButton.classList.remove('d-none'); // Hide for multi-selection
        }

        // Reset delete button
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.title = 'Delete system';
            deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
        }

        // Reset toggle button (will be updated by existing logic in showSystemDetails)
        if (toggleButton) {
            toggleButton.disabled = false;
            toggleButton.classList.remove('active');
            toggleButton.title = 'Lock system';
            toggleButton.innerHTML = '<i class="bi bi-lock"></i>';
        }
    }

    /**
     * Updates button states for multi-selection
     */
    updateMultiSelectButtons(systems) {
        const editButton = this.overlayElement.querySelector('.edit-system-btn');
        const deleteButton = this.overlayElement.querySelector('.delete-system-btn');
        const toggleButton = this.overlayElement.querySelector('.toggle-fix-btn');

        // Disable edit button for multi-selection (could be enabled later for bulk edit)
        if (editButton) {
            editButton.disabled = true;
            editButton.classList.add('d-none'); // Hide for multi-selection
        }

        // Update delete button for multi-selection
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.title = `Delete ${systems.length} systems`;
            deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
        }

        // Update toggle button for multi-selection
        if (toggleButton) {
            const selectedIds = systems.map(s => s.id);
            const hasUnfixedNodes = selectedIds.some(id => !this.dependencies.visualizer.isNodeFixed(id));

            toggleButton.disabled = false;
            if (hasUnfixedNodes) {
                toggleButton.classList.remove('active');
                toggleButton.title = `Fix ${systems.length} systems`;
                toggleButton.innerHTML = '<i class="bi bi-lock"></i>';
            } else {
                toggleButton.classList.add('active');
                toggleButton.title = `Release ${systems.length} systems`;
                toggleButton.innerHTML = '<i class="bi bi-unlock"></i>';
            }
        }
    }

    /**
     * Displays the system details in the overlay
     */
    showSystemDetails(system) {
        const detailsPanel = this.overlayElement;
        const detailsDiv = this.overlayElement.querySelector('.overlay-body');
        const detailTitle = this.overlayElement.querySelector('.detail-title');
        const data = this.dependencies.dataManager.getData();

        // Set title
        detailTitle.textContent = system.name;
        detailTitle.setAttribute('data-system-id', system.id);

        // Find incoming and outgoing dependencies
        const incomingDeps = data.dependencies.filter(dep => dep.target === system.id);
        const outgoingDeps = data.dependencies.filter(dep => dep.source === system.id);

        let html = `
        <div class="system-detail-card">
            <p class="mb-1">${system.description}</p>
            <div class="badge bg-${this.dependencies.visualizer.getCategoryClass(system.category)} mb-2">${system.category}</div>
            <p><strong>Status:</strong> ${system.status}</p>
            <p><strong>Known Usage:</strong> ${system.knownUsage ? 'Yes' : 'No'}</p>
        `;

        // Add group information - multi-group support
        const groups = [];
        if (Array.isArray(system.groups) && system.groups.length > 0) {
            groups.push(...system.groups);
        } else if (system.group && typeof system.group === 'string') {
            groups.push(system.group);
        }

        if (groups.length > 0) {
            html += `<p><strong>Groups:</strong> ${groups.map(group =>
                `<span class="badge bg-info">${group}</span>`).join(' ')}</p>`;
        }

        if (system.tags && system.tags.length > 0) {
            html += `<p><strong>Tags:</strong> ${system.tags.map(tag =>
                `<span class="badge bg-secondary">${tag}</span>`).join(' ')}</p>`;
        }

        if (incomingDeps.length > 0) {
            html += `<h6 class="mt-3">Incoming Connections</h6><ul class="list-group">`;
            incomingDeps.forEach(dep => {
                const source = data.systems.find(s => s.id === dep.source);
                html += `
                <li class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <strong>${source ? source.name : 'Unknown'}</strong>
                        <span class="badge bg-secondary">${dep.protocol || 'Unknown'}</span>
                    </div>
                    <small>${dep.description || 'No description'}</small>
                </li>`;
            });
            html += `</ul>`;
        }

        if (outgoingDeps.length > 0) {
            html += `<h6 class="mt-3">Outgoing Connections</h6><ul class="list-group">`;
            outgoingDeps.forEach(dep => {
                const target = data.systems.find(s => s.id === dep.target);
                html += `
                <li class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <strong>${target ? target.name : 'Unknown'}</strong>
                        <span class="badge bg-secondary">${dep.protocol || 'Unknown'}</span>
                    </div>
                    <small>${dep.description || 'No description'}</small>
                </li>`;
            });
            html += `</ul>`;
        }

        if (incomingDeps.length === 0 && outgoingDeps.length === 0) {
            html += `<div class="alert alert-warning mt-3">This system has no known connections.</div>`;
        }

        html += `</div>`;

        detailsDiv.innerHTML = html;

        // Show details panel
        detailsPanel.classList.add('active');

        this.resetButtonsToSingleMode();

        // Adjust button state
        const toggleFixButton = document.querySelector('.toggle-fix-btn');
        const isFixed = this.dependencies.visualizer.isNodeFixed(system.id);
        if (toggleFixButton) {
            if (isFixed) {
                toggleFixButton.classList.add('active');
                toggleFixButton.title = 'Release position';
            } else {
                toggleFixButton.classList.remove('active');
                toggleFixButton.title = 'Fix position';
            }
        }
    }
}