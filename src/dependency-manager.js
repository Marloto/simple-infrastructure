/**
 * DependencyManager - Verwaltet das Hinzufügen und Löschen von Abhängigkeiten
 */
export class DependencyManager {
    constructor() {
        this.initialized = false;
        this.isConnectionModeActive = false;
        this.sourceSystem = null;
        this.tempLink = null;
        this.mousePosition = { x: 0, y: 0 };
        
        // Standardwerte für neue Verbindungen
        this.defaultConnectionType = "data";
        this.defaultConnectionProtocol = "API";
    }

    /**
     * Initialisiert den DependencyManager
     */
    initialize(dataManager, visualizer) {
        if (this.initialized) return;
        
        this.dataManager = dataManager;
        this.visualizer = visualizer;
        
        // Event-Listener für Verbindungsmodus-Toggle
        document.getElementById('toggle-connection-mode').addEventListener('click', () => {
            this.toggleConnectionMode();
        });
        
        // Event-Listener für Datenänderungen, um den Verbindungsmodus beizubehalten
        this.dataManager.addEventListener('dataChanged', () => {
            if (this.isConnectionModeActive) {
                // Kurze Verzögerung, um die UI-Aktualisierung abzuwarten
                setTimeout(() => {
                    this.setupConnectionDrag();
                }, 100);
            }
        });
        
        this.initialized = true;
        console.log('DependencyManager wurde initialisiert');
    }

    /**
     * Schaltet den Verbindungsmodus ein/aus
     */
    toggleConnectionMode() {
        this.isConnectionModeActive = !this.isConnectionModeActive;
        const toggleButton = document.getElementById('toggle-connection-mode');
        
        if (this.isConnectionModeActive) {
            document.body.classList.add('connection-mode');
            toggleButton.classList.add('active');
            toggleButton.title = 'Verbindungsmodus verlassen';
            toggleButton.querySelector('i').className = 'bi bi-link-45deg';
            
            // Standarddrag deaktivieren und stattdessen Verbindungsdrag aktivieren
            this.visualizer.disableDrag(); // Flag setzen
            this.setupConnectionDrag();
            
            showNotification('Verbindungsmodus aktiviert: Ziehen Sie von einem System zum anderen', 'info');
        } else {
            document.body.classList.remove('connection-mode');
            toggleButton.classList.remove('active');
            toggleButton.title = 'Verbindungsmodus';
            toggleButton.querySelector('i').className = 'bi bi-link';
            
            // Verbindungsdrag entfernen und Standarddrag wiederherstellen
            this.removeConnectionDrag();
            this.visualizer.enableDrag(); // Flag zurücksetzen
            
            // Aufräumen
            this.resetConnectionState();
            
            showNotification('Verbindungsmodus deaktiviert', 'info');
        }
    }

    /**
     * Richtet den Drag-Mechanismus für Verbindungen ein
     */
    setupConnectionDrag() {
        if (!this.visualizer.nodeElements) return;
        
        // Verbindungs-Drag entfernen (falls vorhanden)
        this.removeConnectionDrag();
        
        // Drag-Funktion für Verbindungen definieren
        const connectionDrag = d3.drag()
            .on("start", (event, d) => this.handleDragStart(event, d))
            .on("drag", (event, d) => this.handleDragMove(event, d))
            .on("end", (event, d) => this.handleDragEnd(event, d));
        
        // Auf Knoten anwenden
        this.visualizer.nodeElements.call(connectionDrag);
    }
    
    /**
     * Entfernt den Verbindungs-Drag-Mechanismus
     */
    removeConnectionDrag() {
        if (!this.visualizer.nodeElements) return;
        
        // Verbindungs-Drag entfernen
        this.visualizer.nodeElements.on('.drag', null);
    }

    /**
     * Behandelt den Start eines Verbindungsdrags
     */
    handleDragStart(event, d) {
        if (!this.isConnectionModeActive) return;
        
        // Quellsystem festlegen
        this.sourceSystem = d;
        
        // Visuell markieren
        d3.select(event.sourceEvent.target.closest('.node')).classed('connection-source', true);
        
        // Temporäre Verbindungslinie erstellen
        this.createTempLink(d);
    }

    /**
     * Behandelt die Bewegung während eines Verbindungsdrags
     */
    handleDragMove(event, d) {
        if (!this.isConnectionModeActive || !this.tempLink) return;
        
        // Temporäre Linie aktualisieren
        this.tempLink.attr('d', `M${this.sourceSystem.x},${this.sourceSystem.y} L${event.x},${event.y}`);
    }

    /**
     * Behandelt das Ende eines Verbindungsdrags
     */
    handleDragEnd(event, d) {
        if (!this.isConnectionModeActive || !this.sourceSystem) return;
        
        // Prüfen, ob über einem anderen Knoten losgelassen wurde
        const targetElement = document.elementFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY);
        const targetNode = targetElement ? targetElement.closest('.node') : null;
        
        if (targetNode) {
            const targetSystemId = targetNode.getAttribute('data-system-id');
            const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetSystemId);
            
            if (targetSystem && targetSystem.id !== this.sourceSystem.id) {
                // Verbindung erstellen mit Standardwerten
                this.createConnection(this.sourceSystem, targetSystem);
            } else if (targetSystem && targetSystem.id === this.sourceSystem.id) {
                // Gleicher Knoten wurde als Ziel verwendet
                showNotification('Quell- und Zielsystem können nicht identisch sein.', 'warning');
            }
        }
        
        // Aufräumen
        this.resetConnectionState();
    }

    /**
     * Erstellt eine temporäre Verbindungslinie vom Quellsystem
     */
    createTempLink(sourceSystem) {
        // Temporäre Linie erstellen
        this.tempLink = this.visualizer.svg.select('g').append('path')
            .attr('class', 'temp-link')
            .attr('d', `M${sourceSystem.x},${sourceSystem.y} L${sourceSystem.x},${sourceSystem.y}`);
    }

    /**
     * Erstellt eine neue Verbindung mit Standardwerten
     */
    createConnection(sourceSystem, targetSystem) {
        // Neue Abhängigkeit mit Standardwerten erstellen
        const newDependency = {
            source: sourceSystem.id,
            target: targetSystem.id,
            type: this.defaultConnectionType,
            description: `Verbindung von ${sourceSystem.name} zu ${targetSystem.name}`,
            protocol: this.defaultConnectionProtocol
        };
        
        // Abhängigkeit über den DataManager hinzufügen
        const success = this.dataManager.addDependency(newDependency);
        
        if (success) {
            // Erfolgsmeldung
            showNotification(
                `Verbindung von "${sourceSystem.name}" zu "${targetSystem.name}" wurde erstellt`,
                'success'
            );
        } else {
            showNotification('Fehler beim Erstellen der Verbindung', 'danger');
        }
    }

    /**
     * Setzt den Verbindungsstatus zurück
     */
    resetConnectionState() {
        // Quellsystem zurücksetzen
        if (this.sourceSystem) {
            d3.selectAll('.node').classed('connection-source', false);
            this.sourceSystem = null;
        }
        
        // Temporäre Linie entfernen
        if (this.tempLink) {
            this.tempLink.remove();
            this.tempLink = null;
        }
    }

    /**
     * Zeigt die Lösch-Kontrolle für eine Verbindung an
     */
    showLinkControls(event, linkData) {
        // Im Verbindungsmodus keine Controls anzeigen
        if (this.isConnectionModeActive) return;
        
        // Bestehende Controls entfernen
        this.hideLinkControls();
        
        // Neue Controls erstellen
        const controls = document.createElement('div');
        controls.className = 'link-controls';
        controls.innerHTML = `
            <button class="link-delete-btn" title="Verbindung löschen">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Position setzen
        controls.style.left = `${event.pageX}px`;
        controls.style.top = `${event.pageY}px`;
        
        // Zum DOM hinzufügen
        document.body.appendChild(controls);
        
        // Link-Daten in ein Attribut speichern
        controls.setAttribute('data-source', linkData.source.id || linkData.source);
        controls.setAttribute('data-target', linkData.target.id || linkData.target);
        
        // Event-Listener für Löschen-Button
        controls.querySelector('.link-delete-btn').addEventListener('click', () => {
            this.showDeleteDependencyConfirmation(linkData);
            this.hideLinkControls();
        });
        
        // Controls anzeigen
        controls.style.display = 'block';
        
        // Außerhalb klicken, um zu schließen
        document.addEventListener('click', (e) => {
            if (!controls.contains(e.target) && e.target !== event.target) {
                this.hideLinkControls();
            }
        }, { once: true });
    }

    /**
     * Blendet die Link-Controls aus
     */
    hideLinkControls() {
        const existingControls = document.querySelector('.link-controls');
        if (existingControls) {
            existingControls.remove();
        }
    }

    /**
     * Zeigt eine Bestätigungsaufforderung zum Löschen einer Abhängigkeit an
     */
    showDeleteDependencyConfirmation(linkData) {
        const sourceId = linkData.source.id || linkData.source;
        const targetId = linkData.target.id || linkData.target;
        
        const sourceSystem = this.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Bestätigungsnachricht
        const message = `Möchten Sie die Verbindung von "${sourceSystem.name}" zu "${targetSystem.name}" wirklich löschen?`;
        
        document.getElementById('confirm-message').innerHTML = message;
        document.getElementById('confirm-action').setAttribute('data-action', 'delete-dependency');
        document.getElementById('confirm-action').setAttribute('data-source', sourceId);
        document.getElementById('confirm-action').setAttribute('data-target', targetId);
        
        // Modal anzeigen
        const modal = new bootstrap.Modal(document.getElementById('confirm-modal'));
        modal.show();
    }

    /**
     * Löscht eine Abhängigkeit
     */
    deleteDependency(sourceId, targetId) {
        // Systeme finden für die Benachrichtigung
        const sourceSystem = this.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Abhängigkeit über den DataManager löschen
        const success = this.dataManager.deleteDependency({
            source: sourceId,
            target: targetId
        });
        
        if (success) {
            showNotification(
                `Verbindung von "${sourceSystem.name}" zu "${targetSystem.name}" wurde gelöscht`,
                'success'
            );
        } else {
            showNotification('Fehler beim Löschen der Verbindung', 'danger');
        }
    }
}