/**
 * System Manager - Verwaltet das Hinzufügen, Bearbeiten und Löschen von Systemen
 */

export class SystemManager {
    constructor() {
        this.initialized = false;
        this.currentEditingSystem = null;
    }

    /**
     * Initialisiert den SystemManager
     */
    initialize(dataManager) {
        this.dataManager = dataManager;

        if (this.initialized) return;

        // Auf Datenänderungen reagieren
        this.dataManager.addEventListener('dataChanged', () => {
            // Optional: Aktualisierung der UI bei Datenänderungen
        });

        this.initialized = true;
        console.log('SystemManager wurde initialisiert');
    }

    /**
     * Zeigt das System-Modal für Hinzufügen oder Bearbeiten an
     * @param {string} systemId - Die ID des zu bearbeitenden Systems (null für Hinzufügen)
     */
    showSystemModal(systemId = null) {
        // Modal-Titel je nach Aktion (Hinzufügen oder Bearbeiten) setzen
        document.getElementById('system-modal-label').textContent =
            systemId ? 'System bearbeiten' : 'System hinzufügen';

        const form = document.getElementById('system-form');

        // Formular zurücksetzen
        form.reset();

        // Gruppen-Container leeren
        const groupsContainer = document.getElementById('system-groups-container');
        if (groupsContainer) {
            groupsContainer.innerHTML = '';
        }

        const groupsValueField = document.getElementById('system-groups-value');
        if (groupsValueField) {
            groupsValueField.value = '';
        }

        // Wenn systemId vorhanden, Formulardaten mit Systemdaten füllen
        if (systemId) {
            const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
            if (system) {
                this.currentEditingSystem = system;

                // Formular mit Systemdaten füllen
                document.getElementById('system-id').value = system.id;
                document.getElementById('system-name').value = system.name;
                document.getElementById('system-description').value = system.description;
                document.getElementById('system-category').value = system.category;
                document.getElementById('system-status').value = system.status;
                document.getElementById('system-known-usage').checked = system.knownUsage;

                // Gruppen als Badges hinzufügen
                const groups = [];
                if (Array.isArray(system.groups)) {
                    system.groups.forEach(group => this.addGroupBadge(group));
                    groups.push(...system.groups);
                } else if (system.group && typeof system.group === 'string') {
                    this.addGroupBadge(system.group);
                    groups.push(system.group);
                }

                // Gruppen in Hidden-Feld speichern
                if (groupsValueField) {
                    groupsValueField.value = groups.join(',');
                }

                // Tags als kommaseparierte Liste darstellen
                if (system.tags && Array.isArray(system.tags)) {
                    document.getElementById('system-tags').value = system.tags.join(', ');
                } else {
                    document.getElementById('system-tags').value = '';
                }
            }
        } else {
            // Neues System, ID-Feld leeren
            document.getElementById('system-id').value = '';
            this.currentEditingSystem = null;
        }

        // Gruppenliste füllen (für Datalist)
        const groupList = document.getElementById('group-list');
        if (groupList) {
            groupList.innerHTML = '';

            // Bestehende Gruppen sammeln
            const groups = this.dataManager.getAllGroups ?
                this.dataManager.getAllGroups() : this.getExistingGroups();

            // Gruppenliste befüllen
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                groupList.appendChild(option);
            });
        }

        // Modal anzeigen
        const modal = new bootstrap.Modal(document.getElementById('system-modal'));
        modal.show();
    }

    /**
     * Speichert ein neues oder bearbeitetes System
     */
    saveSystem() {
        // Formulardaten sammeln
        const systemId = document.getElementById('system-id').value;
        const name = document.getElementById('system-name').value;
        const description = document.getElementById('system-description').value;
        const category = document.getElementById('system-category').value;
        const status = document.getElementById('system-status').value;
        const knownUsage = document.getElementById('system-known-usage').checked;

        // Gruppen-Array erstellen - Unterstützung für altes und neues UI-Format
        let groups = [];

        // Neue UI (mit system-groups-value als Hidden-Field)
        const groupsValueField = document.getElementById('system-groups-value');
        if (groupsValueField) {
            groups = groupsValueField.value
                ? groupsValueField.value.split(',').map(g => g.trim()).filter(g => g !== '')
                : [];
        }
        // Alte UI (mit system-group als direktem Input)
        else {
            const groupField = document.getElementById('system-group');
            if (groupField && groupField.value.trim() !== '') {
                // Prüfen, ob Kommas enthalten sind (für manuelle Mehrfachgruppeneingabe)
                if (groupField.value.includes(',')) {
                    groups = groupField.value.split(',').map(g => g.trim()).filter(g => g !== '');
                } else {
                    groups = [groupField.value.trim()];
                }
            }
        }

        // Tags aus kommaseparierter Liste in Array umwandeln
        const tagsString = document.getElementById('system-tags').value;
        const tags = tagsString
            ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
            : [];

        // Formularvalidierung
        if (!name || !description || !category || !status) {
            showNotification('Bitte füllen Sie alle Pflichtfelder aus', 'warning');
            return;
        }

        // Neues System-Objekt erstellen
        const updatedSystem = {
            id: systemId || this.dataManager.generateUniqueId(),
            name,
            description,
            category,
            status,
            knownUsage,
            tags,
            groups // Neue Multi-Gruppen-Array
        };

        // Für Abwärtskompatibilität auch das einzelne group-Feld setzen
        if (groups.length > 0) {
            updatedSystem.group = groups[0];
        }

        // Hinzufügen oder Aktualisieren des Systems
        if (!systemId) {
            // Neues System hinzufügen
            this.dataManager.addSystem(updatedSystem);
            showNotification(`System "${name}" wurde hinzugefügt`, 'success');
        } else {
            // Bestehendes System aktualisieren
            this.dataManager.updateSystem(updatedSystem);
            showNotification(`System "${name}" wurde aktualisiert`, 'success');
        }

        // Modal schließen
        bootstrap.Modal.getInstance(document.getElementById('system-modal')).hide();
    }

    /**
     * Fügt eine Gruppe als Badge zum Container hinzu
     * @param {string} groupName - Name der Gruppe
     */
    addGroupBadge(groupName) {
        if (!groupName || groupName.trim() === '') return;

        const container = document.getElementById('system-groups-container');
        const hiddenField = document.getElementById('system-groups-value');

        if (!container || !hiddenField) {
            console.warn('Gruppen-UI-Elemente nicht gefunden. Multi-Gruppen-UI möglicherweise nicht initialisiert.');
            return;
        }

        // Prüfen, ob die Gruppe bereits hinzugefügt wurde
        const currentGroups = hiddenField.value ? hiddenField.value.split(',') : [];
        if (currentGroups.includes(groupName)) return;

        // Badge erstellen
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary d-flex align-items-center';
        badge.innerHTML = `
        ${groupName}
        <button type="button" class="btn-close btn-close-white ms-2" 
                aria-label="Entfernen" style="font-size: 0.5rem;"></button>
    `;

        // Löschen-Button
        badge.querySelector('.btn-close').addEventListener('click', () => {
            container.removeChild(badge);

            // Wert aus dem Hidden-Field entfernen
            const groups = hiddenField.value.split(',');
            const index = groups.indexOf(groupName);
            if (index !== -1) {
                groups.splice(index, 1);
                hiddenField.value = groups.join(',');
            }
        });

        // Zum Container hinzufügen
        container.appendChild(badge);

        // Zum Hidden-Field hinzufügen
        const newGroups = [...currentGroups, groupName];
        hiddenField.value = newGroups.join(',');
    }

    /**
     * Hilfsfunktion zum Sammeln aller existierenden Gruppen
     * (Wird nur benötigt, falls getAllGroups nicht im DataManager implementiert ist)
     * @returns {Array} Array mit einzigartigen Gruppennamen
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
     * Zeigt die Löschbestätigung für ein System an
     * @param {string} systemId - Die ID des zu löschenden Systems
     */
    showDeleteConfirmation(systemId) {
        const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        // Prüfen, ob das System in Abhängigkeiten verwendet wird
        const data = this.dataManager.getData();
        const incomingDeps = data.dependencies.filter(dep => dep.target === systemId);
        const outgoingDeps = data.dependencies.filter(dep => dep.source === systemId);

        let message = `Möchten Sie das System "${system.name}" wirklich löschen?`;

        if (incomingDeps.length > 0 || outgoingDeps.length > 0) {
            message += `<br><br><div class="alert alert-warning">
                <strong>Achtung:</strong> Dieses System hat ${incomingDeps.length + outgoingDeps.length} 
                Abhängigkeiten, die ebenfalls gelöscht werden.
            </div>`;
        }

        document.getElementById('confirm-message').innerHTML = message;
        document.getElementById('confirm-action').setAttribute('data-action', 'delete-system');
        document.getElementById('confirm-action').setAttribute('data-id', systemId);

        // Modal anzeigen
        const modal = new bootstrap.Modal(document.getElementById('confirm-modal'));
        modal.show();
    }

    /**
     * Löscht ein System und seine Abhängigkeiten
     * @param {string} systemId - Die ID des zu löschenden Systems
     */
    deleteSystem(systemId) {
        // System finden und Namen für die Benachrichtigung speichern
        const system = this.dataManager.getData().systems.find(sys => sys.id === systemId);
        if (!system) return;

        const systemName = system.name;

        // System über den DataManager löschen
        this.dataManager.deleteSystem(systemId);

        showNotification(`System "${systemName}" und zugehörige Abhängigkeiten wurden gelöscht`, 'success');

        // Details-Panel schließen
        document.getElementById('details-panel').classList.remove('active');
    }
}