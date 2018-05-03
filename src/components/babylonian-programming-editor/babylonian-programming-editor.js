// System imports
import Morph from 'src/components/widgets/lively-morph.js';
import { babel } from 'systemjs-babel-build';
const { traverse } = babel;

// Custom imports
import ASTWorkerWrapper from "./worker/ast-worker-wrapper.js";
import Timer from "./utils/timer.js";
import LocationConverter from "./utils/location-converter.js";
import {
  makeAnnotation,
  addMarker
} from "./utils/ui.js";
import {
  generateLocationMap,
  canBeProbed,
  canBeExample
} from "./utils/ast.js";

// Constants
const COMPONENT_URL = "https://lively-kernel.org/lively4/lively4-babylonian-programming/src/components/babylonian-programming-editor";
const USER_MARKER_KINDS = ["example", "replace", "probe"];

/**
 * An editor for Babylonian (Example-Based) Programming
 */
export default class BabylonianProgrammingEditor extends Morph {
 
  initialize() {
    this.windowTitle = "Babylonian Programming Editor";
    
    // Set up the WebWorker for parsing
    this.worker = new ASTWorkerWrapper();
    
    // Set up AST
    this.ast = null;
    this.selectedPath = null;

    // Set up markers
    this.markers = {
      dead: []
    };
    USER_MARKER_KINDS.map(m => this.markers[m] = []);

    // Set up annotations
    this.annotations = [];
    
    // Set up timer
    this.evaluateTimer = new Timer(300, this.evaluate.bind(this));
    
    // Set up CodeMirror
    this.editorComp().addEventListener("editor-loaded", () => {
      // Test file
      this.get("#source").setURL(`${COMPONENT_URL}/demos/2_functions.js`);
      this.get("#source").loadFile();
      
      // Event listeners
      this.editor().on("change", this.evaluateTimer.start.bind(this.evaluateTimer));
      this.editor().on("beforeSelectionChange", this.selectionChanged.bind(this));
      this.editor().setOption("extraKeys", {
        "Ctrl-1": this.toggleProbe.bind(this),
        "Ctrl-2": this.toggleReplace.bind(this),
        "Ctrl-3": this.toggleExample.bind(this)
      });
      
      // Inject styling into CodeMirror
      // This is dirty, but currently necessary
      fetch(`${COMPONENT_URL}/codemirror-inject-styles.css`).then(result => {
        result.text().then(styles => {
          const node = document.createElement('style');
          node.innerHTML = styles;
          this.editorComp().shadowRoot.appendChild(node);
        });
      });
    });
  }
  
  
  // Event handlers
  
  /**
   * Is called whenever the user's selection in the editor changes
   */
  selectionChanged(instance, data) {
    // This needs an AST
    if(!this.hasWorkingAst()) {
      return;
    }
    
    // Get selected path
    const selectedLocation = LocationConverter.selectionToKey(data.ranges[0]);

    // Check if we selected a node
    if(selectedLocation in this.ast._locationMap) {
      this.selectedPath = this.ast._locationMap[selectedLocation];
    } else {
      this.selectedPath = null;
    }
  }
  
  /**
   * Toggles a probe at the selected location
   */
  toggleProbe() {
    this.toggleMarkerAtSelection((path, loc) => {
      if(!canBeProbed(path)) {
        return;
      }
      const marker = addMarker(this.editor(), loc, ["probe"]);
      this.markers.probe.push(marker);
    });
  }

  /**
   * Toggles a replacement at the selected location
   */
  toggleReplace() {
    this.toggleMarkerAtSelection((path, loc) => {
      const marker = addMarker(this.editor(), loc, ["replace"]);
      this.markers.replace.push(marker);
    });
  }
  
  /**
   * Toggles an example at the selected location
   */
  toggleExample() {
    this.toggleMarkerAtSelection((path, loc) => {
      if(!canBeExample(path)) {
        return;
      }
      const marker = addMarker(this.editor(), loc, ["example"]);
      this.markers.example.push(marker);
    });
  }
  
  
  // Evaluating and running code
  
  /**
   * Evaluates the current editor content and updates the results
   */
  async evaluate() {
    // Convert the markers' locations into key format
    const convertLocation = (m) => LocationConverter.markerToKey(m.find());
    
    const markers = {};
    for(const markerKey of USER_MARKER_KINDS) {
      // Remove invalid markers
      this.markers[markerKey].map((marker) => {
        if(!marker.find()) {
          this.removeMarker(marker);
        }
      })
      
      // Convert locations
      markers[markerKey] = this.markers[markerKey].map(convertLocation);
    }

    // Call the worker
    const { ast, code } = await this.worker.process(
      this.editor().getValue(),
      markers
    );
    if(!ast) {
      return;
    }
    console.log(code);

    this.ast = ast;

    // Post-process AST
    // (we can't do this in the worker because it create a cyclical structure)
    generateLocationMap(ast);

    // Execute the code
    this.execute(code);

    // Show the results
    this.showAnnotations();
    this.showDeadMarkers();
  }
  
  
  /**
   * Executes the given code
   */
  execute(code) {
    // Prepare result container
    window.__tracker = {
      // Properties
      ids: {},
      blocks: [],

      // Functions
      id: function(id, value) {
        if(!(id in this.ids)) {
          this.ids[id] = [];
        }
        this.ids[id].push([typeof(value), value]);
      },
      block: function(id) {
        this.blocks.push(id);
      }
    };

    // Execute the code
    try {
      eval(code);
    } catch (e) {
      console.warn("Could not execute code");
      console.error(e);
    }
  }
  
  
  // UI
  
  /**
   * Returns the marker-location of the currently selected path
   */
  getSelectedPathLocation() {
    if(!this.selectedPath) {
      return null;
    }

    return LocationConverter.astToMarker(this.selectedPath.node.loc);
  }
  
  /**
   * Removes a marker from the editor
   */
  removeMarker(marker) {
    marker.clear();
    USER_MARKER_KINDS.map(m => this.markers[m].splice(this.markers[m].indexOf(marker), 1));
  }
  
  /**
   * Removes an existing marker at the selected location,
   * or calls the callback to create a new one
   */
  toggleMarkerAtSelection(createMarkerCallback) {
    const loc = this.getSelectedPathLocation();
    if(!loc) {
      return;
    }

    const existingMarks = this.editor()
                              .findMarks(loc.from, loc.to)
                              .filter(m => m._babylonian);
    if(existingMarks.length > 0) {
      existingMarks.map(this.removeMarker.bind(this));
    } else {
      createMarkerCallback(this.selectedPath, loc);
    }
    this.evaluate();
  }
  
  showAnnotations() {
    // Remove all existing annotations
    this.annotations.map(e => e.clear());

    // Find probed nodes
    const probedNodes = this.markers.probe.map((mark) => {
      return this.ast._locationMap[LocationConverter.markerToKey(mark.find())].node;
    }).filter((node) => node);

    // Add new annotations for replacements
    this.markers.replace.map(mark => {
      let markLoc = mark.find();
      const annotation = makeAnnotation([["number", 24]], markLoc.from.ch, true);
      this.annotations.push(
        this.editor().addLineWidget(markLoc.to.line, annotation)
      );
    }).filter((node) => node);

    // Add new Annotations for probes
    const that = this;
    traverse(this.ast, {
      Identifier(path) {
        const node = path.node;
        if(probedNodes.indexOf(node) !== -1 && node._id in window.__tracker.ids) {
          const values = window.__tracker.ids[node._id];
          const annotation = makeAnnotation(values, node.loc.start.column);
          that.annotations.push(
            that.editor().addLineWidget(node.loc.end.line-1, annotation)
          );
        }
      }
    });
  }

  showDeadMarkers() {
    // Remove old dead markers
    this.markers.dead.map(m => m.clear());

    // Add new markers
    const that = this;
    traverse(this.ast, {
      BlockStatement(path) {
        if(!window.__tracker.blocks.includes(path.node._id)) {
          const markerLocation = LocationConverter.astToMarker(path.node.loc);
          that.markers.dead.push(
            that.editor().markText(
              markerLocation.from,
              markerLocation.to,
              {
                className: "marker dead"
              }
            )
          );
        }
      }
    });
  }
  
  /**
   * Checks whether we currently have a working AST
   */
  hasWorkingAst() {
    return (this.ast && this.ast._locationMap);
  }
  
  
  // UI Acessors
  
  editorComp() {
    return this.get("#source").get("lively-code-mirror");
  }
  
  editor() {
    return this.editorComp().editor
  }
  
}