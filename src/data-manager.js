/**
 * Lädt die Systemdaten aus der YAML-Datei
 * @returns {Promise<Object>} Das geparste Datenobjekt
 */
function loadSystemData() {
    try {
        // YAML-Datei laden
        const yamlText = localStorage.getItem('systems_yaml');
        if (!yamlText) {
            throw new Error('Konnte Systemdaten nicht aus dem lokalen Speicher laden');
        }

        // YAML zu JavaScript-Objekt parsen
        const parsedData = jsyaml.load(yamlText);

        return parsedData;
    } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
        showNotification('Fehler beim Laden der Daten', 'danger');
        return {
            systems: [],
            dependencies: []
        };
    }
}

/**
 * Speichert die Systemdaten als YAML im lokalen Speicher
 * @param {Object} data - Die zu speichernden Systemdaten
 */
function saveSystemData(data) {
    try {
        const yamlText = jsyaml.dump(data);
        localStorage.setItem('systems_yaml', yamlText);
        showNotification('Daten erfolgreich gespeichert', 'success');
    } catch (error) {
        console.error('Fehler beim Speichern der Daten:', error);
        showNotification('Fehler beim Speichern der Daten', 'danger');
    }
}


/**
 * DataManager - Zentrale Klasse zur Verwaltung der Systemdaten
 * Dient als Single Source of Truth für alle anderen Komponenten
 */
export class DataManager {
    constructor() {
        this.data = loadSystemData();
        this.eventListeners = {
            'dataChanged': []
        };

        let saveTimeout = null;
        this.addEventListener('dataChanged', () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveSystemData(this.data);
                saveTimeout = null;
            }, 500);
        });
    }

    /**
     * Initialisiert den DataManager mit Daten
     * @param {Object} data - Die initialien Systemdaten
     */
    initialize(data) {
        if (data && data.systems && data.dependencies) {
            this.data = data;
        }
        this.notifyListeners('dataChanged');
    }

    /**
     * Gibt die aktuellen Systemdaten zurück
     * @returns {Object} Die Systemdaten
     */
    getData() {
        return this.data;
    }

    /**
     * Aktualisiert die Systemdaten vollständig
     * @param {Object} newData - Die neuen Systemdaten
     */
    setData(newData, notify = true) {
        if (newData && newData.systems && newData.dependencies) {
            this.data = newData;
            notify && this.notifyListeners('dataChanged');
        }
    }

    /**
     * Gibt alle einzigartigen Gruppen zurück, die in den Systemdaten vorhanden sind
     * @returns {Array} Array mit einzigartigen Gruppennamen
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
     * Hilfsfunktion zur Sicherstellung, dass jedes System ein 'groups'-Array hat
     * Konvertiert einzelne 'group'-Strings in Arrays falls notwendig (Abwärtskompatibilität)
     * @param {Object} system - Das zu überprüfende System
     */
    ensureGroupsArray(system) {
        // Fall 1: system hat bereits ein groups-Array -> nichts tun
        if (Array.isArray(system.groups)) {
            // Entferne leere Werte und doppelte Einträge
            system.groups = system.groups
                .filter(group => group && group.trim() !== '')
                .filter((group, index, self) => self.indexOf(group) === index);

            // Legacy group-Feld entfernen, wenn vorhanden
            delete system.group;
            return;
        }

        // Fall 2: system hat ein group-Feld -> konvertieren zu groups-Array
        if (typeof system.group === 'string' && system.group.trim() !== '') {
            // Wenn group ein Komma-separierter String ist, teilen
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

        // Fall 3: system hat weder group noch groups
        if (!system.groups) {
            system.groups = [];
            delete system.group; // Sicherstellen, dass kein leeres group-Feld existiert
        }
    }

    /**
     * Fügt ein neues System hinzu
     * @param {Object} system - Das neue System
     * @returns {string} Die ID des hinzugefügten Systems
     */
    addSystem(system, notify = true) {
        if (!system.id) {
            system.id = this.generateUniqueId();
        }

        // Kompatibilitätshandling für die Konvertierung von 'group' zu 'groups'
        this.ensureGroupsArray(system);

        this.data.systems.push(system);
        notify && this.notifyListeners('dataChanged');
        return system.id;
    }

    /**
     * Aktualisiert ein bestehendes System
     * @param {Object} updatedSystem - Das aktualisierte System
     * @returns {boolean} True, wenn das System gefunden und aktualisiert wurde
     */
    updateSystem(updatedSystem, notify = true) {
        const index = this.data.systems.findIndex(sys => sys.id === updatedSystem.id);
        if (index !== -1) {
            // Kompatibilitätshandling für die Konvertierung von 'group' zu 'groups'
            this.ensureGroupsArray(updatedSystem);

            this.data.systems[index] = updatedSystem;
            notify && this.notifyListeners('dataChanged');
            return true;
        }
        return false;
    }

    /**
     * Löscht ein System und zugehörige Abhängigkeiten
     * @param {string} systemId - Die ID des zu löschenden Systems
     * @returns {boolean} True, wenn das System gefunden und gelöscht wurde
     */
    deleteSystem(systemId, notify = true) {
        const systemIndex = this.data.systems.findIndex(sys => sys.id === systemId);
        if (systemIndex === -1) return false;

        // System löschen
        this.data.systems.splice(systemIndex, 1);

        // Zugehörige Abhängigkeiten löschen
        this.data.dependencies = this.data.dependencies.filter(
            dep => dep.source !== systemId && dep.target !== systemId
        );

        notify && this.notifyListeners('dataChanged');
        return true;
    }

    /**
     * Fügt eine neue Abhängigkeit hinzu
     * @param {Object} dependency - Die neue Abhängigkeit
     * @returns {boolean} True bei Erfolg
     */
    addDependency(dependency, notify = true) {
        // Prüfen, ob Quell- und Zielsystem existieren
        const sourceExists = this.data.systems.some(sys => sys.id === dependency.source);
        const targetExists = this.data.systems.some(sys => sys.id === dependency.target);

        if (!sourceExists || !targetExists) return false;

        this.data.dependencies.push(dependency);
        notify && this.notifyListeners('dataChanged');
        return true;
    }

    /**
     * Löscht eine Abhängigkeit
     * @param {Object} dependency - Die zu löschende Abhängigkeit (muss source und target enthalten)
     * @returns {boolean} True, wenn die Abhängigkeit gefunden und gelöscht wurde
     */
    deleteDependency(dependency, notify = true) {
        const index = this.data.dependencies.findIndex(
            dep => dep.source === dependency.source && dep.target === dependency.target
        );

        if (index !== -1) {
            this.data.dependencies.splice(index, 1);
            notify && this.notifyListeners('dataChanged');
            return true;
        }
        return false;
    }

    /**
     * Wendet einen Batch von Änderungen auf einmal an und löst nur ein einziges Update-Event aus
     * @param {Object} differences - Objekt mit added, modified und removed Arrays für systems und dependencies
     * @returns {boolean} True bei Erfolg
     */
    applyBatch(differences) {
        if (!differences) return false;

        try {
            // Systeme entfernen
            if (differences.removed && differences.removed.systems) {
                differences.removed.systems.forEach(system => {
                    this.deleteSystem(system.id, false);
                });
            }

            // Systeme aktualisieren
            if (differences.modified && differences.modified.systems) {
                differences.modified.systems.forEach(modifiedSystem => {
                    this.updateSystem(modifiedSystem, false);
                });
            }

            // Neue Systeme hinzufügen
            if (differences.added && differences.added.systems) {
                differences.added.systems.forEach(newSystem => {
                    this.addSystem(newSystem, false);
                });
            }

            // Abhängigkeiten entfernen
            if (differences.removed && differences.removed.dependencies) {
                differences.removed.dependencies.forEach(dependency => {
                    this.deleteDependency(dependency, false);
                });
            }

            // Abhängigkeiten aktualisieren
            if (differences.modified && differences.modified.dependencies) {
                differences.modified.dependencies.forEach(modifiedDep => {
                    // Löschen und neu hinzufügen, da updateDependency nicht existiert
                    this.deleteDependency(modifiedDep, false);
                    this.addDependency(modifiedDep, false);
                });
            }

            // Neue Abhängigkeiten hinzufügen
            if (differences.added && differences.added.dependencies) {
                differences.added.dependencies.forEach(newDep => {
                    this.addDependency(newDep, false);
                });
            }

            // Nur einmal alle Listener benachrichtigen
            this.notifyListeners('dataChanged');

            return true;
        } catch (error) {
            console.error("Fehler beim Anwenden der Batch-Änderungen:", error);
            return false;
        }
    }

    /**
     * Generiert eine eindeutige ID
     * @returns {string} Eine eindeutige ID
     */
    generateUniqueId() {
        const timestamp = new Date().getTime();
        const randomPart = Math.floor(Math.random() * 10000);
        return `sys_${timestamp}_${randomPart}`;
    }

    /**
     * Fügt einen Event-Listener hinzu
     * @param {string} event - Der Event-Name (z.B. 'dataChanged')
     * @param {Function} callback - Die Callback-Funktion
     */
    addEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    /**
     * Benachrichtigt alle Listener über ein Event
     * @param {string} event - Der Event-Name
     */
    notifyListeners(event) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => callback(this.data));
        }
    }
}