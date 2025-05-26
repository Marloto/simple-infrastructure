import { OverlayComponent } from '../base/overlay-component.js';
import { showNotification } from '../../utils/utilities.js';

const editSystemModalTemplate = () => `
    <div class="modal fade" id="system-modal" tabindex="-1" aria-labelledby="system-modal-label" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="system-modal-label">Add system</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="system-form">
                        <input type="hidden" id="system-id">
                        <div class="mb-3">
                            <label for="system-name" class="form-label">Name*</label>
                            <input type="text" class="form-control" id="system-name" required>
                        </div>
                        <div class="mb-3">
                            <label for="system-description" class="form-label">Description*</label>
                            <textarea class="form-control" id="system-description" rows="3" required></textarea>
                        </div>
                        <div class="mb-3">
                            <label for="system-category" class="form-label">Category*</label>
                            <select class="form-select" id="system-category" required>
                                <option value="core">Core</option>
                                <option value="legacy">Legacy</option>
                                <option value="data">Data</option>
                                <option value="service">Service</option>
                                <option value="external">External</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label for="system-groups-input" class="form-label">Groups</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="system-groups-input" list="group-list"
                                    placeholder="Add group...">
                                <button class="btn btn-outline-secondary" type="button" id="add-group-btn">
                                    <i class="bi bi-plus"></i>
                                </button>
                            </div>
                            <div class="form-text">Separate multiple groups with commas or add individually</div>

                            <div id="system-groups-container" class="mt-2 d-flex flex-wrap gap-2">
                                <!-- Selected groups will be shown as badges here -->
                            </div>

                            <input type="hidden" id="system-groups-value">

                            <datalist id="group-list">
                                <!-- Filled dynamically -->
                            </datalist>
                        </div>
                        <div class="mb-3">
                            <label for="system-status" class="form-label">Status*</label>
                            <select class="form-select" id="system-status" required>
                                <option value="active">Active</option>
                                <option value="planned">Planned</option>
                                <option value="deprecated">Deprecated</option>
                                <option value="retired">Retired</option>
                            </select>
                        </div>
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="system-known-usage" checked>
                            <label class="form-check-label" for="system-known-usage">Known usage</label>
                        </div>
                        <div class="mb-3">
                            <label for="system-tags" class="form-label">Tags (comma separated)</label>
                            <input type="text" class="form-control" id="system-tags">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="save-system">Save</button>
                </div>
            </div>
        </div>
    </div>
`;

export class EditSystemComponent extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
        this.modalElement = null;
        this.modal = null;
    }

    setupDOM() {
        this.modalElement = this.render(editSystemModalTemplate());
        this.element.appendChild(this.modalElement);
        this.modal = new bootstrap.Modal(this.modalElement);
    }

    bindEvents() {
        const groupInput = this.modalElement.querySelector('#system-groups-input');
        const addButton = this.modalElement.querySelector('#add-group-btn');

        // Event-Listener für das Hinzufügen von Gruppen mit dem Button
        addButton.addEventListener('click', () => {
            const value = groupInput.value.trim();
            if (value) {
                // Wenn Kommas enthalten sind, mehrere Gruppen gleichzeitig hinzufügen
                if (value.includes(',')) {
                    const groups = value.split(',').map(g => g.trim()).filter(g => g !== '');
                    groups.forEach(group => this.addGroupBadge(group));
                } else {
                    this.addGroupBadge(value);
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
                    this.addGroupBadge(newGroup);
                    groupInput.value = '';
                }
            }
        });

        this.dependencies.toolbar.button('bi-plus-lg', 'Add element', () => {
            this.showSystemModal()
        }, 'create');

        this.modalElement.querySelector('#save-system').addEventListener('click', () => this.saveSystem());
    }

    /**
     * Shows the system modal for adding or editing
     * @param {string} systemId - The ID of the system to edit (null for adding)
     */
    showSystemModal(systemId = null) {
        // Set modal title depending on action (add or edit)
        this.modalElement.querySelector('#system-modal-label').textContent = systemId ? 'Edit System' : 'Add System';

        const form = this.modalElement.querySelector('#system-form');

        // Reset form
        form.reset();

        // Clear groups container
        const groupsContainer = this.modalElement.querySelector('#system-groups-container');
        if (groupsContainer) {
            groupsContainer.innerHTML = '';
        }

        const groupsValueField = this.modalElement.querySelector('#system-groups-value');
        if (groupsValueField) {
            groupsValueField.value = '';
        }

        // If systemId exists, fill form data with system data
        if (systemId) {
            const system = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
            if (system) {
                this.currentEditingSystem = system;

                // Fill form with system data
                this.modalElement.querySelector('#system-id').value = system.id;
                this.modalElement.querySelector('#system-name').value = system.name;
                this.modalElement.querySelector('#system-description').value = system.description;
                this.modalElement.querySelector('#system-category').value = system.category;
                this.modalElement.querySelector('#system-status').value = system.status;
                this.modalElement.querySelector('#system-known-usage').checked = system.knownUsage;

                // Add groups as badges
                const groups = [];
                if (Array.isArray(system.groups)) {
                    system.groups.forEach(group => this.addGroupBadge(group));
                    groups.push(...system.groups);
                } else if (system.group && typeof system.group === 'string') {
                    this.addGroupBadge(system.group);
                    groups.push(system.group);
                }

                // Store groups in hidden field
                if (groupsValueField) {
                    groupsValueField.value = groups.join(',');
                }

                // Display tags as comma-separated list
                if (system.tags && Array.isArray(system.tags)) {
                    this.modalElement.querySelector('#system-tags').value = system.tags.join(', ');
                } else {
                    this.modalElement.querySelector('#system-tags').value = '';
                }
            }
        } else {
            // New system, clear ID field
            this.modalElement.querySelector('#system-id').value = '';
            this.currentEditingSystem = null;
        }

        // Fill group list (for datalist)
        const groupList = this.modalElement.querySelector('#group-list');
        if (groupList) {
            groupList.innerHTML = '';

            // Collect existing groups
            const groups = this.dependencies.dataManager.getAllGroups ?
                this.dependencies.dataManager.getAllGroups() : this.getExistingGroups();

            // Fill group list
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                groupList.appendChild(option);
            });
        }

        this.show();
    }

    onShow() {
        this.modal.show();
    }

    onHide() {
        this.modal.hide();
    }

    /**
     * Saves a new or edited system
     */
    saveSystem() {
        // Collect form data
        const systemId = this.modalElement.querySelector('#system-id').value;
        const name = this.modalElement.querySelector('#system-name').value;
        const description = this.modalElement.querySelector('#system-description').value;
        const category = this.modalElement.querySelector('#system-category').value;
        const status = this.modalElement.querySelector('#system-status').value;
        const knownUsage = this.modalElement.querySelector('#system-known-usage').checked;

        // Create groups array - support for old and new UI format
        let groups = [];

        // New UI (with system-groups-value as hidden field)
        const groupsValueField = this.modalElement.querySelector('#system-groups-value');
        if (groupsValueField) {
            groups = groupsValueField.value
                ? groupsValueField.value.split(',').map(g => g.trim()).filter(g => g !== '')
                : [];
        }
        // Old UI (with system-group as direct input)
        else {
            const groupField = this.modalElement.querySelector('#system-group');
            if (groupField && groupField.value.trim() !== '') {
                // Check for commas (for manual multi-group input)
                if (groupField.value.includes(',')) {
                    groups = groupField.value.split(',').map(g => g.trim()).filter(g => g !== '');
                } else {
                    groups = [groupField.value.trim()];
                }
            }
        }

        // Convert tags from comma-separated list to array
        const tagsString = this.modalElement.querySelector('#system-tags').value;
        const tags = tagsString
            ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
            : [];

        // Form validation
        if (!name || !description || !category || !status) {
            showNotification('Please fill in all required fields', 'warning');
            return;
        }

        // Create new system object
        const updatedSystem = {
            id: systemId || this.dependencies.dataManager.generateUniqueId(),
            name,
            description,
            category,
            status,
            knownUsage,
            tags,
            groups // New multi-group array
        };

        // For backward compatibility also set the single group field
        if (groups.length > 0) {
            updatedSystem.group = groups[0];
        }

        // Add or update the system
        if (!systemId) {
            // Add new system
            this.dependencies.dataManager.addSystem(updatedSystem);
            showNotification(`System "${name}" has been added`, 'success');
        } else {
            // Update existing system
            this.dependencies.dataManager.updateSystem(updatedSystem);
            showNotification(`System "${name}" has been updated`, 'success');
        }

        // Close modal
        this.hide();
    }

    /**
     * Adds a group as a badge to the container
     * @param {string} groupName - Name of the group
     */
    addGroupBadge(groupName) {
        if (!groupName || groupName.trim() === '') return;

        const container = this.modalElement.querySelector('#system-groups-container');
        const hiddenField = this.modalElement.querySelector('#system-groups-value');

        if (!container || !hiddenField) {
            console.warn('Group UI elements not found. Multi-group UI may not be initialized.');
            return;
        }

        // Check if the group has already been added
        const currentGroups = hiddenField.value ? hiddenField.value.split(',') : [];
        if (currentGroups.includes(groupName)) return;

        // Create badge
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary d-flex align-items-center';
        badge.innerHTML = `
            ${groupName}
            <button type="button" class="btn-close btn-close-white ms-2" 
                    aria-label="Remove" style="font-size: 0.5rem;"></button>
        `;

        // Delete button
        badge.querySelector('.btn-close').addEventListener('click', () => {
            container.removeChild(badge);

            // Remove value from hidden field
            const groups = hiddenField.value.split(',');
            const index = groups.indexOf(groupName);
            if (index !== -1) {
                groups.splice(index, 1);
                hiddenField.value = groups.join(',');
            }
        });

        // Add to container
        container.appendChild(badge);

        // Add to hidden field
        const newGroups = [...currentGroups, groupName];
        hiddenField.value = newGroups.join(',');
    }

    /**
     * Helper function to collect all existing groups
     * (Only needed if getAllGroups is not implemented in DataManager)
     * @returns {Array} Array of unique group names
     */
    getExistingGroups() {
        const groups = new Set();

        this.dependencies.dataManager.getData().systems.forEach(system => {
            if (Array.isArray(system.groups)) {
                system.groups.forEach(group => {
                    if (group && group.trim() !== '') {
                        groups.add(group);
                    }
                });
            } else if (system.group && typeof system.group === 'string') {
                groups.add(system.group);
            }
        });

        return Array.from(groups).sort();
    }
}