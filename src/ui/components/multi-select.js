import { UIComponent } from '../base/ui-component.js';
import { showNotification } from '../../utils/utilities.js';

export class MultiSelectComponent extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);

        this.initialized = false;
        this.isRectSelectModeActive = false;
        this.isDrawing = false;
        this.startPoint = null;
        this.selectionRect = null;
        
        // Selection rectangle properties
        this.rectSelectOptions = {
            minRectSize: 10, // Minimum size to register as selection
            enableOnEmptySpace: true, // Only start on empty space
            modifierKey: 'none' // 'ctrl', 'shift', 'alt', or 'none'
        };
    }

    bindEvents() {
        // Toolbar button for rectangle selection mode
        this.toggleRectSelectButton = this.dependencies.toolbar.button(
            'bi-bounding-box', 
            'Rectangle selection', 
            () => {
                this.toggleRectSelectMode();
            }, 
            'view', 
            ['toggle-rect-select']
        );

        // Listen to visualizer events
        this.dependencies.visualizer.on('selectionChanged', (data) => {
            this.updateSelectionInfo(data);
        });

        // Data changes might affect rectangle select mode
        this.dependencies.dataManager.on('dataChanged', () => {
            if (this.isRectSelectModeActive) {
                // Short delay to wait for UI update
                setTimeout(() => {
                    this.setupRectangleSelection();
                }, 100);
            }
        });
    }

    /**
     * Toggles the rectangle selection mode on/off
     */
    toggleRectSelectMode() {
        this.isRectSelectModeActive = !this.isRectSelectModeActive;
        const toggleButton = this.toggleRectSelectButton;

        if (this.isRectSelectModeActive) {
            document.body.classList.add('multi-select-mode');
            toggleButton.classList.add('active');
            toggleButton.title = 'Exit rectangle selection';
            toggleButton.querySelector('i').className = 'bi bi-bounding-box-circles';

            // Disable zoom/pan and node drag
            this.disableZoomAndDrag();
            this.setupRectangleSelection();

            showNotification('Rectangle selection enabled: Drag to select multiple systems', 'info');
        } else {
            document.body.classList.remove('multi-select-mode');
            toggleButton.classList.remove('active');
            toggleButton.title = 'Rectangle selection';
            toggleButton.querySelector('i').className = 'bi bi-bounding-box';

            // Re-enable zoom/pan and node drag
            this.removeRectangleSelection();
            this.enableZoomAndDrag();

            this.hideSelectionInfo();
        }
    }

    /**
     * Disables zoom/pan and node dragging
     */
    disableZoomAndDrag() {
        // Disable zoom/pan
        if (this.dependencies.visualizer.svg && this.dependencies.visualizer.zoom) {
            this.dependencies.visualizer.svg.on('.zoom', null);
        }
        
        // Disable node dragging
        this.dependencies.visualizer.disableDrag();
    }

    /**
     * Re-enables zoom/pan and node dragging
     */
    enableZoomAndDrag() {
        // Re-enable zoom/pan
        if (this.dependencies.visualizer.svg && this.dependencies.visualizer.zoom) {
            this.dependencies.visualizer.svg.call(this.dependencies.visualizer.zoom);
        }
        
        // Re-enable node dragging
        this.dependencies.visualizer.enableDrag();
    }

    /**
     * Sets up the rectangle selection mechanism
     */
    setupRectangleSelection() {
        if (!this.dependencies.visualizer.svg) return;

        // Remove existing rectangle selection if present
        this.removeRectangleSelection();

        // Now we can use D3's drag behavior safely since zoom is disabled
        const rectDrag = d3.drag()
            .on("start", (event) => this.handleRectDragStart(event))
            .on("drag", (event) => this.handleRectDragMove(event))
            .on("end", (event) => this.handleRectDragEnd(event))
            .filter((event) => this.shouldStartRectSelection(event));

        // Apply to the SVG element
        this.dependencies.visualizer.svg.call(rectDrag);
    }

    /**
     * Removes the rectangle selection mechanism
     */
    removeRectangleSelection() {
        if (!this.dependencies.visualizer.svg) return;

        // Remove rectangle selection drag
        this.dependencies.visualizer.svg.on('.drag', null);

        // Clean up any existing selection rectangle
        this.cleanupSelectionRect();
    }

    /**
     * Determines if rectangle selection should start based on the event
     */
    shouldStartRectSelection(event) {
        // Safely get the source event and target
        const sourceEvent = event.sourceEvent || event;
        const target = sourceEvent.target;
        
        if (!target) return false;

        // Check modifier key requirement
        if (this.rectSelectOptions.modifierKey !== 'none') {
            const hasRequiredModifier = 
                (this.rectSelectOptions.modifierKey === 'ctrl' && (sourceEvent.ctrlKey || sourceEvent.metaKey)) ||
                (this.rectSelectOptions.modifierKey === 'shift' && sourceEvent.shiftKey) ||
                (this.rectSelectOptions.modifierKey === 'alt' && sourceEvent.altKey);
            
            if (!hasRequiredModifier) return false;
        }

        // Only start on empty space (not on nodes or links)
        if (this.rectSelectOptions.enableOnEmptySpace) {
            // Check if clicked on a node, link, or other interactive element
            if (target.closest && target.closest('.node') || 
                target.closest && target.closest('.link') || 
                target.classList && target.classList.contains('link') ||
                target.tagName === 'circle' ||
                target.tagName === 'text' ||
                target.tagName === 'path') {
                return false;
            }
        }

        return true;
    }

    /**
     * Handles the start of rectangle selection
     */
    handleRectDragStart(event) {
        if (!this.isRectSelectModeActive) return;

        this.isDrawing = true;

        // Get coordinates relative to the SVG
        const svgElement = this.dependencies.visualizer.svg.node();
        const rect = svgElement.getBoundingClientRect();
        
        // Account for current zoom/pan transform
        const transform = d3.zoomTransform(svgElement);
        
        this.startPoint = {
            x: (event.sourceEvent.clientX - rect.left - transform.x) / transform.k,
            y: (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
        };

        // Create selection rectangle
        this.createSelectionRect();
    }

    /**
     * Handles rectangle selection dragging
     */
    handleRectDragMove(event) {
        if (!this.isRectSelectModeActive || !this.isDrawing || !this.selectionRect) return;

        // Get current coordinates
        const svgElement = this.dependencies.visualizer.svg.node();
        const rect = svgElement.getBoundingClientRect();
        const transform = d3.zoomTransform(svgElement);
        
        const currentPoint = {
            x: (event.sourceEvent.clientX - rect.left - transform.x) / transform.k,
            y: (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
        };

        // Update rectangle
        this.updateSelectionRect(currentPoint);

        // Highlight nodes within rectangle (preview)
        this.previewSelection(currentPoint);
    }

    /**
     * Handles the end of rectangle selection
     */
    handleRectDragEnd(event) {
        if (!this.isRectSelectModeActive || !this.isDrawing) return;

        this.isDrawing = false;

        // Get final coordinates
        const svgElement = this.dependencies.visualizer.svg.node();
        const rect = svgElement.getBoundingClientRect();
        const transform = d3.zoomTransform(svgElement);
        
        const endPoint = {
            x: (event.sourceEvent.clientX - rect.left - transform.x) / transform.k,
            y: (event.sourceEvent.clientY - rect.top - transform.y) / transform.k
        };

        // Perform final selection
        this.performRectSelection(endPoint, event.sourceEvent);

        // Cleanup
        this.cleanupSelectionRect();
    }

    /**
     * Creates the visual selection rectangle
     */
    createSelectionRect() {
        // Create rectangle in the main SVG group (so it scales with zoom)
        const svgGroup = this.dependencies.visualizer.svg.select('g');
        
        this.selectionRect = svgGroup.append('rect')
            .attr('class', 'selection-rect')
            .attr('x', this.startPoint.x)
            .attr('y', this.startPoint.y)
            .attr('width', 0)
            .attr('height', 0);
    }

    /**
     * Updates the selection rectangle as user drags
     */
    updateSelectionRect(currentPoint) {
        if (!this.selectionRect) return;

        const x = Math.min(this.startPoint.x, currentPoint.x);
        const y = Math.min(this.startPoint.y, currentPoint.y);
        const width = Math.abs(currentPoint.x - this.startPoint.x);
        const height = Math.abs(currentPoint.y - this.startPoint.y);

        this.selectionRect
            .attr('x', x)
            .attr('y', y)
            .attr('width', width)
            .attr('height', height);
    }

    /**
     * Provides visual preview of what will be selected
     */
    previewSelection(currentPoint) {
        // Optional: Add preview styling to nodes that would be selected
        // For now, we'll skip this to avoid performance issues during drag
    }

    /**
     * Performs the actual selection based on the rectangle
     */
    performRectSelection(endPoint, sourceEvent) {
        // Calculate rectangle bounds
        const minX = Math.min(this.startPoint.x, endPoint.x);
        const maxX = Math.max(this.startPoint.x, endPoint.x);
        const minY = Math.min(this.startPoint.y, endPoint.y);
        const maxY = Math.max(this.startPoint.y, endPoint.y);

        const rectWidth = maxX - minX;
        const rectHeight = maxY - minY;

        // Check if rectangle is large enough
        if (rectWidth < this.rectSelectOptions.minRectSize || 
            rectHeight < this.rectSelectOptions.minRectSize) {
            return;
        }

        // Find nodes within the rectangle
        const nodesInRect = [];
        
        if (this.dependencies.visualizer.simulationManager && 
            this.dependencies.visualizer.simulationManager.simulation) {
            
            const nodes = this.dependencies.visualizer.simulationManager.simulation.nodes();
            
            nodes.forEach(node => {
                if (node.x >= minX && node.x <= maxX && 
                    node.y >= minY && node.y <= maxY) {
                    nodesInRect.push(node.id);
                }
            });
        }

        if (nodesInRect.length === 0) return;

        // Determine selection behavior based on modifier keys
        const isShiftPressed = sourceEvent.shiftKey;
        const isCtrlPressed = sourceEvent.ctrlKey || sourceEvent.metaKey;

        if (isShiftPressed || isCtrlPressed) {
            // Add to existing selection
            nodesInRect.forEach(nodeId => {
                this.dependencies.visualizer.addToSelection(nodeId, false);
            });
        } else {
            // Replace selection
            this.dependencies.visualizer.clearSelection(false);
            nodesInRect.forEach(nodeId => {
                this.dependencies.visualizer.addToSelection(nodeId, false);
            });
        }

        // Emit selection change event
        this.dependencies.visualizer.emit('selectionChanged', {
            selected: Array.from(this.dependencies.visualizer.selectedNodes),
            added: nodesInRect,
            removed: []
        });

        // Emit multi-selection event if multiple nodes selected
        if (this.dependencies.visualizer.getSelectionCount() > 1) {
            this.dependencies.visualizer.emit('systemsSelected', {
                event: { sourceEvent },
                systems: this.dependencies.visualizer.getSelectedSystems(),
                primary: null // No primary system in rectangle selection
            });
        }
    }

    /**
     * Cleans up the selection rectangle
     */
    cleanupSelectionRect() {
        if (this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
        }
        this.startPoint = null;
    }

    /**
     * Updates or shows selection info
     */
    updateSelectionInfo(selectionData) {
        const count = selectionData.selected.length;
        
        // Update button badge
        if (count > 0) {
            this.toggleRectSelectButton.setAttribute('data-count', count);
            this.toggleRectSelectButton.style.position = 'relative';
        } else {
            this.toggleRectSelectButton.removeAttribute('data-count');
        }
        
        if (!this.isRectSelectModeActive) return;
        
        if (count > 0) {
            this.showSelectionInfo(count);
        } else {
            this.hideSelectionInfo();
        }
    }

    /**
     * Shows selection information overlay
     */
    showSelectionInfo(count) {
        let selectionInfo = document.querySelector('.selection-info');
        
        if (!selectionInfo) {
            selectionInfo = document.createElement('div');
            selectionInfo.className = 'selection-info';
            document.body.appendChild(selectionInfo);
        }
        
        selectionInfo.textContent = `${count} system${count !== 1 ? 's' : ''} selected`;
        selectionInfo.classList.add('visible');
    }

    /**
     * Hides selection information overlay
     */
    hideSelectionInfo() {
        const selectionInfo = document.querySelector('.selection-info');
        if (selectionInfo) {
            selectionInfo.classList.remove('visible');
        }
    }

    /**
     * Gets the current rectangle selection mode state
     */
    isRectSelectMode() {
        return this.isRectSelectModeActive;
    }

    /**
     * Sets rectangle selection options
     */
    setRectSelectOptions(options) {
        this.rectSelectOptions = { ...this.rectSelectOptions, ...options };
    }
}