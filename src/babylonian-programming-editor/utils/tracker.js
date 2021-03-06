import { defaultExample } from "./defaults.js";
import { deepCopy } from "./utils.js";
import { DefaultMap } from "./collections.js";

export default class Tracker {
  
  constructor() {
    this.ids = new DefaultMap( // Map(id, Map(exampleId, Map(runId, {before, after: {type, value, name}]})) 
      DefaultMap.builder(
        DefaultMap.builder(Object)
      )
    );
    this.idIterationParents = new DefaultMap(0); // Map(id, iterationId); 
    this.iterations = new DefaultMap( // Map(id, Map(exampleId, iterationCounter))
      DefaultMap.builder(0)
    );
    this.errors = new Map(); // Map(exampleId, errorMsg);
    this.executedBlocks = new Set(); // Set(id)
    this.exampleId = defaultExample().id;
    this.exampleIds = new Set();
    this.exampleIds.add(this.exampleId);
    this.timer = new Timer();
    this._identities = new Map(); // Map(identity, symbol)
    this._symbolProvider = new IdentitySymbolProvider();
  }
  
  reset() {
    this.ids.clear();
    this.idIterationParents.clear();
    this.iterations.clear();
    this.errors.clear();
    this.executedBlocks.clear();
    this.exampleId = defaultExample().id;
    this.exampleIds.clear();
    this.exampleIds.add(this.exampleId);
    this._identities.clear();
    this._symbolProvider.reset();
  }

  id(id, exampleId, iterationParentId, runId, value, name, keyword = "after") {
    if(!["before", "after"].includes(keyword)) {
      return value;
    }
    this.idIterationParents.set(id, iterationParentId);
   
    // Check and assign object identity
    if(value instanceof Object) {
      if(this._identities.has(value)) {
        value.__tracker_identity = this._identities.get(value);
      } else {
        value.__tracker_identity = this._symbolProvider.next();
        this._identities.set(value, value.__tracker_identity);
      }
    }
    
   
    // Check and store object type
    let type = typeof(value);
    if(value && value.constructor && value.constructor.name) {
      type = value.constructor.name;
    }
    
    // Copy the value
    if(value instanceof CanvasRenderingContext2D) {
      value = value.getImageData(0, 0, value.canvas.width, value.canvas.height);
    } else {
      value = deepCopy(value);
    }
   
    this.ids.get(id)
            .get(exampleId)
            .get(runId)[keyword] = {
              type: type,
              value: value,
              name: name
            };
    
    return value;
  }
  
  block(id) {
    this.executedBlocks.add(id);
  }
  
  iteration(id) {
    const iterationMap = this.iterations.get(id);
    const iterationCount = iterationMap.get(this.exampleId);
    iterationMap.set(this.exampleId, iterationCount + 1);
    return iterationCount;
  }
  
  error(errorMsg) {
    this.errors.set(this.exampleId, errorMsg);
  }
  
  example(exampleId) {
    this.exampleId = exampleId;
    this.exampleIds.add(this.exampleId);
  }
}


class IdentitySymbolProvider {
  constructor() {
    this._identitySymbols =  ['🐶','🐺','🐱','🐭','🐹','🐰','🐸','🐯','🐨','🐻','🐷','🐽','🐮','🐗','🐵','🐒','🐴','🐑','🐘','🐼','🐧','🐦','🐤','🐥','🐣','🐔','🐍','🐢','🐛','🐝','🐜','🐞','🐌','🐙','🐚','🐠','🐟','🐬','🐳','🐋','🐄','🐏','🐀','🐃','🐅','🐇','🐉','🐎','🐐','🐓','🐕','🐖','🐁','🐂','🐲','🐡','🐊'];
    this._index = 0;
  }
  
  next() {
    return this._identitySymbols[this._index++ % this._identitySymbols.length];
  }
  
  reset() {
    this._index = 0;
  }
}


class Timer {
  constructor() {
    this._maxRuntime = 1000;
    this._startTime = null;
  }
  
  start() {
    this._startTime = (+new Date());
  }
  
  reset() {
    this._startTime = null;
  }
  
  check() {
    if(this._startTime === null) {
      return;
    }
    
    const time = (+new Date());
    if(time - this._startTime > this._maxRuntime) {
      throw new Error("Timeout reached. Maybe there is an inifinite loop?");
    }
  }
}
