import { UIComponent } from '../base/ui-component.js';
import { SimulationManager } from '../utils/simulation.js';
import { NodeCache } from '../utils/node-cache.js';

/**
 * SystemVisualizer - Visualizes IT systems and their dependencies as an interactive graph
 */
export class SystemVisualizer extends UIComponent {
    constructor(containerId, dependencies = {}, options = {}) {
        super(containerId, dependencies, options);
        this.dataManager = this.dependencies.dataManager;

        // Getter for access to current data
        Object.defineProperty(this, 'data', {
            get: () => this.dataManager.getData()
        });

        // D3 visualization variables
        this.svg = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;

        // UI states
        this.searchResults = [];
        this.activeFilters = {
            categories: ["core", "legacy", "data", "service", "external"],
            knownUsage: ["known", "unknown"]
        };

        // Color scales
        this.colorScale = d3.scaleOrdinal()
            .domain(["core", "legacy", "data", "service", "external"])
            .range(["#0d6efd", "#6c757d", "#198754", "#ffc107", "#dc3545"]);
        this.groupColorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Create node cache
        this.nodeCache = new NodeCache({
            useLocalStorage: true,
            localStorageKey: 'system_visualizer_node_positions',
            debounceTime: 250
        });

        // SimulationManager (will be initialized later)
        this.simulationManager = null;

        // Visualization elements
        this.nodeElements = null;
        this.linkElements = null;
        this.groupHulls = null;
        this.groupLabels = null;

        // Multi-Selection state
        this.selectedNodes = new Set(); // IDs der ausgewählten Knoten
        this.isMultiSelectActive = false; // Ob Multi-Select Modus aktiv ist
        this.lastSelectedNode = null; // Für Shift-Selection ranges
    }

    /**
     * Returns the currently selected node IDs
     * @returns {Set<string>} Set of selected node IDs
     */
    getSelectedNodeIds() {
        return new Set(this.selectedNodes);
    }

    /**
     * Returns the currently selected system objects
     * @returns {Array<Object>} Array of selected system objects
     */
    getSelectedSystems() {
        return Array.from(this.selectedNodes)
            .map(id => this.data.systems.find(system => system.id === id))
            .filter(system => system !== undefined);
    }

    /**
     * Checks if a node is currently selected
     * @param {string} systemId - The ID of the system to check
     * @returns {boolean} True if the node is selected
     */
    isNodeSelected(systemId) {
        return this.selectedNodes.has(systemId);
    }

    /**
     * Returns the number of currently selected nodes
     * @returns {number} Number of selected nodes
     */
    getSelectionCount() {
        return this.selectedNodes.size;
    }

    /**
     * Initializes the visualization
     */
    initialize() {
        if (!this.data) {
            console.error("No data available for visualization");
            return;
        }

        this.createVisualization();
        this.setupZoom();

        // Setup keyboard shortcuts for multi-selection
        this.setupKeyboardShortcuts();

        // React to data changes
        this.dataManager.on('dataChanged', () => {    // Check if any selected nodes no longer exist
            const currentSystemIds = new Set(this.data.systems.map(sys => sys.id));
            const invalidSelectedNodes = Array.from(this.selectedNodes)
                .filter(nodeId => !currentSystemIds.has(nodeId));

            // Remove invalid selections
            if (invalidSelectedNodes.length > 0) {
                invalidSelectedNodes.forEach(nodeId => {
                    this.selectedNodes.delete(nodeId);
                });

                this.emit('selectionChanged', {
                    selected: Array.from(this.selectedNodes),
                    added: [],
                    removed: invalidSelectedNodes
                });
            }

            // Recreate visualization
            const container = this.element;
            if (container) {
                container.innerHTML = '';
                this.createVisualization();
                this.setupZoom();
                this.setupKeyboardShortcuts();
            }
        });

        // Event listener for window resize
        window.addEventListener('resize', this.handleResize.bind(this));

        // Update cache before leaving
        window.addEventListener('beforeunload', () => {
            if (this.simulationManager) {
                this.simulationManager.stop();
            }
        });
    }

    /**
     * Creates the D3.js visualization
     */
    createVisualization() {
        const container = this.element;

        // Size and margins (fullscreen)
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // Create SVG
        this.svg = d3.select(container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        // Group for zoom
        const g = this.svg.append("g");

        // Create tooltip
        // Find or create tooltip element (as D3 selection)
        let tooltip = d3.select("body").select(".tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);
        }

        // Prepare and filter graph data
        const nodes = this.getFilteredNodes();
        const links = this.getFilteredLinks(nodes);

        // Identify groupings
        const groups = this.identifyGroups(nodes);

        // Create SimulationManager
        this.simulationManager = new SimulationManager({
            width: this.width,
            height: this.height,
            nodeCache: this.nodeCache,
            linkDistance: 150,
            chargeStrength: -300,
            collisionRadius: 60,
            groupForceStrength: 0.5,
            onTick: () => this.onSimulationTick(),
            onToggleFixed: (id, state) => {
                this.emit('toggleFixed', { id, state });
            },
        });

        // Arrowheads for the links
        g.append("defs").selectAll("marker")
            .data(["data", "integration", "authentication", "monitoring"])
            .enter().append("marker")
            .attr("id", d => `arrowhead-${d}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)  // No offset - arrowhead starts at end of path
            .attr("refY", 0)  // No offset
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", d => {
                switch (d) {
                    case "data": return "#0d6efd";
                    case "integration": return "#198754";
                    case "authentication": return "#dc3545";
                    case "monitoring": return "#6c757d";
                    default: return "#999";
                }
            });

        // Draw group hulls (before nodes and links)
        this.groupHulls = g.append("g")
            .attr("class", "groups")
            .selectAll(".group-hull")
            .data(Object.entries(groups).filter(([name]) => name !== "ungrouped")) // filter out "undefined" group
            .enter().append("path")
            .attr("class", "group-hull")
            .attr("data-group", d => d[0])
            .style("fill", d => this.groupColorScale(d[0]))
            .style("stroke", d => d3.rgb(this.groupColorScale(d[0])).darker())
            .style("stroke-width", 1.5)
            .style("fill-opacity", 0.2)
            .style("stroke-opacity", 0.4);

        // Draw links
        const that = this;
        this.linkElements = g.append("g")
            .attr("class", "links")
            .selectAll("path")
            .data(links)
            .enter().append("path")
            .attr("class", "link")
            .attr("marker-end", d => `url(#arrowhead-${d.type})`)
            .attr("data-type", d => d.type)
            .attr("data-link-index", d => d.linkIndex)
            .attr("data-total-links", d => d.totalLinks)
            .on("mouseover", function (event, d) {
                if (that.dragDisabled) return;
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);

                const sourceSystem = nodes.find(n => n.id === d.source.id || n.id === d.source);
                const targetSystem = nodes.find(n => n.id === d.target.id || n.id === d.target);

                tooltip.html(`
                    <strong>${sourceSystem ? sourceSystem.name : 'Unknown'} → ${targetSystem ? targetSystem.name : 'Unknown'}</strong><br>
                    ${d.description || 'No description'}<br>
                    <em>Protocol: ${d.protocol || 'Not specified'}</em>
                `);

                // Position tooltip centered below the mouse pointer
                const tooltipNode = tooltip.node();
                // Temporarily make visible to measure width
                tooltip.style("opacity", 0).style("display", "block");
                const tooltipWidth = tooltipNode.offsetWidth;
                tooltip.style("display", null); // reset

                tooltip
                    .style("left", (event.pageX - tooltipWidth / 2) + "px")
                    .style("top", (event.pageY + 16) + "px")
                    .transition()
                    .duration(200)
                    .style("opacity", .9);
            })
            .on("mouseout", function () {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            })
            .on("click", (event, data) => {
                this.emit('dependencyClick', { event, data });
                event.stopPropagation();
            });

        // Create nodes
        const nodeGroup = g.append("g")
            .attr("class", "nodes");

        this.nodeElements = nodeGroup.selectAll(".node")
            .data(nodes)
            .enter().append("g")
            .attr("class", d => {
                const classes = ["node"];
                if (!d.knownUsage) classes.push("unknown-usage");

                // Add selection class if node is selected
                if (this.isNodeSelected(d.id)) classes.push("selected");

                // Add multiple group classes
                const nodeGroups = this.getNodeGroups(d);
                nodeGroups.forEach(group => {
                    classes.push(`group-${group}`);
                });

                return classes.join(" ");
            })
            .attr("data-system-id", d => d.id)
            .attr("data-groups", d => this.getNodeGroups(d).join(","));

        if (!this.dragDisabled) {
            this.nodeElements.call(this.simulationManager.createDragBehavior())
        }

        // Circles for the systems
        const radius = 30;
        this.nodeElements.append("circle")
            .attr("r", radius)
            .attr("fill", d => this.colorScale(d.category))
            .attr("stroke", d => {
                const nodeGroups = this.getNodeGroups(d);
                if (nodeGroups.length > 0) {
                    // For multiple groups, create a multi-color stroke (could be dashed)
                    return nodeGroups.length > 1 ?
                        "url(#multigroup-gradient-" + d.id + ")" : // ID for gradient
                        this.groupColorScale(nodeGroups[0]); // Single group
                }
                return "#fff"; // Default without group
            })
            .attr("stroke-width", d => this.getNodeGroups(d).length > 0 ? 3 : 2)
            .attr("stroke-dasharray", d => this.getNodeGroups(d).length > 1 ? "5,3" : null)
            .on("mouseover", function (event, d) {
                if (that.dragDisabled) return;
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`
                    <strong>${d.name}</strong><br>
                    ${d.description}<br>
                    ${d.group ? '<span class="badge bg-info">Group: ' + d.group + '</span>' : ''}
                `);

                // Temporarily make visible to measure width and height
                tooltip.style("opacity", 0).style("display", "block");
                const tooltipNode = tooltip.node();
                const tooltipWidth = tooltipNode.offsetWidth;
                tooltip.style("display", null); // reset

                // Determine height of the circle (SVG circle has r=30)
                const circleRadius = radius;
                // Optionally: If the circle radius is dynamic, you could get it like this:
                // const circleRadius = d3.select(this).attr("r");

                tooltip
                    .style("left", (event.pageX - tooltipWidth / 2) + "px")
                    .style("top", (event.pageY + Number(circleRadius) + 8) + "px") // 8px below the circle
                    .transition()
                    .duration(200)
                    .style("opacity", .9);
            })
            .on("mouseout", function () {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            })
            .on("click", (event, d) => {
                // Neue Multi-Select Logik
                this.handleNodeClick(event, d);
            });

        // Text labels
        this.nodeElements.append("text")
            .attr("dy", -40)
            .attr("text-anchor", "middle")
            .text(d => d.name)
            .attr("fill", "#333")
            .style("user-select", "none")
            .style("pointer-events", "none");

        // Add group labels
        this.groupLabels = g.append("g")
            .attr("class", "group-labels")
            .selectAll(".group-label")
            .data(Object.entries(groups).filter(([name]) => name !== "ungrouped"))
            .enter().append("text")
            .attr("class", "group-label")
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .style("fill", d => d3.rgb(this.groupColorScale(d[0])).darker(2))
            .style("user-select", "none")
            .style("pointer-events", "none")
            .text(d => {
                // Display for merged groups
                if (d[1].allGroups && d[1].allGroups.length > 1) {
                    return `${d[0]} (+${d[1].allGroups.length - 1})`;
                }
                return d[0];
            });
        this.groupLabels.append("title") // Tooltip for details
            .text(d => {
                if (d[1].allGroups && d[1].allGroups.length > 1) {
                    return `Merged groups:\n${d[1].allGroups.join('\n')}`;
                }
                return d[0];
            });

        const defs = g.select("defs");
        nodes.forEach(d => {
            const nodeGroups = this.getNodeGroups(d);
            if (nodeGroups.length > 1) {
                const gradient = defs.append("linearGradient")
                    .attr("id", "multigroup-gradient-" + d.id)
                    .attr("x1", "0%")
                    .attr("y1", "0%")
                    .attr("x2", "100%")
                    .attr("y2", "100%");

                // Add color stops for each group
                nodeGroups.forEach((group, i) => {
                    gradient.append("stop")
                        .attr("offset", (i / (nodeGroups.length - 1) * 100) + "%")
                        .attr("stop-color", this.groupColorScale(group));
                });
            }
        });

        // Start simulation
        this.simulationManager.initialize(nodes, links, groups);
    }

    /**
    * Returns filtered links based on the filtered nodes
    */
    getFilteredLinks(nodes) {
        const nodeIds = nodes.map(node => node.id);

        // Initialize link counters
        const linkCounts = {};

        // First filter the links
        const filteredLinks = this.data.dependencies.filter(dep => {
            return nodeIds.includes(dep.source) && nodeIds.includes(dep.target);
        });

        // Count and index links
        filteredLinks.forEach(dep => {
            const key = `${dep.source}-${dep.target}`;
            const reverseKey = `${dep.target}-${dep.source}`;

            // Initialize counter for this direction
            if (!linkCounts[key]) {
                linkCounts[key] = 0;
            }

            // Increment counter and assign to link
            linkCounts[key]++;
            dep.linkIndex = linkCounts[key] - 1; // 0-based index

            // Store total number of links in this direction
            dep.totalLinks = filteredLinks.filter(d =>
                (d.source === dep.source && d.target === dep.target)
            ).length;
        });

        // Return links with additional information
        return filteredLinks.map(dep => ({
            source: dep.source,
            target: dep.target,
            linkIndex: dep.linkIndex,
            totalLinks: dep.totalLinks,
            ...dep
        }));
    }

    /**
     * Called on every simulation tick
     */
    onSimulationTick() {
        if (!this.linkElements || !this.nodeElements || !this.groupHulls || !this.groupLabels) {
            return;
        }

        // Update links
        this.linkElements.attr("d", this.linkArc);

        // Update nodes
        this.nodeElements.attr("transform", d => `translate(${d.x},${d.y})`);

        // Update group hulls
        this.groupHulls.attr("d", d => {
            const groupName = d[0];
            const simulation = this.simulationManager.simulation;

            // Find all nodes that belong to this group
            // IMPORTANT DIFFERENCE: Now we check if a node belongs to ANY of the original groups
            const groupNodes = simulation.nodes().filter(n => {
                const nodeGroups = this.getNodeGroups(n);

                // Check if the node belongs to any of the original groups
                // that were mapped to this representative group
                if (d[1].allGroups) {
                    // For a merged group, check if the node belongs to any of the original groups
                    return nodeGroups.some(ng => d[1].allGroups.includes(ng));
                } else {
                    // For a single group, check normally
                    return nodeGroups.includes(groupName);
                }
            });

            // If no nodes or only one node, draw a small circle around it
            if (groupNodes.length === 0) {
                return ""; // No hull if no nodes
            }

            if (groupNodes.length === 1) {
                // For only one node: draw a circle around it
                const node = groupNodes[0];
                return `M${node.x + 60},${node.y} 
                    A60,60 0 1,1 ${node.x - 60},${node.y} 
                    A60,60 0 1,1 ${node.x + 60},${node.y}`;
            }

            // Calculate centroid of the group
            const points = groupNodes.map(n => [n.x, n.y]);
            const centroid = this.getCentroid(points);

            // Calculate radius (with extra padding)
            const maxDist = Math.max(40, this.getMaxDistanceFromCentroid(points, centroid) + 40);

            // Draw a circular hull around the group
            return this.createHullPath(centroid, maxDist, 24);
        });

        // Update group labels
        this.groupLabels.attr("transform", d => {
            const groupName = d[0];
            const simulation = this.simulationManager.simulation;

            // Use the same filter logic as for the hulls
            const groupNodes = simulation.nodes().filter(n => {
                const nodeGroups = this.getNodeGroups(n);

                if (d[1].allGroups) {
                    return nodeGroups.some(ng => d[1].allGroups.includes(ng));
                } else {
                    return nodeGroups.includes(groupName);
                }
            });

            if (groupNodes.length === 0) return "translate(0,0)";

            const points = groupNodes.map(n => [n.x, n.y]);
            const centroid = this.getCentroid(points);

            return `translate(${centroid[0]},${centroid[1] - 60})`;
        });

        this.updateAllNodeVisualSelections();
    }

    resetZoom() {
        this.svg.transition().duration(750).call(
            this.zoom.transform,
            d3.zoomIdentity
        );
    }

    /**
     * Sets up zoom functionality
     */
    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                this.svg.select("g").attr("transform", event.transform);
            });

        this.svg.call(this.zoom);

        // Save viewport state after zoom or pan
        this.zoom.on('end', () => {
            this.saveViewportState();
        });

        // Restore viewport state
        this.restoreViewportState();
    }

    /**
     * Optimized linkArc function with adjusted distribution for even number of links
     */
    linkArc(d) {
        // Node radius
        const nodeRadius = 32;

        // Extract source and target coordinates
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;

        // Calculate distance and base angle between nodes
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);

        // Determine angle offsets
        const totalLinks = d.totalLinks || 1;
        const linkIndex = d.linkIndex || 0;

        // Maximum angle offset in degrees (±15°), converted to radians
        const maxOffsetDegrees = 15;
        const maxOffset = (maxOffsetDegrees * Math.PI) / 180;

        // Calculate angle offset - with adjustment for even number of links
        let angleOffset = 0;

        if (totalLinks > 1) {
            if (totalLinks % 2 === 0) {
                // For even number: shift to avoid the center
                // e.g. for 4 links: -0.75, -0.25, +0.25, +0.75 instead of -1, -0.33, +0.33, +1
                const step = 1 / totalLinks;
                angleOffset = ((linkIndex / (totalLinks - 1)) * 2 - 1 + step) * maxOffset;
            } else {
                // For odd number: normal distribution
                angleOffset = ((linkIndex / (totalLinks - 1)) * 2 - 1) * maxOffset;
            }
        }

        // Start point on the source node
        const startAngle = baseAngle + angleOffset;
        const startX = sourceX + Math.cos(startAngle) * nodeRadius;
        const startY = sourceY + Math.sin(startAngle) * nodeRadius;

        // End point on the target node with mirrored angle offset
        const endAngle = baseAngle + Math.PI - angleOffset;
        const endX = targetX + Math.cos(endAngle) * nodeRadius;
        const endY = targetY + Math.sin(endAngle) * nodeRadius;

        // Minimal angle offset for curvature (even for single links)
        // Single links get a slight curve instead of a straight line
        const minCurvatureAngle = (3 * Math.PI) / 180;  // 3 degrees in radians

        // Effective angle offset for curvature calculation
        const effectiveAngleOffset = Math.max(Math.abs(angleOffset), minCurvatureAngle);

        // Arc direction based on the sign of the angle offset
        // For single links: default to clockwise
        const sweep = (totalLinks === 1 || angleOffset >= 0) ? 1 : 0;

        // Curvature factor based on angle offset and distance
        // Minimum 0.15 for slight curve, maximum 0.5 for strong curve
        let curvature = 0.15 + (effectiveAngleOffset / maxOffset) * 0.35;

        // Orthogonal direction vectors for the control point
        const tangentX = (endX - startX) / distance;
        const tangentY = (endY - startY) / distance;
        const perpX = -tangentY;
        const perpY = tangentX;

        // Calculate midpoint
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        // Control point with direction based on sweep
        const ctrlFactor = (sweep === 1 ? 1 : -1) * curvature * distance;
        const ctrlX = midX + perpX * ctrlFactor;
        const ctrlY = midY + perpY * ctrlFactor;

        // Quadratic Bézier curve
        return `M${startX},${startY}Q${ctrlX},${ctrlY} ${endX},${endY}`;
    }

    /**
     * Identifies all groups and prepares them for d3.js
     * Optimized to merge groups with identical nodes
     */
    identifyGroups(nodes) {
        // Step 1: Create initial grouping
        const initialGroupMap = {};
        const UNGROUPED_GROUP_NAME = "ungrouped";

        // Data structure: group -> associated nodes
        nodes.forEach(node => {
            const nodeGroups = this.getNodeGroups(node);

            if (nodeGroups.length > 0) {
                nodeGroups.forEach(groupName => {
                    if (!initialGroupMap[groupName]) {
                        initialGroupMap[groupName] = {
                            nodes: [],
                            nodeIds: new Set(),
                            x: 0,
                            y: 0
                        };
                    }
                    initialGroupMap[groupName].nodes.push(node);
                    initialGroupMap[groupName].nodeIds.add(node.id);
                });
            } else {
                if (!initialGroupMap[UNGROUPED_GROUP_NAME]) {
                    initialGroupMap[UNGROUPED_GROUP_NAME] = {
                        nodes: [],
                        nodeIds: new Set(),
                        x: 0,
                        y: 0
                    };
                }
                initialGroupMap[UNGROUPED_GROUP_NAME].nodes.push(node);
                initialGroupMap[UNGROUPED_GROUP_NAME].nodeIds.add(node.id);
            }
        });

        // Step 2: Identify groups with identical nodes
        const groupSignatures = {};  // Signature -> groups with this signature

        Object.entries(initialGroupMap).forEach(([groupName, groupData]) => {
            if (groupName === UNGROUPED_GROUP_NAME) return;

            // Create a unique signature based on node IDs
            const signature = Array.from(groupData.nodeIds).sort().join(',');

            if (!groupSignatures[signature]) {
                groupSignatures[signature] = [];
            }

            groupSignatures[signature].push(groupName);
        });

        // Step 3: Create final group map
        const finalGroupMap = {};

        // Mapping from original groups to representative groups
        // IMPORTANT: We store this as a global/class instance variable
        this.groupMap = {};

        // First add the ungrouped group if present
        if (initialGroupMap[UNGROUPED_GROUP_NAME]) {
            finalGroupMap[UNGROUPED_GROUP_NAME] = initialGroupMap[UNGROUPED_GROUP_NAME];
        }

        // Then the merged groups
        Object.entries(groupSignatures).forEach(([signature, groups]) => {
            // Use the first group as the representative group
            const primaryGroup = groups[0];

            // Add group to the final map
            finalGroupMap[primaryGroup] = initialGroupMap[primaryGroup];

            // Store all original groups as metadata
            if (groups.length > 1) {
                finalGroupMap[primaryGroup].allGroups = groups;
                console.log(`Merged identical groups: ${groups.join(', ')} -> ${primaryGroup}`);

                // Create bidirectional mapping
                groups.forEach(originalGroup => {
                    this.groupMap[originalGroup] = primaryGroup;
                });
            } else {
                // Also create mapping for single groups
                this.groupMap[primaryGroup] = primaryGroup;
            }
        });

        // Step 4: Calculate initial positions
        Object.entries(finalGroupMap).forEach(([groupName, group], index) => {
            // Distribute positions evenly around the center
            const angle = (index / Object.keys(finalGroupMap).length) * 2 * Math.PI;
            const radius = Math.min(this.width, this.height) * 0.4;

            group.x = this.width / 2 + radius * Math.cos(angle);
            group.y = this.height / 2 + radius * Math.sin(angle);
        });

        return finalGroupMap;
    }

    /**
     * Helper function to check if two arrays contain the same elements
     * (Order is ignored)
     */
    arraysHaveSameElements(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;

        const set1 = new Set(arr1);
        for (const item of arr2) {
            if (!set1.has(item)) return false;
        }

        return true;
    }

    /**
     * Helper function to extract all groups of a node
     * Supports new groups arrays and legacy group fields
     */
    getNodeGroups(node) {
        if (Array.isArray(node.groups) && node.groups.length > 0) {
            return node.groups;
        } else if (node.group && typeof node.group === 'string') {
            return [node.group];
        }
        return [];
    }

    /**
     * Calculates the centroid of a group of points
     */
    getCentroid(points) {
        const n = points.length;
        if (n === 0) return [0, 0];

        const sumX = points.reduce((sum, p) => sum + p[0], 0);
        const sumY = points.reduce((sum, p) => sum + p[1], 0);

        return [sumX / n, sumY / n];
    }

    /**
     * Calculates the maximum distance from the centroid to any point in the group
     */
    getMaxDistanceFromCentroid(points, centroid) {
        if (points.length === 0) return 0;

        return Math.max(...points.map(p =>
            Math.sqrt(Math.pow(p[0] - centroid[0], 2) + Math.pow(p[1] - centroid[1], 2))
        ));
    }

    /**
     * Creates a path for the group hull
     */
    createHullPath(center, radius, segments) {
        const angleStep = (2 * Math.PI) / segments;
        let path = `M${center[0] + radius},${center[1]}`;

        for (let i = 1; i <= segments; i++) {
            const angle = i * angleStep;
            const x = center[0] + radius * Math.cos(angle);
            const y = center[1] + radius * Math.sin(angle);
            path += ` L${x},${y}`;
        }

        return path + "Z";
    }

    /**
     * Returns the node with the given ID from the current simulation
     * @param {string} systemId - The ID of the system to find
     * @returns {Object|null} The node object or null if not found
     */
    getNodeById(systemId) {
        return this.simulationManager.getNodeById(systemId);
    }

    /**
     * Checks if a node is fixed
     * @param {string} systemId - The ID of the system to check
     * @returns {boolean} True if the node is fixed, false otherwise or if not found
     */
    isNodeFixed(systemId) {
        return this.simulationManager.isNodeFixed(systemId);
    }

    /**
     * Toggles the fixed state of a node
     * @param {string} systemId - The ID of the system to change
     * @returns {boolean} The new fixed state or null if the node was not found
     */
    toggleNodeFixed(systemId) {
        return this.simulationManager.toggleNodeFixed(systemId);
    }

    /**
     * Helper function to determine the Bootstrap color for categories
     */
    getCategoryClass(category) {
        switch (category) {
            case 'core': return 'primary';
            case 'legacy': return 'secondary';
            case 'data': return 'success';
            case 'service': return 'warning';
            case 'external': return 'danger';
            default: return 'info';
        }
    }

    /**
     * Handles window resize events
     */
    handleResize() {
        const container = this.element;
        if (container && this.svg) {
            // Get new size
            this.width = container.clientWidth;
            this.height = container.clientHeight;

            // Update SVG size
            this.svg
                .attr("width", this.width)
                .attr("height", this.height);

            // Inform simulation manager about new size
            if (this.simulationManager) {
                this.simulationManager.updateSize(this.width, this.height);
            }
        }
    }

    /**
     * Applies filters to the visualization
     */
    applyFilters() {
        // Clear selection for nodes that will be filtered out
        const filteredNodeIds = new Set(this.getFilteredNodes().map(node => node.id));
        const nodesToRemoveFromSelection = Array.from(this.selectedNodes)
            .filter(nodeId => !filteredNodeIds.has(nodeId));

        // Remove filtered nodes from selection
        nodesToRemoveFromSelection.forEach(nodeId => {
            this.removeFromSelection(nodeId, false);
        });

        // Emit selection change if nodes were removed
        if (nodesToRemoveFromSelection.length > 0) {
            this.emit('selectionChanged', {
                selected: Array.from(this.selectedNodes),
                added: [],
                removed: nodesToRemoveFromSelection
            });
        }

        if (this.svg) {
            this.svg.remove();
            this.createVisualization();
            this.setupZoom();
        }
    }

    /**
     * Sets up keyboard shortcuts for multi-selection
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when visualization container is focused/active
            const visualizationContainer = document.getElementById('visualization-container');
            if (!visualizationContainer || !document.activeElement) return;

            // Check if we're in an input field or modal
            const activeTag = document.activeElement.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(activeTag)) return;

            switch (event.key) {
                case 'Escape':
                    if (this.getSelectionCount() > 0) {
                        event.preventDefault();
                        this.clearSelection();
                    }
                    break;

                case 'a':
                case 'A':
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        this.selectAll();
                    }
                    break;
            }
        });

        // Handle clicks on empty space to clear selection
        if (this.svg) {
            this.svg.on('click', (event) => {
                // Only clear if clicked on SVG background, not on nodes/links
                if (event.target === event.currentTarget ||
                    event.target.tagName === 'svg') {
                    this.clearSelection();
                }
            });
        }
    }

    /**
     * Returns filtered nodes
     */
    getFilteredNodes() {
        return this.data.systems.filter(system => {
            // Category filter
            if (!this.activeFilters.categories.includes(system.category)) {
                return false;
            }

            // Status filter (known/unknown usage)
            const usageType = system.knownUsage ? 'known' : 'unknown';
            if (!this.activeFilters.knownUsage.includes(usageType)) {
                return false;
            }

            return true;
        }).map(system => ({ ...system }));
    }

    /**
     * Saves the current viewport's zoom and pan state to localStorage.
     * The state includes the x and y translation, as well as the zoom scale (k),
     * and is stored under the key 'system_visualizer_transform'.
     * Requires the presence of an SVG element and d3.zoomTransform.
     */
    saveViewportState() {
        if (this.svg) {
            const currentTransform = d3.zoomTransform(this.svg.node());
            localStorage.setItem('system_visualizer_transform', JSON.stringify({
                x: currentTransform.x,
                y: currentTransform.y,
                k: currentTransform.k
            }));
        }
    }


    /**
     * Restores the viewport state of the SVG element by retrieving the last saved
     * zoom and pan transform from localStorage and applying it using D3's zoom behavior.
     * If the stored transform is not available or an error occurs, a warning is logged.
     *
     * @returns {void}
     */
    restoreViewportState() {
        try {
            const storedTransform = localStorage.getItem('system_visualizer_transform');
            if (storedTransform && this.svg && this.zoom) {
                const t = JSON.parse(storedTransform);
                const transform = d3.zoomIdentity.translate(t.x, t.y).scale(t.k);
                this.svg.call(this.zoom.transform, transform);
            }
        } catch (e) {
            console.warn('Fehler beim Wiederherstellen des Viewports:', e);
        }
    }

    /**
     * Disables the drag functionality for nodes
     */
    disableDrag() {
        if (this.nodeElements) {
            this.nodeElements.on('.drag', null);
        }
        this.dragDisabled = true;
    }

    /**
     * Enables the drag functionality for nodes again
     */
    enableDrag() {
        if (this.nodeElements && this.simulationManager) {
            this.nodeElements.call(this.simulationManager.createDragBehavior());
        }
        this.dragDisabled = false;
    }

    /**
 * Adds a node to the selection
 * @param {string} systemId - The ID of the system to add
 * @param {boolean} emit - Whether to emit selection events
 */
    addToSelection(systemId, emit = true) {
        if (!systemId || this.selectedNodes.has(systemId)) return;

        this.selectedNodes.add(systemId);
        this.lastSelectedNode = systemId;
        this.updateNodeVisualSelection(systemId, true);

        if (emit) {
            this.emit('selectionChanged', {
                selected: Array.from(this.selectedNodes),
                added: [systemId],
                removed: []
            });
        }
    }

    /**
     * Removes a node from the selection
     * @param {string} systemId - The ID of the system to remove
     * @param {boolean} emit - Whether to emit selection events
     */
    removeFromSelection(systemId, emit = true) {
        if (!systemId || !this.selectedNodes.has(systemId)) return;

        this.selectedNodes.delete(systemId);
        if (this.lastSelectedNode === systemId) {
            this.lastSelectedNode = this.selectedNodes.size > 0 ?
                Array.from(this.selectedNodes)[this.selectedNodes.size - 1] : null;
        }
        this.updateNodeVisualSelection(systemId, false);

        if (emit) {
            this.emit('selectionChanged', {
                selected: Array.from(this.selectedNodes),
                added: [],
                removed: [systemId]
            });
        }
    }

    /**
     * Toggles selection of a node
     * @param {string} systemId - The ID of the system to toggle
     * @param {boolean} emit - Whether to emit selection events
     */
    toggleSelection(systemId, emit = true) {
        if (this.isNodeSelected(systemId)) {
            this.removeFromSelection(systemId, emit);
        } else {
            this.addToSelection(systemId, emit);
        }
    }

    /**
     * Clears all selections
     * @param {boolean} emit - Whether to emit selection events
     */
    clearSelection(emit = true) {
        if (this.selectedNodes.size === 0) return;

        const previousSelection = Array.from(this.selectedNodes);

        // Update visual state for all selected nodes
        this.selectedNodes.forEach(systemId => {
            this.updateNodeVisualSelection(systemId, false);
        });

        this.selectedNodes.clear();
        this.lastSelectedNode = null;

        if (emit) {
            this.emit('selectionChanged', {
                selected: [],
                added: [],
                removed: previousSelection
            });
        }
    }

    /**
     * Selects all visible nodes
     * @param {boolean} emit - Whether to emit selection events
     */
    selectAll(emit = true) {
        const allNodeIds = this.getFilteredNodes().map(node => node.id);
        const previousSelection = Array.from(this.selectedNodes);

        // Clear existing selection without emitting
        this.clearSelection(false);

        // Add all nodes to selection
        allNodeIds.forEach(systemId => {
            this.addToSelection(systemId, false);
        });

        if (emit) {
            this.emit('selectionChanged', {
                selected: allNodeIds,
                added: allNodeIds.filter(id => !previousSelection.includes(id)),
                removed: previousSelection.filter(id => !allNodeIds.includes(id))
            });
        }
    }

    /**
     * Updates the visual selection state of a node
     * @param {string} systemId - The ID of the system to update
     * @param {boolean} isSelected - Whether the node should appear selected
     */
    updateNodeVisualSelection(systemId, isSelected) {
        if (!this.nodeElements) return;

        // Find the node element
        const nodeElement = this.nodeElements.filter(d => d.id === systemId);

        if (nodeElement.empty()) return;

        // Update CSS class
        nodeElement.classed('selected', isSelected);

        // Optional: Update stroke for better visual feedback
        nodeElement.select('circle')
            .attr('stroke-width', isSelected ? 4 :
                (this.getNodeGroups(nodeElement.datum()).length > 0 ? 3 : 2));
    }

    /**
     * Updates visual selection for all nodes (useful after re-rendering)
     */
    updateAllNodeVisualSelections() {
        if (!this.nodeElements) return;

        this.nodeElements.each((d) => {
            this.updateNodeVisualSelection(d.id, this.isNodeSelected(d.id));
        });
    }

    /**
     * Handles node click events with multi-selection support
     * @param {Event} event - The click event
     * @param {Object} nodeData - The data of the clicked node
     */
    handleNodeClick(event, nodeData) {
        event.stopPropagation();

        const systemId = nodeData.id;
        const isShiftPressed = event.shiftKey;
        const isCtrlPressed = event.ctrlKey || event.metaKey;

        // Multi-select behavior
        if (isShiftPressed || isCtrlPressed) {
            this.toggleSelection(systemId);

            // Emit event for multi-selection
            if (this.getSelectionCount() > 1) {
                this.emit('systemsSelected', {
                    event,
                    systems: this.getSelectedSystems(),
                    primary: nodeData
                });
            } else {
                // Single selection after toggle
                this.emit('systemClicked', { event, system: nodeData });
            }
        } else {
            // Normal click - clear other selections
            const wasSelected = this.isNodeSelected(systemId);
            this.clearSelection(false);

            if (!wasSelected) {
                this.addToSelection(systemId);
            }

            // Always emit single system click for normal clicks
            this.emit('systemClicked', { event, system: nodeData });
        }
    }

    /**
     * Toggles fixed state for all selected nodes
     * @returns {boolean} The new fixed state (true if any node became fixed)
     */
    toggleSelectedNodesFixed() {
        const selectedIds = Array.from(this.selectedNodes);
        if (selectedIds.length === 0) return false;

        // Check current state - if any node is not fixed, fix all; otherwise unfix all
        const hasUnfixedNodes = selectedIds.some(id => !this.isNodeFixed(id));
        const newFixedState = hasUnfixedNodes;

        // Apply to all selected nodes
        selectedIds.forEach(systemId => {
            this.simulationManager.setNodeFixed(systemId, newFixedState);
        });

        // Emit event for UI feedback
        this.emit('selectedNodesFixedToggle', {
            systems: this.getSelectedSystems(),
            isFixed: newFixedState,
            count: selectedIds.length
        });

        return newFixedState;
    }

    /**
     * Centers the view on selected nodes
     */
    centerOnSelection() {
        const selectedIds = Array.from(this.selectedNodes);
        if (selectedIds.length === 0) return;

        // Get positions of selected nodes
        const nodes = selectedIds
            .map(id => this.simulationManager.getNodeById(id))
            .filter(node => node);

        if (nodes.length === 0) return;

        // Calculate bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y);
        });

        // Calculate center and scale
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const width = maxX - minX + 200; // Add padding
        const height = maxY - minY + 200;

        // Calculate scale to fit selection
        const scale = Math.min(
            this.width / width,
            this.height / height,
            2 // Max zoom level
        );

        // Calculate translation
        const translateX = this.width / 2 - centerX * scale;
        const translateY = this.height / 2 - centerY * scale;

        // Apply transform
        if (this.svg && this.zoom) {
            const transform = d3.zoomIdentity
                .translate(translateX, translateY)
                .scale(scale);

            this.svg.transition()
                .duration(750)
                .call(this.zoom.transform, transform);
        }
    }

    /**
     * Groups selected nodes by their common properties
     * @returns {Object} Object with grouped properties
     */
    getSelectedNodesGroupedProperties() {
        const selectedSystems = this.getSelectedSystems();
        if (selectedSystems.length === 0) return {};

        const grouped = {
            categories: {},
            statuses: {},
            groups: {},
            knownUsage: { true: 0, false: 0 }
        };

        selectedSystems.forEach(system => {
            // Count categories
            grouped.categories[system.category] =
                (grouped.categories[system.category] || 0) + 1;

            // Count statuses
            grouped.statuses[system.status] =
                (grouped.statuses[system.status] || 0) + 1;

            // Count known usage
            grouped.knownUsage[system.knownUsage] += 1;

            // Count groups
            const systemGroups = this.getNodeGroups(system);
            systemGroups.forEach(group => {
                grouped.groups[group] = (grouped.groups[group] || 0) + 1;
            });
        });

        return grouped;
    }
}