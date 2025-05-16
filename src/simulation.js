import { EventEmitter } from "./event-emitter.js";

/**
 * SimulationManager - Handles d3 force simulation logic separate from visualization
 */
export class SimulationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            linkDistance: options.linkDistance || 150,
            chargeStrength: options.chargeStrength || -300,
            collisionRadius: options.collisionRadius || 60,
            groupForceStrength: options.groupForceStrength || 0.5,
            ...options
        };

        this.simulation = null;
        this.nodeCache = options.nodeCache || null;
        this.width = options.width || 800;
        this.height = options.height || 600;

        // For throttling cache updates
        this.lastCacheUpdate = 0;
        this.cacheUpdateInterval = options.cacheUpdateInterval || 300;

        // Callbacks
        this.onTick = options.onTick || (() => { });
        this.onEnd = options.onEnd || (() => { });
        this.onToggleFixed = options.onToggleFixed || (() => { });
    }

    /**
     * Returns the node with the given ID from the current simulation
     * @param {string} systemId - The ID of the system to find
     * @returns {Object|null} The node object or null if not found
     */
    getNodeById(systemId) {
        return this.simulation.nodes().find(node => node.id === systemId);
    }

    /**
     * Checks if a node is fixed
     * @param {string} systemId - The ID of the system to check
     * @returns {boolean} True if the node is fixed, false otherwise or if not found
     */
    isNodeFixed(systemId, curNode = undefined) {
        const node = curNode || this.getNodeById(systemId);
        return node ? !!node.isFixed : false;
    }

    /**
     * Toggles the fixed state of a node identified by systemId.
     *
     * @param {string|number} systemId - The unique identifier of the node to toggle.
     * @param {Object} [curNode=undefined] - The current node object (optional). If not provided, the node will be retrieved by systemId.
     * @returns {null|undefined} Returns null if the node is not found; otherwise, returns undefined.
     */
    toggleNodeFixed(systemId, curNode = undefined) {
        const node = curNode && this.getNodeById(systemId);
        if (!node) return null;
        const isFixed = this.isNodeFixed(systemId, node);
        const newState = !isFixed;
        this.setNodeFixed(systemId, newState, node);
    }

    /**
     * Sets or removes the fixed position of a node in the simulation.
     *
     * @param {string|number} systemId - The unique identifier of the node to fix or unfix.
     * @param {boolean} state - If true, fixes the node at its current position; if false, releases the node.
     * @param {Object} [curNode=undefined] - (Optional) The node object to operate on. If not provided, the node is retrieved by systemId.
     * @returns {boolean|null} Returns the node's fixed state after the operation, or null if the node was not found.
     */
    setNodeFixed(systemId, state, curNode = undefined) {
        const node = curNode || this.getNodeById(systemId);
        if (!node) return null;

        if (!state) {
            // Remove fixation
            node.isFixed = false;
            node.fx = null;
            node.fy = null;
        } else {
            // Fix node at current position
            node.isFixed = true;
            node.fx = node.x;
            node.fy = node.y;
        }

        // Update cache
        if (this.nodeCache && node.id) {
            this.nodeCache.set(node.id, {
                x: node.x,
                y: node.y,
                vx: node.vx || 0,
                vy: node.vy || 0,
                isFixed: node.isFixed
            });
        }

        // Slightly restart simulation
        this.restart(0.1);

        this.onToggleFixed && this.onToggleFixed(systemId, state);

        return node.isFixed;
    }

    /**
     * Initialize simulation with nodes and links
     */
    initialize(nodes, links, groups) {
        // Apply cached positions before simulation starts
        if (this.nodeCache) {
            this.applyNodePositionsFromCache(nodes);
        }

        // Calculate initial positions for nodes without cache positions
        this.applyInitialPositions(nodes);

        // Create simulation
        this.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(this.options.linkDistance))
            .force("charge", d3.forceManyBody()
                .strength(this.options.chargeStrength))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide()
                .radius(this.options.collisionRadius));

        // Add group force if groups are provided
        if (groups && Object.keys(groups).length > 0) {
            this.simulation.force("group", d3.forceClusterMultiGroup()
                .centers(groups)
                .strength(this.options.groupForceStrength));
        }

        // Add containment force to keep nodes within bounds
        this.simulation.force("containment", this.createContainmentForce());

        // Register tick handler
        this.simulation.on("tick", () => {
            // Update node cache periodically during simulation
            this.throttledUpdateNodeCache();

            // Call external tick handler
            this.onTick();
        });

        // Register end handler
        this.simulation.on("end", () => {
            // Save final positions to cache
            if (this.nodeCache) {
                this.nodeCache.updateBatch(this.simulation.nodes());
            }

            // Call external end handler
            this.onEnd();
        });

        return this.simulation;
    }

    /**
     * Retrieves the groups associated with a node.
     *
     * If the node has a non-empty `groups` array, it returns that array.
     * If the node has a `group` property as a string, it returns an array containing that string.
     * Otherwise, it returns an empty array.
     *
     * @param {Object} node - The node object to extract groups from.
     * @param {Array<string>} [node.groups] - An optional array of group names.
     * @param {string} [node.group] - An optional single group name.
     * @returns {Array<string>} An array of group names associated with the node.
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
     * Create a force that keeps nodes within the container bounds
     */
    createContainmentForce() {
        // Add padding to prevent nodes from touching the edge
        const padding = 50;

        return () => {
            for (let node of this.simulation.nodes()) {
                // Gradually increase force as node approaches boundaries
                if (node.x < padding) {
                    node.vx += (padding - node.x) * 0.1;
                } else if (node.x > this.width - padding) {
                    node.vx -= (node.x - (this.width - padding)) * 0.1;
                }

                if (node.y < padding) {
                    node.vy += (padding - node.y) * 0.1;
                } else if (node.y > this.height - padding) {
                    node.vy -= (node.y - (this.height - padding)) * 0.1;
                }

                // Dampen velocity for stable movement
                node.vx *= 0.9;
                node.vy *= 0.9;
            }
        };
    }

    /**
     * Applies cached positions and velocities to a list of nodes.
     * 
     * For each node with a matching entry in the node cache, updates its position (`x`, `y`),
     * velocity (`vx`, `vy`), and temporarily fixes its position (`fx`, `fy`) for visual stability.
     * If the node is not marked as fixed, releases the fixed position after a short delay.
     * 
     * @param {Array<Object>} nodes - Array of node objects to update. Each node should have an `id` property.
     * @returns {number} The number of nodes that had their positions updated from the cache.
     */
    applyNodePositionsFromCache(nodes) {
        if (!nodes || !this.nodeCache) return 0;

        let cacheHits = 0;
        nodes.forEach(node => {
            if (node.id) {
                const cachedPosition = this.nodeCache.get(node.id);
                if (cachedPosition) {
                    // Position from cache
                    node.x = cachedPosition.x;
                    node.y = cachedPosition.y;

                    // Reduced velocity for smoother transitions
                    node.vx = (cachedPosition.vx || 0) * 0.3;
                    node.vy = (cachedPosition.vy || 0) * 0.3;

                    // Briefly fix position for visual stability
                    node.fx = cachedPosition.x;
                    node.fy = cachedPosition.y;

                    // Schedule release of fixed position
                    node.isFixed = !!cachedPosition.isFixed;
                    if(!node.isFixed) {
                        setTimeout(() => {
                            node.fx = null;
                            node.fy = null;
                        }, 500);
                    }

                    cacheHits++;
                }
            }
        });

        return cacheHits;
    }

    /**
     * Assigns initial positions and velocities to nodes that lack position data.
     * 
     * For each node without a position, this method:
     * - Attempts to find reference nodes in the same group(s) (if any), or falls back to all positioned nodes.
     * - Calculates a target position near the center of the reference nodes, with a random offset.
     * - Places the node at a random angle and distance from the target position.
     * - Sets an initial velocity pointing gently toward the target position.
     * 
     * @param {Array<Object>} nodes - Array of node objects. Each node may have `x`, `y`, `vx`, `vy` properties and group information.
     */
    applyInitialPositions(nodes) {
        // Find nodes without position
        const nodesWithoutPosition = nodes.filter(node =>
            node.x === undefined || node.y === undefined);

        if (nodesWithoutPosition.length === 0) return;

        // Get positioned nodes
        const positionedNodes = nodes.filter(node =>
            node.x !== undefined && node.y !== undefined);

        // For each new node
        nodesWithoutPosition.forEach(node => {
            let referenceNodes = [];
            let targetPosition;

            // Reference nodes based on groups or all nodes
            const nodeGroups = this.getNodeGroups(node);

            if (nodeGroups.length > 0) {
                // Collect all reference nodes for all groups of the node
                nodeGroups.forEach(group => {
                    const groupNodes = positionedNodes.filter(n => {
                        const nGroups = this.getNodeGroups(n);
                        return nGroups.includes(group);
                    });

                    referenceNodes = [...referenceNodes, ...groupNodes];
                });

                // Remove duplicates
                referenceNodes = Array.from(new Set(referenceNodes));
            }

            if (referenceNodes.length === 0) {
                referenceNodes = positionedNodes;
            }

            // Calculate target position (between all group centers)
            if (referenceNodes.length > 0) {
                let sumX = 0, sumY = 0;
                referenceNodes.forEach(refNode => {
                    sumX += refNode.x;
                    sumY += refNode.y;
                });

                // Group center with offset
                const isGroupCentered = referenceNodes !== positionedNodes;
                const offset = isGroupCentered ? 50 : 150;

                targetPosition = {
                    x: (sumX / referenceNodes.length) + (Math.random() - 0.5) * offset,
                    y: (sumY / referenceNodes.length) + (Math.random() - 0.5) * offset
                };
            } else {
                // If no references, use screen center
                targetPosition = {
                    x: this.width / 2 + (Math.random() - 0.5) * 200,
                    y: this.height / 2 + (Math.random() - 0.5) * 200
                };
            }

            // Starting position at group center edge
            const distanceFromCenter = referenceNodes.length > 0 ? 100 : 200;
            const angle = Math.random() * Math.PI * 2;  // Random angle

            node.x = targetPosition.x + Math.cos(angle) * distanceFromCenter;
            node.y = targetPosition.y + Math.sin(angle) * distanceFromCenter;

            // Initial velocity toward target position
            const dx = targetPosition.x - node.x;
            const dy = targetPosition.y - node.y;

            // Gentle movement toward center
            const speedFactor = 0.01;  // Very low for gentle movement
            node.vx = dx * speedFactor;
            node.vy = dy * speedFactor;
        });
    }

    /**
     * Update node cache throttled
     */
    throttledUpdateNodeCache() {
        const now = Date.now();
        if (this.nodeCache && now - this.lastCacheUpdate > this.cacheUpdateInterval) {
            this.lastCacheUpdate = now;
            this.nodeCache.updateBatch(this.simulation.nodes());
        }
    }

    /**
     * Restart simulation with alpha
     */
    restart(alpha = 0.3) {
        if (this.simulation) {
            this.simulation.alpha(alpha).restart();
        }
    }

    /**
     * Stop simulation
     */
    stop() {
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    /**
     * Update simulation size
     */
    updateSize(width, height) {
        this.width = width;
        this.height = height;

        if (this.simulation) {
            this.simulation.force("center", d3.forceCenter(width / 2, height / 2));
            // Restart with low alpha to adjust positions
            this.restart(0.1);
        }
    }

    /**
     * Create drag behavior
     */
    createDragBehavior() {
        return d3.drag()
            .on("start", (event, d) => this.dragstarted(event, d))
            .on("drag", (event, d) => this.dragged(event, d))
            .on("end", (event, d) => this.dragended(event, d));
    }

    /**
     * Handle drag start
     */
    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        this.setNodeFixed(d.id, true, d);
    }

    /**
     * Handle dragging
     */
    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    /**
     * Handle drag end
     */
    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);

        // Only persist position in cache if dragged
        if (this.nodeCache && d.id) {
            this.nodeCache.set(d.id, {
                x: d.x,
                y: d.y,
                vx: 0,
                vy: 0,
                isFixed: d.isFixed || false
            });
        }
    }
}

d3.forceClusterMultiGroup = function () {
    let strength = 0.1;
    let centers = {};
    let nodes = [];

    // Weight for each group (1/number of groups of a node)
    // So that nodes with fewer groups are more strongly attracted to their groups
    function getGroupWeight(node) {
        const nodeGroups = getNodeGroups(node);
        return nodeGroups.length > 0 ? 1 / nodeGroups.length : 0;
    }

    // Helper function to extract all groups of a node
    function getNodeGroups(node) {
        if (Array.isArray(node.groups) && node.groups.length > 0) {
            return node.groups;
        } else if (node.group && typeof node.group === 'string') {
            return [node.group];
        }
        return [];
    }

    function force(alpha) {
        // For each node
        nodes.forEach(d => {
            const nodeGroups = getNodeGroups(d);
            if (nodeGroups.length === 0) return; // Skip if no group

            // Vector for the total force on the node
            let totalForceX = 0;
            let totalForceY = 0;
            let totalWeight = 0;

            // Calculate force from each group
            nodeGroups.forEach(groupName => {
                const groupCenter = centers[groupName];
                if (!groupCenter) return;

                // Weight for this group
                const weight = getGroupWeight(d);
                totalWeight += weight;

                // Adjust force depending on the number of groups the node is in
                const k = strength * alpha * weight;

                // Force towards the group center
                totalForceX += (groupCenter.x - d.x) * k;
                totalForceY += (groupCenter.y - d.y) * k;
            });

            // Apply total force to the node
            if (totalWeight > 0) {
                d.vx += totalForceX;
                d.vy += totalForceY;
            }
        });
    }

    force.initialize = function (_) {
        nodes = _;
    };

    force.centers = function (_) {
        return arguments.length ? (centers = _, force) : centers;
    };

    force.strength = function (_) {
        return arguments.length ? (strength = _, force) : strength;
    };

    return force;
};