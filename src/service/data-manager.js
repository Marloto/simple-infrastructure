import { EventEmitter  } from "../utils/event-emitter.js";
import { showNotification } from '../utils/utilities.js';

/**
 * Loads the system data from the YAML file
 * @returns {Promise<Object>} The parsed data object
 */
function loadSystemData() {
    try {
        // Load YAML file
        const yamlText = localStorage.getItem('systems_yaml');
        if (!yamlText) {
            throw new Error('Could not load system data from local storage');
        }

        // Parse YAML to JavaScript object
        const parsedData = jsyaml.load(yamlText);

        return parsedData;
    } catch (error) {
        console.log('Could not load data, fallback to new data set', error);
        return {
            systems: [],
            dependencies: []
        };
    }
}

/**
 * Saves the system data as YAML in local storage
 * @param {Object} data - The system data to save
 */
function saveSystemData(data) {
    try {
        const yamlText = jsyaml.dump(data);
        localStorage.setItem('systems_yaml', yamlText);
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
        showNotification('Error saving data', 'danger');
    }
}


/**
 * DataManager - Central class for managing system data
 * Serves as the single source of truth for all other components
 */
export class DataManager extends EventEmitter {
    constructor() {
        super();
        this.data = loadSystemData();
        let saveTimeout = null;
        this.on('dataChanged', () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveSystemData(this.data);
                saveTimeout = null;
            }, 500);
        });
    }

    /**
     * Initializes the DataManager with data
     * @param {Object} data - The initial system data
     */
    initialize(data) {
        if (data && data.systems && data.dependencies) {
            this.data = data;
        }
        this.emit('dataChanged', this.data);
    }

    /**
     * Returns the current system data
     * @returns {Object} The system data
     */
    getData() {
        return this.data;
    }

    /**
     * Completely updates the system data
     * @param {Object} newData - The new system data
     */
    setData(newData, notify = true) {
        if (newData && newData.systems && newData.dependencies) {
            this.data = newData;
            notify && this.emit('dataChanged', this.data);
        }
    }

    /**
     * Completely removes the system data
     * @param {Object} newData - The new system data
     */
    clearData(notify = true) {
        this.setData({ systems: [], dependencies: [] }, notify);
    }

    /**
     * Returns all unique groups present in the system data
     * @returns {Array} Array of unique group names
     */
    getAllGroups() {
        const groups = new Set();

        this.data.systems.forEach(system => {
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
     * Helper function to ensure each system has a 'groups' array
     * Converts single 'group' strings to arrays if necessary (backward compatibility)
     * @param {Object} system - The system to check
     */
    ensureGroupsArray(system) {
        // Case 1: system already has a groups array -> do nothing
        if (Array.isArray(system.groups)) {
            // Remove empty values and duplicates
            system.groups = system.groups
                .filter(group => group && group.trim() !== '')
                .filter((group, index, self) => self.indexOf(group) === index);

            // Remove legacy group field if present
            delete system.group;
            return;
        }

        // Case 2: system has a group field -> convert to groups array
        if (typeof system.group === 'string' && system.group.trim() !== '') {
            // If group is a comma-separated string, split
            if (system.group.includes(',')) {
                system.groups = system.group.split(',')
                    .map(g => g.trim())
                    .filter(g => g !== '');
            } else {
                system.groups = [system.group];
            }
            delete system.group;
            return;
        }

        // Case 3: system has neither group nor groups
        if (!system.groups) {
            system.groups = [];
            delete system.group; // Ensure no empty group field exists
        }
    }

    /**
     * Adds a new system
     * @param {Object} system - The new system
     * @returns {string} The ID of the added system
     */
    addSystem(system, notify = true) {
        if (!system.id) {
            system.id = this.generateUniqueId();
        }

        // Compatibility handling for converting 'group' to 'groups'
        this.ensureGroupsArray(system);

        this.data.systems.push(system);
        notify && this.emit('dataChanged', this.data);
        return system.id;
    }

    /**
     * Updates an existing system
     * @param {Object} updatedSystem - The updated system
     * @returns {boolean} True if the system was found and updated
     */
    updateSystem(updatedSystem, notify = true) {
        const index = this.data.systems.findIndex(sys => sys.id === updatedSystem.id);
        if (index !== -1) {
            // Compatibility handling for converting 'group' to 'groups'
            this.ensureGroupsArray(updatedSystem);

            this.data.systems[index] = updatedSystem;
            notify && this.emit('dataChanged', this.data);
            return true;
        }
        return false;
    }

    /**
     * Deletes a system and associated dependencies
     * @param {string} systemId - The ID of the system to delete
     * @returns {boolean} True if the system was found and deleted
     */
    deleteSystem(systemId, notify = true) {
        const systemIndex = this.data.systems.findIndex(sys => sys.id === systemId);
        if (systemIndex === -1) return false;

        // Delete system
        this.data.systems.splice(systemIndex, 1);

        // Delete associated dependencies
        this.data.dependencies = this.data.dependencies.filter(
            dep => dep.source !== systemId && dep.target !== systemId
        );

        notify && this.emit('dataChanged', this.data);
        return true;
    }

    /**
     * Adds a new dependency
     * @param {Object} dependency - The new dependency
     * @returns {boolean} True on success
     */
    addDependency(dependency, notify = true) {
        // Check if source and target systems exist
        const sourceExists = this.data.systems.some(sys => sys.id === dependency.source);
        const targetExists = this.data.systems.some(sys => sys.id === dependency.target);

        if (!sourceExists || !targetExists) return false;

        this.data.dependencies.push(dependency);
        notify && this.emit('dataChanged', this.data);
        return true;
    }

    /**
     * Deletes a dependency
     * @param {Object} dependency - The dependency to delete (must contain source and target)
     * @returns {boolean} True if the dependency was found and deleted
     */
    deleteDependency(dependency, notify = true) {
        const index = this.data.dependencies.findIndex(
            dep => dep.source === dependency.source && dep.target === dependency.target
        );

        if (index !== -1) {
            this.data.dependencies.splice(index, 1);
            notify && this.emit('dataChanged', this.data);
            return true;
        }
        return false;
    }

    /**
     * Applies a batch of changes at once and triggers only a single update event
     * @param {Object} differences - Object with added, modified and removed arrays for systems and dependencies
     * @returns {boolean} True on success
     */
    applyBatch(differences) {
        if (!differences) return false;

        try {
            // Remove systems
            if (differences.removed && differences.removed.systems) {
                differences.removed.systems.forEach(system => {
                    this.deleteSystem(system.id, false);
                });
            }

            // Update systems
            if (differences.modified && differences.modified.systems) {
                differences.modified.systems.forEach(modifiedSystem => {
                    this.updateSystem(modifiedSystem, false);
                });
            }

            // Add new systems
            if (differences.added && differences.added.systems) {
                differences.added.systems.forEach(newSystem => {
                    this.addSystem(newSystem, false);
                });
            }

            // Remove dependencies
            if (differences.removed && differences.removed.dependencies) {
                differences.removed.dependencies.forEach(dependency => {
                    this.deleteDependency(dependency, false);
                });
            }

            // Update dependencies
            if (differences.modified && differences.modified.dependencies) {
                differences.modified.dependencies.forEach(modifiedDep => {
                    // Delete and re-add, since updateDependency does not exist
                    this.deleteDependency(modifiedDep, false);
                    this.addDependency(modifiedDep, false);
                });
            }

            // Add new dependencies
            if (differences.added && differences.added.dependencies) {
                differences.added.dependencies.forEach(newDep => {
                    this.addDependency(newDep, false);
                });
            }

            // Notify all listeners only once
            this.emit('dataChanged', this.data);

            return true;
        } catch (error) {
            console.error("Error applying batch changes:", error);
            return false;
        }
    }

    /**
     * Generates a unique ID
     * @returns {string} A unique ID
     */
    generateUniqueId() {
        const timestamp = new Date().getTime();
        const randomPart = Math.floor(Math.random() * 10000);
        return `sys_${timestamp}_${randomPart}`;
    }
}