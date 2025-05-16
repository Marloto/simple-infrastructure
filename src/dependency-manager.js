import { showNotification } from './utilities.js';

/**
 * DependencyManager - Manages adding and removing dependencies
 */
export class DependencyManager {
    constructor() {
        this.initialized = false;
        this.isConnectionModeActive = false;
        this.sourceSystem = null;
        this.tempLink = null;
        this.mousePosition = { x: 0, y: 0 };
        
        // Default values for new connections
        this.defaultConnectionType = "data";
        this.defaultConnectionProtocol = "API";
    }

    /**
     * Initializes the DependencyManager
     */
    initialize(dataManager, visualizer) {
        if (this.initialized) return;
        
        this.dataManager = dataManager;
        this.visualizer = visualizer;
        
        // Event listener for connection mode toggle
        document.getElementById('toggle-connection-mode').addEventListener('click', () => {
            this.toggleConnectionMode();
        });
        
        // Event listener for data changes to keep connection mode active
        this.dataManager.on('dataChanged', () => {
            if (this.isConnectionModeActive) {
                // Short delay to wait for UI update
                setTimeout(() => {
                    this.setupConnectionDrag();
                }, 100);
            }
        });
        
        this.initialized = true;
        console.log('DependencyManager has been initialized');
    }

    /**
     * Toggles the connection mode on/off
     */
    toggleConnectionMode() {
        this.isConnectionModeActive = !this.isConnectionModeActive;
        const toggleButton = document.getElementById('toggle-connection-mode');
        
        if (this.isConnectionModeActive) {
            document.body.classList.add('connection-mode');
            toggleButton.classList.add('active');
            toggleButton.title = 'Exit connection mode';
            toggleButton.querySelector('i').className = 'bi bi-link-45deg';
            
            // Disable default drag and enable connection drag instead
            this.visualizer.disableDrag(); // Set flag
            this.setupConnectionDrag();
            
            showNotification('Connection mode enabled: Drag from one system to another', 'info');
        } else {
            document.body.classList.remove('connection-mode');
            toggleButton.classList.remove('active');
            toggleButton.title = 'Connection mode';
            toggleButton.querySelector('i').className = 'bi bi-link';
            
            // Remove connection drag and restore default drag
            this.removeConnectionDrag();
            this.visualizer.enableDrag(); // Reset flag
            
            // Cleanup
            this.resetConnectionState();
            
            showNotification('Connection mode disabled', 'info');
        }
    }

    /**
     * Sets up the drag mechanism for connections
     */
    setupConnectionDrag() {
        if (!this.visualizer.nodeElements) return;
        
        // Remove connection drag if present
        this.removeConnectionDrag();
        
        // Define drag function for connections
        const connectionDrag = d3.drag()
            .on("start", (event, d) => this.handleDragStart(event, d))
            .on("drag", (event, d) => this.handleDragMove(event, d))
            .on("end", (event, d) => this.handleDragEnd(event, d));
        
        // Apply to nodes
        this.visualizer.nodeElements.call(connectionDrag);
    }
    
    /**
     * Removes the connection drag mechanism
     */
    removeConnectionDrag() {
        if (!this.visualizer.nodeElements) return;
        
        // Remove connection drag
        this.visualizer.nodeElements.on('.drag', null);
    }

    /**
     * Handles the start of a connection drag
     */
    handleDragStart(event, d) {
        if (!this.isConnectionModeActive) return;
        
        // Set source system
        this.sourceSystem = d;
        
        // Visually mark
        d3.select(event.sourceEvent.target.closest('.node')).classed('connection-source', true);
        
        // Create temporary connection line
        this.createTempLink(d);
    }

    /**
     * Handles movement during a connection drag
     */
    handleDragMove(event, d) {
        if (!this.isConnectionModeActive || !this.tempLink) return;
        
        // Update temporary line
        this.tempLink.attr('d', `M${this.sourceSystem.x},${this.sourceSystem.y} L${event.x},${event.y}`);
    }

    /**
     * Handles the end of a connection drag
     */
    handleDragEnd(event, d) {
        if (!this.isConnectionModeActive || !this.sourceSystem) return;
        
        // Check if released over another node
        const targetElement = document.elementFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY);
        const targetNode = targetElement ? targetElement.closest('.node') : null;
        
        if (targetNode) {
            const targetSystemId = targetNode.getAttribute('data-system-id');
            const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetSystemId);
            
            if (targetSystem && targetSystem.id !== this.sourceSystem.id) {
                // Create connection with default values
                this.createConnection(this.sourceSystem, targetSystem);
            } else if (targetSystem && targetSystem.id === this.sourceSystem.id) {
                // Same node used as target
                showNotification('Source and target system cannot be identical.', 'warning');
            }
        }
        
        // Cleanup
        this.resetConnectionState();
    }

    /**
     * Creates a temporary connection line from the source system
     */
    createTempLink(sourceSystem) {
        // Create temporary line
        this.tempLink = this.visualizer.svg.select('g').append('path')
            .attr('class', 'temp-link')
            .attr('d', `M${sourceSystem.x},${sourceSystem.y} L${sourceSystem.x},${sourceSystem.y}`);
    }

    /**
     * Creates a new connection with default values
     */
    createConnection(sourceSystem, targetSystem) {
        // Create new dependency with default values
        const newDependency = {
            source: sourceSystem.id,
            target: targetSystem.id,
            type: this.defaultConnectionType,
            description: `Connection from ${sourceSystem.name} to ${targetSystem.name}`,
            protocol: this.defaultConnectionProtocol
        };
        
        // Add dependency via DataManager
        const success = this.dataManager.addDependency(newDependency);
        
        if (success) {
            // Success message
            showNotification(
                `Connection from "${sourceSystem.name}" to "${targetSystem.name}" has been created`,
                'success'
            );
        } else {
            showNotification('Error creating connection', 'danger');
        }
    }

    /**
     * Resets the connection state
     */
    resetConnectionState() {
        // Reset source system
        if (this.sourceSystem) {
            d3.selectAll('.node').classed('connection-source', false);
            this.sourceSystem = null;
        }
        
        // Remove temporary line
        if (this.tempLink) {
            this.tempLink.remove();
            this.tempLink = null;
        }
    }

    /**
     * Shows the delete control for a connection
     */
    showLinkControls(event, linkData) {
        // Do not show controls in connection mode
        if (this.isConnectionModeActive) return;
        
        // Remove existing controls
        this.hideLinkControls();
        
        // Create new controls
        const controls = document.createElement('div');
        controls.className = 'link-controls';
        controls.innerHTML = `
            <button class="link-delete-btn" title="Delete connection">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Set position
        controls.style.left = `${event.pageX}px`;
        controls.style.top = `${event.pageY}px`;
        
        // Add to DOM
        document.body.appendChild(controls);
        
        // Store link data in attribute
        controls.setAttribute('data-source', linkData.source.id || linkData.source);
        controls.setAttribute('data-target', linkData.target.id || linkData.target);
        
        // Event listener for delete button
        controls.querySelector('.link-delete-btn').addEventListener('click', () => {
            this.showDeleteDependencyConfirmation(linkData);
            this.hideLinkControls();
        });
        
        // Show controls
        controls.style.display = 'block';
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!controls.contains(e.target) && e.target !== event.target) {
                this.hideLinkControls();
            }
        }, { once: true });
    }

    /**
     * Hides the link controls
     */
    hideLinkControls() {
        const existingControls = document.querySelector('.link-controls');
        if (existingControls) {
            existingControls.remove();
        }
    }

    /**
     * Shows a confirmation prompt to delete a dependency
     */
    showDeleteDependencyConfirmation(linkData) {
        const sourceId = linkData.source.id || linkData.source;
        const targetId = linkData.target.id || linkData.target;
        
        const sourceSystem = this.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Confirmation message
        const message = `Do you really want to delete the connection from "${sourceSystem.name}" to "${targetSystem.name}"?`;
        
        document.getElementById('confirm-message').innerHTML = message;
        document.getElementById('confirm-action').setAttribute('data-action', 'delete-dependency');
        document.getElementById('confirm-action').setAttribute('data-source', sourceId);
        document.getElementById('confirm-action').setAttribute('data-target', targetId);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('confirm-modal'));
        modal.show();
    }

    /**
     * Deletes a dependency
     */
    deleteDependency(sourceId, targetId) {
        // Find systems for notification
        const sourceSystem = this.dataManager.getData().systems.find(sys => sys.id === sourceId);
        const targetSystem = this.dataManager.getData().systems.find(sys => sys.id === targetId);
        
        if (!sourceSystem || !targetSystem) return;
        
        // Delete dependency via DataManager
        const success = this.dataManager.deleteDependency({
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
}