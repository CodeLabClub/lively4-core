import Morph from 'src/components/widgets/lively-morph.js';
import { sortAlphaNum } from 'src/client/sort.js';
import babelDefault from 'systemjs-babel-build';
const { types: t } = babelDefault.babel;

export default class AstInspector extends Morph {
  
  async initialize() {
    this.windowTitle = "AST Inspector";
    this.registerButtons()

    lively.html.registerKeys(this);
  }
  
  get container() { return this.get("#container"); }
  
  inspect(obj) {
    if (!obj) return;
    
    if (this.targetObject) {
      var oldViewState = this.getViewState()
    }
    
    this.targetObject = obj;
    this.container.innerHTML = "";
    
    const content = this.display(obj, true, null);
    this.container.appendChild(content);
    this.updatePatterns(this.container.childNodes[0])
    
    if (oldViewState) {
      this.setViewState(oldViewState)
    }
    return content;
  }

/*MD # Configuration MD*/
  
  get configuration() {
    return this.configuration || lively.preferences.get("AstInspectorConfig");
  }
  
  get hidesLocationData() { return true; }
  get hidesTypeProperty() { return true; }
  get hidesDefaultProperties() { return true; }
  get hidesOptionalProperties() { return false; }
  get hidesUnknownProperties() { return true; }
  get hidesFunctions() { return true; }
  get hidesProto() { return true; }

/*MD # Displaying MD*/

  getElementType(obj) {
    if (obj == null) return "Value";
    if (t.isNode(obj)) return "AstNode";
    if (Array.isArray(obj)) return "Array";
    if (typeof obj === "object" || typeof obj === "function") return "Object";
    return "Value";
  }

  getRenderCall(type) {
    return `render${type}`;
  }
  
  display(obj, expanded, key, options = {}) {
    const element = this.elementTemplate();
    element.key = key;
    element.options = options;
    element.pattern = `NAME ${key || ''}`;
    element.target = obj;
    element.type = this.getElementType(obj);
    element.renderCall = this.getRenderCall(element.type);
    this.render(element, expanded);
    return element;
  }
    
/*MD # Rendering MD*/

  render(element, expanded) {
    element.innerHTML = '';
    element.isExpanded = expanded;
    this[element.renderCall || "renderValue"](element);
  }

  renderAstNode(element) {
    const target = element.target;
    element.append(this.expansionIndicatorTemplate(element.isExpanded));
    element.append(this.keyTemplate(element));
    element.append(this.labelTemplate(target.type));
    this.attachHandlers(element);
    if (element.isExpanded) {
      const content = this.contentTemplate();
      const classifications = this.astNodeKeyClassifications(target);
      console.log(classifications);
      for (const key in classifications) {
        const classification = classifications[key];
        if (this.isVisibleAstNodeKey(classification)) {
          content.append(this.display(target[key], false, key, { classification }))
        }
      }
      element.append(content);
    }
  }
  
  renderObject(element) {
    const target = element.target;
    element.append(this.expansionIndicatorTemplate(element.isExpanded));
    element.append(this.keyTemplate(element));
    if (!element.isExpanded) {
      element.append(
        <span class="syntax">&#123;</span>,
        this.summaryTemplate(this.objectPreview(target)),
        <span class="syntax">&#125;</span>,
      );
    }
    this.attachHandlers(element);
    if (element.isExpanded) {
      const content = this.contentTemplate();
      this.allKeys(target).forEach(key => {
        content.append(this.display(target[key], false, key))
      });
      element.append(content);
    }
  }

  renderArray(element) {
    if (!element.target.length) return this.renderValue(element);
    element.append(this.expansionIndicatorTemplate(element.isExpanded));
    element.append(this.keyTemplate(element));
    if (!element.isExpanded) {
      element.append(this.summaryTemplate(`[${element.target.length} elements]`));
    }
    this.attachHandlers(element);
    if (element.isExpanded) {
      const content = this.contentTemplate();
      for (const [key, value] of element.target.entries()) {
        content.append(this.display(value, false, key));
      }
      element.append(content);
    }
  }

  renderValue(element) {
    const json = JSON.stringify(element.target);
    element.appendChild(this.expansionIndicatorTemplate("\u2002"));
    element.append(this.keyTemplate(element));
    element.appendChild(<span class='attrValue'>{json}</span>);
  }
  
  isLocationKey(str) {
    return str === "loc"
            || str === "start"
            || str === "end";
  }

  isTypeKey(str) {
    return str == "type";
  }

  isVisibleAstNodeKey(classification) {
    if (classification.has("location")) return !this.hidesLocationData;
    if (classification.has("type")) return !this.hidesTypeProperty;
    if (classification.has("unknown")) return !this.hidesUnknownProperties;
    if (classification.has("function") && this.hidesFunctions) return false;
    if (classification.has("default") && this.hidesDefaultProperties) return false;
    if (classification.has("optional") && this.hidesOptionalProperties) return false;
    return true;
  }

  astNodeKeyClassifications(node) {
    const classifications = {};
    const allKeys = this.allKeys(node);
    
    const fields = t.NODE_FIELDS[node.type];
    const visitorKeys = t.VISITOR_KEYS[node.type];
    allKeys.forEach(key => {
      classifications[key] = new Set();
      if (this.isLocationKey(key)) return classifications[key].add("location");
      if (this.isTypeKey(key)) return classifications[key].add("type");
      const value = node[key];
      if (typeof value === "function") classifications[key].add("function");
      if (visitorKeys && visitorKeys.includes(key)) classifications[key].add("visited");
      
      const field = fields && fields[key];
      if (field) {
        if (field.optional) classifications[key].add("optional");
        if (field.default === value) classifications[key].add("default");
        return;
      }

      classifications[key].add("unknown");
    });
    return classifications;
  }
  
  objectPreview(obj) {
    const trimLen = 30;
    const keys = this.allKeys(obj);
    let str = '';
    let i = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i) str += ', ';
      if (str.length > trimLen) {
        const remaining = keys.length - i;
        const replacement = `... +${remaining}`;
        if (remaining == 1 && key.length < replacement.length) {
          str += key;
        } else {
          str += replacement;
        }
        break;
      }
      str += key;
    }
    return str;
  }
  
  allKeys(obj) {
    if (!(typeof obj === 'object')) return [];
    const keys = Object.getOwnPropertyNames(obj);
    return keys.sort(sortAlphaNum);
  }
  
  expansionIndicatorTemplate(kind) {
    let symbol;
    if (kind === true) {
      symbol = "\u25bc";
    } else if (kind === false) {
      symbol = "\u25b6";
    } else {
      symbol = kind;
    }

    return <span class='syntax'>
      <a class='expand'>
        <span style='font-size:9pt'>{symbol}</span>
      </a>
    </span>;
  }

  elementTemplate() {
    return <div class="element"></div>;
  }
  
  labelTemplate(content) {
    return <a id='tagname' class='tagname expand'>
        {content}
      </a>
  }

  keyTemplate(element) {
    const key = element.key;
    if (key == null) return <span></span>;
    const classification = element.options.classification;
    let cssClass = 'attrName expand';
    if (classification) {
      if (classification.has("visited")) cssClass += " visited";
    }
    return <span class={cssClass}>
      {key}
      <span class="syntax">:</span> 
    </span>;
  }

  contentTemplate() {
    return <span id='content'></span>;
  }

  summaryTemplate(content) {
    return <span class='expand more'>
        {content}
      </span>
  }
  
/*MD # Handlers MD*/
  
  attachHandlers(element) {
    element.querySelectorAll(".expand").forEach(expandNode => {
      expandNode.onclick = evt => {
        this.render(element, !element.isExpanded);
      }
    });
  }
  
  /*
   * called, when selecting a subobject 
   */
  onSelect(element) {
    const obj = element.target;
    if (this.selectedNode) {
      this.selectedNode.classList.remove("selected");
    }
    this.selectedNode = element;
    this.selectedNode.classList.add("selected");
  
    this.selection = obj;
    lively.showElement(obj);
    this.dispatchEvent(new CustomEvent("select-object", {detail: {node: element, object: obj}}));
  }
  
  onContextMenu(evt) {
    if (this.targetObject && !evt.shiftKey) {
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
  }

/*MD # View State MD*/
  
  setExpandStateForAllNodes(expandedness) {
    const root = this.container.childNodes[0];
    const recursion = (node, expandedness) => {
      node.isExpanded = expandedness;
      this.getChildren().forEach(child => recursion(child, expandedness))
    };
    
    recursion(root, expandedness);
    // Do we need to render?
  }
  
  getViewState() {
    return this.captureViewState(this.container.childNodes[0])
  }
  
  setViewState(state) {
    return this.applyViewState(this.container.childNodes[0], state)
  }
  
  applyViewState(node, state) {
    this.expandElement(node)
    
    const children = this.getChildren(node);
    children.filter(ea =>
        ea.classList.contains("element"));
      
    state.children.forEach( ea => {
      const child = children.find( c => c.pattern == ea.pattern)
      if (child) this.applyViewState(child, ea) 
      })
    }
  
  
  expandElement(element) {
    if (!element.isExpanded) this.render(element, true);
  }

  collapseElement(element) {
    if (element.isExpanded) this.render(element, false);
  }
  
  captureViewState(node) {
    const result = {
      pattern: node.pattern,
      children: [],
    }
    
    this.getChildren(node)
      .filter(ea => ea.isExpanded)
      .forEach(ea => {
          result.children.push(this.captureViewState(ea))        
        });
    return result;
  }
  
  updatePatterns(node) {
    if (!node.target) {
      node.pattern = "NOTARGET"
    }
   this.getChildren(node).forEach( ea => {
        this.updatePatterns(ea);
   })
  }
  
  
 /*MD # Utils MD*/
  
  getChildren(node){
    if (node.querySelector) {
      const content = node.querySelector("#content")
      if (content) {
        return content.childNodes
      }
    }
    return []
  }
  
/*MD # Lively Integration MD*/
  
  async livelyExample() {
    const url = lively4url + "/src/components/tools/lively-ast-inspector.js";
    const src = await fetch(url).then(r => r.text());
    const ast = src.toAST();
    this.inspect(ast.program);
  }
  
  async livelyMigrate(other) {
    this.inspect(other.targetObject);
    this.setViewState(other.getViewState());
  }
}