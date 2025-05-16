import { showNotification } from './utilities.js';

/**
 * System Manager - Manages adding, editing, and deleting systems
 */
export class SystemManager {
    constructor() {
        this.initialized = false;
        this.currentEditingSystem = null;
    }

    /**
     * Initializes the SystemManager
     */
    initialize(dataManager) {
        this.dataManager = dataManager;

        if (this.initialized) return;

        // React to data changes
        this.dataManager.on('dataChanged', () => {
            // Optional: Update the UI on data changes
        });

        this.initialized = true;
        console.log('SystemManager has been initialized');
    }

    /**
     * Shows the system modal for adding or editing
     * @param {string} systemId - The ID of the system to edit (null for adding)
     */
    showSystemModal(systemId = null) {
        // Set modal title depending on action (add or edit)
        document.getElementById('system-modal-label').textContent =
            systemId ? 'Edit System' : 'Add System';

        const form = document.getElementById('system-form');

        // Reset form
        form.reset();

        // Clear groups container
        const groupsContainer = document.getElementById('system-groups-container');
        if (groupsContainer) {
            groupsContainer.innerHTML = '';
        }

        const groupsValueField = document.getElementById('system-groups-value');
        if (groupsValueField) {
            groupsValueField.value = '';
        }

        // If systemId exists, fill form data with system data
        if (systemId) {
            const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
            if (system) {
                this.currentEditingSystem = system;

                // Fill form with system data
                document.getElementById('system-id').value = system.id;
                document.getElementById('system-name').value = system.name;
                document.getElementById('system-description').value = system.description;
                document.getElementById('system-category').value = system.category;
                document.getElementById('system-status').value = system.status;
                document.getElementById('system-known-usage').checked = system.knownUsage;

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
                    document.getElementById('system-tags').value = system.tags.join(', ');
                } else {
                    document.getElementById('system-tags').value = '';
                }
            }
        } else {
            // New system, clear ID field
            document.getElementById('system-id').value = '';
            this.currentEditingSystem = null;
        }

        // Fill group list (for datalist)
        const groupList = document.getElementById('group-list');
        if (groupList) {
            groupList.innerHTML = '';

            // Collect existing groups
            const groups = this.dataManager.getAllGroups ?
                this.dataManager.getAllGroups() : this.getExistingGroups();

            // Fill group list
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                groupList.appendChild(option);
            });
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('system-modal'));
        modal.show();
    }

    /**
     * Saves a new or edited system
     */
    saveSystem() {
        // Collect form data
        const systemId = document.getElementById('system-id').value;
        const name = document.getElementById('system-name').value;
        const description = document.getElementById('system-description').value;
        const category = document.getElementById('system-category').value;
        const status = document.getElementById('system-status').value;
        const knownUsage = document.getElementById('system-known-usage').checked;

        // Create groups array - support for old and new UI format
        let groups = [];

        // New UI (with system-groups-value as hidden field)
        const groupsValueField = document.getElementById('system-groups-value');
        if (groupsValueField) {
            groups = groupsValueField.value
                ? groupsValueField.value.split(',').map(g => g.trim()).filter(g => g !== '')
                : [];
        }
        // Old UI (with system-group as direct input)
        else {
            const groupField = document.getElementById('system-group');
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
        const tagsString = document.getElementById('system-tags').value;
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
            id: systemId || this.dataManager.generateUniqueId(),
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
            this.dataManager.addSystem(updatedSystem);
            showNotification(`System "${name}" has been added`, 'success');
        } else {
            // Update existing system
            this.dataManager.updateSystem(updatedSystem);
            showNotification(`System "${name}" has been updated`, 'success');
        }

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('system-modal')).hide();
    }

    /**
     * Adds a group as a badge to the container
     * @param {string} groupName - Name of the group
     */
    addGroupBadge(groupName) {
        if (!groupName || groupName.trim() === '') return;

        const container = document.getElementById('system-groups-container');
        const hiddenField = document.getElementById('system-groups-value');

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

        this.dataManager.getData().systems.forEach(system => {
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

    /**
     * Shows the delete confirmation for a system
     * @param {string} systemId - The ID of the system to delete
     */
    showDeleteConfirmation(systemId) {
        const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        // Check if the system is used in dependencies
        const data = this.dataManager.getData();
        const incomingDeps = data.dependencies.filter(dep => dep.target === systemId);
        const outgoingDeps = data.dependencies.filter(dep => dep.source === systemId);

        let message = `Do you really want to delete the system "${system.name}"?`;

        if (incomingDeps.length > 0 || outgoingDeps.length > 0) {
            message += `<br><br><div class="alert alert-warning">
                <strong>Warning:</strong> This system has ${incomingDeps.length + outgoingDeps.length} 
                dependencies that will also be deleted.
            </div>`;
        }

        document.getElementById('confirm-message').innerHTML = message;
        document.getElementById('confirm-action').setAttribute('data-action', 'delete-system');
        document.getElementById('confirm-action').setAttribute('data-id', systemId);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('confirm-modal'));
        modal.show();
    }

    /**
     * Deletes a system and its dependencies
     * @param {string} systemId - The ID of the system to delete
     */
    deleteSystem(systemId) {
        // Find system and store name for notification
        const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        const systemName = system.name;

        // Delete system via DataManager
        this.dataManager.deleteSystem(systemId);

        showNotification(`System "${systemName}" and related dependencies have been deleted`, 'success');

        // Close details panel
        document.getElementById('details-panel').classList.remove('active');
    }
}