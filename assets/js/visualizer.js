/**
 * SystemVisualizer - Visualisiert IT-Systeme und deren Abhängigkeiten als interaktiven Graphen
 */
class SystemVisualizer {
    constructor(containerId, dataManager) {
        this.containerId = containerId;
        this.dataManager = dataManager;

        // Getter für Zugriff auf aktuelle Daten
        Object.defineProperty(this, 'data', {
            get: () => this.dataManager.getData()
        });

        // D3-Visualisierungsvariablen
        this.svg = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;

        // UI-Zustände
        this.searchResults = [];
        this.activeFilters = {
            categories: ["core", "legacy", "data", "service", "external"],
            knownUsage: ["known", "unknown"]
        };

        // Farbskalen
        this.colorScale = d3.scaleOrdinal()
            .domain(["core", "legacy", "data", "service", "external"])
            .range(["#0d6efd", "#6c757d", "#198754", "#ffc107", "#dc3545"]);
        this.groupColorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Node-Cache erstellen
        this.nodeCache = new NodeCache({
            useLocalStorage: true,
            localStorageKey: 'system_visualizer_node_positions',
            debounceTime: 250
        });

        // SimulationManager erstellen (wird später initialisiert)
        this.simulationManager = null;

        // Visualisierungselemente
        this.nodeElements = null;
        this.linkElements = null;
        this.groupHulls = null;
        this.groupLabels = null;
    }

    /**
     * Initialisiert die Visualisierung
     */
    initialize() {
        if (!this.data || !this.data.systems || this.data.systems.length === 0) {
            this.showError("Keine Systemdaten verfügbar");
            return;
        }

        this.createVisualization();
        this.setupZoom();
        this.attachEventListeners();

        // Auf Datenänderungen reagieren
        this.dataManager.addEventListener('dataChanged', () => {
            // Visualisierung neu erstellen
            const container = document.getElementById(this.containerId);
            if (container) {
                container.innerHTML = '';
                this.createVisualization();
                this.setupZoom();
            }
        });

        // Details-Panel-Aktualisierung bei Datenänderungen
        this.dataManager.addEventListener('dataChanged', () => {
            const detailsPanel = document.getElementById('details-panel');
            if (detailsPanel && detailsPanel.classList.contains('active')) {
                const systemId = document.getElementById('detail-title').getAttribute('data-system-id');
                if (systemId) {
                    const updatedSystem = this.dataManager.getData().systems.find(sys => sys.id === systemId);
                    if (updatedSystem) {
                        this.showSystemDetails(updatedSystem);
                    } else {
                        detailsPanel.classList.remove('active');
                    }
                }
            }
        });

        // Event-Listener für Fenstergrößenänderungen
        window.addEventListener('resize', this.handleResize.bind(this));

        // Vor dem Beenden Cache aktualisieren
        window.addEventListener('beforeunload', () => {
            if (this.simulationManager) {
                this.simulationManager.stop();
            }
        });
    }

    /**
     * Erstellt die D3.js-Visualisierung
     */
    createVisualization() {
        const container = document.getElementById(this.containerId);

        if (!container) {
            console.error(`Container mit ID "${this.containerId}" nicht gefunden`);
            return;
        }

        // Größe und Margins (Vollbild)
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // SVG erstellen
        this.svg = d3.select(container)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        // Gruppe für Zoom
        const g = this.svg.append("g");

        // Tooltip erstellen
        // Tooltip-Element suchen oder erstellen (als D3-Selection)
        let tooltip = d3.select("body").select(".tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);
        }

        // Graph-Daten vorbereiten und filtern
        const nodes = this.getFilteredNodes();
        const links = this.getFilteredLinks(nodes);

        // Gruppierungen identifizieren
        const groups = this.identifyGroups(nodes);

        // SimulationManager erstellen
        this.simulationManager = new SimulationManager({
            width: this.width,
            height: this.height,
            nodeCache: this.nodeCache,
            linkDistance: 150,
            chargeStrength: -300,
            collisionRadius: 60,
            groupForceStrength: 0.5,
            onTick: () => this.onSimulationTick()
        });

        // Pfeilspitzen für die Links
        g.append("defs").selectAll("marker")
            .data(["data", "integration", "authentication", "monitoring"])
            .enter().append("marker")
            .attr("id", d => `arrowhead-${d}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)  // Kein Versatz - Pfeilspitze beginnt am Ende des Pfades
            .attr("refY", 0)  // Kein Versatz
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

        // Gruppenrahmen zeichnen (vor den Knoten und Links)
        this.groupHulls = g.append("g")
            .attr("class", "groups")
            .selectAll(".group-hull")
            .data(Object.entries(groups).filter(([name]) => name !== "undefined")) // "undefined" Gruppe ausfiltern
            .enter().append("path")
            .attr("class", "group-hull")
            .attr("data-group", d => d[0])
            .style("fill", d => this.groupColorScale(d[0]))
            .style("stroke", d => d3.rgb(this.groupColorScale(d[0])).darker())
            .style("stroke-width", 1.5)
            .style("fill-opacity", 0.2)
            .style("stroke-opacity", 0.4);

        // Links zeichnen
        const that = this;
        // Links zeichnen
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
                    <strong>${sourceSystem ? sourceSystem.name : 'Unbekannt'} → ${targetSystem ? targetSystem.name : 'Unbekannt'}</strong><br>
                    ${d.description || 'Keine Beschreibung'}<br>
                    <em>Protokoll: ${d.protocol || 'Nicht spezifiziert'}</em>
                `);

                // Tooltip mittig unterhalb des Mauszeigers positionieren
                const tooltipNode = tooltip.node();
                // Temporär sichtbar machen, um Breite zu messen
                tooltip.style("opacity", 0).style("display", "block");
                const tooltipWidth = tooltipNode.offsetWidth;
                tooltip.style("display", null); // zurücksetzen

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
            .on("click", (event, d) => {
                if (!this.dependencyManager.isConnectionModeActive) {
                    this.dependencyManager.showLinkControls(event, d);
                    event.stopPropagation();
                }
            });;

        // Knoten erstellen
        const nodeGroup = g.append("g")
            .attr("class", "nodes");

        this.nodeElements = nodeGroup.selectAll(".node")
            .data(nodes)
            .enter().append("g")
            .attr("class", d => `node ${d.knownUsage ? "" : "unknown-usage"} ${d.group ? "group-" + d.group : ""}`)
            .attr("data-system-id", d => d.id);

        if (!this.dragDisabled) {
            this.nodeElements.call(this.simulationManager.createDragBehavior())
        }

        // Kreise für die Systeme
        const radius = 30;
        this.nodeElements.append("circle")
            .attr("r", radius)
            .attr("fill", d => this.colorScale(d.category))
            .attr("stroke", d => d.group ? this.groupColorScale(d.group) : "#fff")
            .attr("stroke-width", d => d.group ? 3 : 2)
            .on("mouseover", function (event, d) {
                if (that.dragDisabled) return;
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`
                    <strong>${d.name}</strong><br>
                    ${d.description}<br>
                    ${d.group ? '<span class="badge bg-info">Gruppe: ' + d.group + '</span>' : ''}
                `);

                // Temporär sichtbar machen, um Breite und Höhe zu messen
                tooltip.style("opacity", 0).style("display", "block");
                const tooltipNode = tooltip.node();
                const tooltipWidth = tooltipNode.offsetWidth;
                tooltip.style("display", null); // zurücksetzen

                // Höhe des Kreises bestimmen (SVG-Kreis hat r=30)
                const circleRadius = radius;
                // Optional: Falls der Kreisradius dynamisch ist, könnte man ihn so ermitteln:
                // const circleRadius = d3.select(this).attr("r");

                tooltip
                    .style("left", (event.pageX - tooltipWidth / 2) + "px")
                    .style("top", (event.pageY + Number(circleRadius) + 8) + "px") // 8px Abstand unterhalb des Kreises
                    .transition()
                    .duration(200)
                    .style("opacity", .9);
            })
            .on("mouseout", function () {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            })
            .on("click", (event, d) => this.showSystemDetails(d));

        // Text-Labels
        this.nodeElements.append("text")
            .attr("dy", -40)
            .attr("text-anchor", "middle")
            .text(d => d.name)
            .attr("fill", "#333");

        // Gruppen-Labels hinzufügen
        this.groupLabels = g.append("g")
            .attr("class", "group-labels")
            .selectAll(".group-label")
            .data(Object.entries(groups).filter(([name]) => name !== "undefined"))
            .enter().append("text")
            .attr("class", "group-label")
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .style("fill", d => d3.rgb(this.groupColorScale(d[0])).darker(2))
            .style("pointer-events", "none")
            .text(d => d[0]);

        // Simulation starten
        this.simulationManager.initialize(nodes, links, groups);
    }

    /**
    * Gibt gefilterte Links basierend auf den gefilterten Knoten zurück
    */
    getFilteredLinks(nodes) {
        const nodeIds = nodes.map(node => node.id);

        // Verbindungszähler initialisieren
        const linkCounts = {};

        // Erste Filterung der Links
        const filteredLinks = this.data.dependencies.filter(dep => {
            return nodeIds.includes(dep.source) && nodeIds.includes(dep.target);
        });

        // Links zählen und indizieren
        filteredLinks.forEach(dep => {
            const key = `${dep.source}-${dep.target}`;
            const reverseKey = `${dep.target}-${dep.source}`;

            // Zähler für diese Richtung initialisieren
            if (!linkCounts[key]) {
                linkCounts[key] = 0;
            }

            // Zähler erhöhen und dem Link zuweisen
            linkCounts[key]++;
            dep.linkIndex = linkCounts[key] - 1; // 0-basierter Index

            // Gesamtzahl der Links in dieser Richtung speichern
            dep.totalLinks = filteredLinks.filter(d =>
                (d.source === dep.source && d.target === dep.target)
            ).length;
        });

        // Links mit zusätzlichen Informationen zurückgeben
        return filteredLinks.map(dep => ({
            source: dep.source,
            target: dep.target,
            linkIndex: dep.linkIndex,
            totalLinks: dep.totalLinks,
            ...dep
        }));
    }

    /**
     * Wird bei jedem Simulation-Tick aufgerufen
     */
    onSimulationTick() {
        if (!this.linkElements || !this.nodeElements || !this.groupHulls || !this.groupLabels) {
            return;
        }

        // Links aktualisieren
        this.linkElements.attr("d", this.linkArc);

        // Knoten aktualisieren
        this.nodeElements.attr("transform", d => `translate(${d.x},${d.y})`);

        // Gruppierungshüllen aktualisieren
        this.groupHulls.attr("d", d => {
            const groupName = d[0];
            const simulation = this.simulationManager.simulation;
            const groupNodes = simulation.nodes().filter(n => n.group === groupName);

            if (groupNodes.length < 2) return ""; // Mindestens 2 Punkte für einen Pfad benötigt

            // Zentroid der Gruppe berechnen
            const points = groupNodes.map(n => [n.x, n.y]);
            const centroid = this.getCentroid(points);

            // Radius berechnen (mit zusätzlichem Padding)
            const maxDist = Math.max(40, this.getMaxDistanceFromCentroid(points, centroid) + 40);

            // Kreisförmige Hülle um die Gruppe zeichnen
            return this.createHullPath(centroid, maxDist, 24);
        });

        // Gruppenbezeichnungen aktualisieren
        this.groupLabels.attr("transform", d => {
            const groupName = d[0];
            const simulation = this.simulationManager.simulation;
            const groupNodes = simulation.nodes().filter(n => n.group === groupName);

            if (groupNodes.length === 0) return "translate(0,0)";

            const points = groupNodes.map(n => [n.x, n.y]);
            const centroid = this.getCentroid(points);

            return `translate(${centroid[0]},${centroid[1] - 60})`;
        });
    }

    /**
     * Richtet Zoom-Funktionalität ein
     */
    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                this.svg.select("g").attr("transform", event.transform);
            });

        this.svg.call(this.zoom);

        // Reset-Zoom-Button
        document.getElementById("reset-zoom").addEventListener("click", () => {
            this.svg.transition().duration(750).call(
                this.zoom.transform,
                d3.zoomIdentity
            );
        });

        // Nach dem Zoom oder Pan den Zustand speichern
        this.zoom.on('end', () => {
            this.saveViewportState();
        });

        // Zustand wiederherstellen
        this.restoreViewportState();
    }

    /**
 * Optimierte linkArc-Funktion mit angepasster Verteilung für gerade Anzahl von Links
 */
    linkArc(d) {
        // Knotenradius
        const nodeRadius = 32;

        // Extrahiere Quell- und Zielkoordinaten
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;

        // Berechne Abstand und Basiswinkel zwischen den Knoten
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);

        // Bestimmung der Winkelversätze
        const totalLinks = d.totalLinks || 1;
        const linkIndex = d.linkIndex || 0;

        // Maximaler Winkelversatz in Grad (±15°), in Radiant umgerechnet
        const maxOffsetDegrees = 15;
        const maxOffset = (maxOffsetDegrees * Math.PI) / 180;

        // Winkelversatz berechnen - mit Anpassung für gerade Anzahl von Links
        let angleOffset = 0;

        if (totalLinks > 1) {
            if (totalLinks % 2 === 0) {
                // Bei gerader Anzahl: Verschiebung, um die Mitte zu vermeiden
                // z.B. bei 4 Links: -0.75, -0.25, +0.25, +0.75 statt -1, -0.33, +0.33, +1
                const step = 1 / totalLinks;
                angleOffset = ((linkIndex / (totalLinks - 1)) * 2 - 1 + step) * maxOffset;
            } else {
                // Bei ungerader Anzahl: normale Verteilung
                angleOffset = ((linkIndex / (totalLinks - 1)) * 2 - 1) * maxOffset;
            }
        }

        // Startpunkt auf dem Quellknoten
        const startAngle = baseAngle + angleOffset;
        const startX = sourceX + Math.cos(startAngle) * nodeRadius;
        const startY = sourceY + Math.sin(startAngle) * nodeRadius;

        // Endpunkt auf dem Zielknoten mit gespiegeltem Winkelversatz
        const endAngle = baseAngle + Math.PI - angleOffset;
        const endX = targetX + Math.cos(endAngle) * nodeRadius;
        const endY = targetY + Math.sin(endAngle) * nodeRadius;

        // Minimaler Winkelversatz für die Krümmung (selbst bei einzelnen Links)
        // Einzelne Links bekommen eine leichte Kurve statt einer geraden Linie
        const minCurvatureAngle = (3 * Math.PI) / 180;  // 3 Grad in Radiant

        // Effektiver Winkelversatz für die Krümmungsberechnung
        const effectiveAngleOffset = Math.max(Math.abs(angleOffset), minCurvatureAngle);

        // Bogenrichtung basierend auf dem Vorzeichen des Winkelversatzes
        // Bei einzelnen Links: standardmäßig im Uhrzeigersinn
        const sweep = (totalLinks === 1 || angleOffset >= 0) ? 1 : 0;

        // Krümmungsfaktor basierend auf Winkelversatz und Distanz
        // Minimal 0.15 für leichte Kurve, maximal 0.5 für starke Kurve
        let curvature = 0.15 + (effectiveAngleOffset / maxOffset) * 0.35;

        // Orthogonale Richtungsvektoren für den Kontrollpunkt
        const tangentX = (endX - startX) / distance;
        const tangentY = (endY - startY) / distance;
        const perpX = -tangentY;
        const perpY = tangentX;

        // Mittelpunkt berechnen
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        // Kontrollpunkt mit Richtung basierend auf sweep
        const ctrlFactor = (sweep === 1 ? 1 : -1) * curvature * distance;
        const ctrlX = midX + perpX * ctrlFactor;
        const ctrlY = midY + perpY * ctrlFactor;

        // Quadratische Bézierkurve
        return `M${startX},${startY}Q${ctrlX},${ctrlY} ${endX},${endY}`;
    }

    /**
     * Identifiziert alle Gruppen und bereitet sie für d3.js vor
     */
    identifyGroups(nodes) {
        const groupMap = {};

        // Erfasse alle Knoten mit Gruppen
        nodes.forEach(node => {
            if (node.group) {
                if (!groupMap[node.group]) {
                    groupMap[node.group] = {
                        nodes: [],
                        x: 0,
                        y: 0
                    };
                }
                groupMap[node.group].nodes.push(node);
            } else {
                // Knoten ohne Gruppe in "undefined" Gruppe
                if (!groupMap["undefined"]) {
                    groupMap["undefined"] = {
                        nodes: [],
                        x: 0,
                        y: 0
                    };
                }
                groupMap["undefined"].nodes.push(node);
            }
        });

        // Berechne initiale Positionen für die Gruppen
        Object.entries(groupMap).forEach(([groupName, group], index) => {
            const angle = (index / Object.keys(groupMap).length) * 2 * Math.PI;
            const radius = Math.min(this.width, this.height) * 0.4;

            group.x = this.width / 2 + radius * Math.cos(angle);
            group.y = this.height / 2 + radius * Math.sin(angle);
        });

        return groupMap;
    }

    /**
     * Berechnet den Schwerpunkt (Zentroid) einer Gruppe von Punkten
     */
    getCentroid(points) {
        const n = points.length;
        if (n === 0) return [0, 0];

        const sumX = points.reduce((sum, p) => sum + p[0], 0);
        const sumY = points.reduce((sum, p) => sum + p[1], 0);

        return [sumX / n, sumY / n];
    }

    /**
     * Berechnet die maximale Distanz vom Zentroid zu einem Punkt der Gruppe
     */
    getMaxDistanceFromCentroid(points, centroid) {
        if (points.length === 0) return 0;

        return Math.max(...points.map(p =>
            Math.sqrt(Math.pow(p[0] - centroid[0], 2) + Math.pow(p[1] - centroid[1], 2))
        ));
    }

    /**
     * Erstellt einen Pfad für die Gruppenhülle
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
     * Zeigt die Systemdetails im Overlay an
     */
    showSystemDetails(system) {
        const detailsPanel = document.getElementById('details-panel');
        const detailsDiv = document.getElementById('system-details');
        const detailTitle = document.getElementById('detail-title');

        if (!detailsDiv || !detailsPanel || !detailTitle) {
            console.error('Details-Container nicht gefunden');
            return;
        }

        // Titel setzen
        detailTitle.textContent = system.name;
        detailTitle.setAttribute('data-system-id', system.id);

        // Eingehende und ausgehende Abhängigkeiten finden
        const incomingDeps = this.data.dependencies.filter(dep => dep.target === system.id);
        const outgoingDeps = this.data.dependencies.filter(dep => dep.source === system.id);

        let html = `
            <div class="system-detail-card">
                <p class="mb-1">${system.description}</p>
                <div class="badge bg-${this.getCategoryClass(system.category)} mb-2">${system.category}</div>
                <p><strong>Status:</strong> ${system.status}</p>
                <p><strong>Bekannte Nutzung:</strong> ${system.knownUsage ? 'Ja' : 'Nein'}</p>
        `;

        // Gruppen-Information hinzufügen, falls vorhanden
        if (system.group) {
            html += `<p><strong>Gruppe:</strong> <span class="badge bg-info">${system.group}</span></p>`;
        }

        if (system.tags && system.tags.length > 0) {
            html += `<p><strong>Tags:</strong> ${system.tags.map(tag =>
                `<span class="badge bg-secondary">${tag}</span>`).join(' ')}</p>`;
        }

        if (incomingDeps.length > 0) {
            html += `<h6 class="mt-3">Eingehende Verbindungen</h6><ul class="list-group">`;
            incomingDeps.forEach(dep => {
                const source = this.data.systems.find(s => s.id === dep.source);
                html += `
                    <li class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <strong>${source ? source.name : 'Unbekannt'}</strong>
                            <span class="badge bg-secondary">${dep.protocol || 'Unbekannt'}</span>
                        </div>
                        <small>${dep.description || 'Keine Beschreibung'}</small>
                    </li>`;
            });
            html += `</ul>`;
        }

        if (outgoingDeps.length > 0) {
            html += `<h6 class="mt-3">Ausgehende Verbindungen</h6><ul class="list-group">`;
            outgoingDeps.forEach(dep => {
                const target = this.data.systems.find(s => s.id === dep.target);
                html += `
                    <li class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <strong>${target ? target.name : 'Unbekannt'}</strong>
                            <span class="badge bg-secondary">${dep.protocol || 'Unbekannt'}</span>
                        </div>
                        <small>${dep.description || 'Keine Beschreibung'}</small>
                    </li>`;
            });
            html += `</ul>`;
        }

        if (incomingDeps.length === 0 && outgoingDeps.length === 0) {
            html += `<div class="alert alert-warning mt-3">Dieses System hat keine bekannten Verbindungen.</div>`;
        }

        html += `</div>`;

        detailsDiv.innerHTML = html;

        // Details-Panel anzeigen
        detailsPanel.classList.add('active');
    }

    /**
     * Hilfsfunktion zur Ermittlung der Bootstrap-Farbe für Kategorien
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
     * Zeigt eine Fehlermeldung an
     */
    showError(message) {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `<div class="alert alert-danger m-3">${message}</div>`;
        } else {
            console.error(message);
        }
    }

    /**
     * Behandelt Größenänderungen des Fensters
     */
    handleResize() {
        const container = document.getElementById(this.containerId);
        if (container && this.svg) {
            // Neue Größe erfassen
            this.width = container.clientWidth;
            this.height = container.clientHeight;

            // SVG-Größe aktualisieren
            this.svg
                .attr("width", this.width)
                .attr("height", this.height);

            // Simulationsmanager über neue Größe informieren
            if (this.simulationManager) {
                this.simulationManager.updateSize(this.width, this.height);
            }
        }
    }

    /**
     * Fügt Event-Listener für UI-Elemente hinzu
     */
    attachEventListeners() {
        // Filter für Systemkategorien
        const categoryFilters = document.querySelectorAll('.category-filter');
        if (categoryFilters.length > 0) {
            categoryFilters.forEach(filter => {
                filter.addEventListener('change', () => {
                    const checkedCategories = Array.from(document.querySelectorAll('.category-filter:checked'))
                        .map(checkbox => checkbox.value);
                    this.activeFilters.categories = checkedCategories;
                });
            });
        }

        // Filter für Systemstatus
        const statusFilters = document.querySelectorAll('.status-filter');
        if (statusFilters.length > 0) {
            statusFilters.forEach(filter => {
                filter.addEventListener('change', () => {
                    const checkedStatuses = Array.from(document.querySelectorAll('.status-filter:checked'))
                        .map(checkbox => checkbox.value);
                    this.activeFilters.knownUsage = checkedStatuses;
                });
            });
        }

        // Filter anwenden
        const applyFiltersButton = document.getElementById('apply-filters');
        if (applyFiltersButton) {
            applyFiltersButton.addEventListener('click', () => {
                this.applyFilters();
                document.getElementById('filter-panel').classList.remove('active');
            });
        }

        // Suchfeld
        const searchInput = document.getElementById('system-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.performSearch(searchInput.value));
        }
    }

    /**
     * Wendet Filter auf die Visualisierung an
     */
    applyFilters() {
        if (this.svg) {
            this.svg.remove();
            this.createVisualization();
            this.setupZoom();
        }
    }

    /**
     * Gibt gefilterte Knoten zurück
     */
    getFilteredNodes() {
        return this.data.systems.filter(system => {
            // Kategorie-Filter
            if (!this.activeFilters.categories.includes(system.category)) {
                return false;
            }

            // Status-Filter (bekannte/unbekannte Nutzung)
            const usageType = system.knownUsage ? 'known' : 'unknown';
            if (!this.activeFilters.knownUsage.includes(usageType)) {
                return false;
            }

            return true;
        }).map(system => ({ ...system }));
    }

    /**
     * Führt eine Suche durch und zeigt die Ergebnisse an
     */
    performSearch(query) {
        const resultsContainer = document.getElementById('search-results');

        if (!resultsContainer) {
            console.error('Suchergebnisse-Container nicht gefunden');
            return;
        }

        if (!query || query.trim() === '') {
            resultsContainer.innerHTML = '';
            return;
        }

        const searchTerm = query.toLowerCase().trim();

        // Systeme durchsuchen
        const results = this.data.systems.filter(system => {
            return (
                system.name.toLowerCase().includes(searchTerm) ||
                system.description.toLowerCase().includes(searchTerm) ||
                (system.tags && system.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                (system.group && system.group.toLowerCase().includes(searchTerm)) // Auch in Gruppen suchen
            );
        });

        // Ergebnisse anzeigen
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="alert alert-info">Keine Systeme gefunden.</div>';
        } else {
            let html = '';

            results.forEach(system => {
                html += `
                    <button class="list-group-item list-group-item-action" data-system-id="${system.id}">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${system.name}</h6>
                            <span class="badge bg-${this.getCategoryClass(system.category)}">${system.category}</span>
                        </div>
                        <small>${system.description}</small>
                        ${system.group ? `<br><small><span class="badge bg-info">Gruppe: ${system.group}</span></small>` : ''}
                    </button>
                `;
            });

            resultsContainer.innerHTML = html;

            // Event-Listener für Klicks auf Suchergebnisse
            const resultItems = resultsContainer.querySelectorAll('.list-group-item');
            resultItems.forEach(item => {
                item.addEventListener('click', () => {
                    const systemId = item.getAttribute('data-system-id');
                    const system = this.data.systems.find(s => s.id === systemId);

                    if (system) {
                        this.showSystemDetails(system);
                        document.getElementById('search-panel').classList.remove('active');
                    }
                });
            });
        }
    }

    // Methode zum Speichern des aktuellen Viewports
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

    // Methode zum Wiederherstellen des Viewports
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
     * Deaktiviert die Drag-Funktion für Knoten
     */
    disableDrag() {
        if (this.nodeElements) {
            this.nodeElements.on('.drag', null);
        }
        this.dragDisabled = true;
    }

    /**
     * Aktiviert die Drag-Funktion für Knoten wieder
     */
    enableDrag() {
        if (this.nodeElements && this.simulationManager) {
            this.nodeElements.call(this.simulationManager.createDragBehavior());
        }
        this.dragDisabled = false;
    }
}