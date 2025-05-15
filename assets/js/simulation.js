/**
 * SimulationManager - Handles d3 force simulation logic separate from visualization
 */
class SimulationManager {
    constructor(options = {}) {
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
        this.onTick = options.onTick || (() => {});
        this.onEnd = options.onEnd || (() => {});
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
            this.simulation.force("group", d3.forceCluster()
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
     * Apply cached positions to nodes
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
                    setTimeout(() => {
                        node.fx = null;
                        node.fy = null;
                    }, 500);
                    
                    cacheHits++;
                }
            }
        });
        
        return cacheHits;
    }
    
    /**
     * Calculate starting positions for nodes without cache positions
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
            let referenceNodes;
            let targetPosition;
            
            // Reference nodes based on group or all nodes
            if (node.group) {
                referenceNodes = positionedNodes.filter(n => n.group === node.group);
            }
            
            if (!referenceNodes || referenceNodes.length === 0) {
                referenceNodes = positionedNodes;
            }
            
            // Calculate target position (group center)
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
                group: d.group
            });
        }
        
        // Keep position fixed where user dropped it
        // Or release: 
        d.fx = null;
        d.fy = null;
    }
}

/**
 * Clustering-Kraft für d3.js (wird für die Gruppierung benötigt)
 */
d3.forceCluster = function () {
    let strength = 0.1;
    let centers = {};
    let nodes = [];

    function force(alpha) {
        // Für jeden Knoten
        nodes.forEach(d => {
            if (!d.group) return; // Überspringen, wenn kein Gruppenattribut

            const groupCenter = centers[d.group];
            if (!groupCenter) return;

            // Anziehungskraft zum Gruppenzentrum
            const k = strength * alpha;
            d.vx += (groupCenter.x - d.x) * k;
            d.vy += (groupCenter.y - d.y) * k;
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