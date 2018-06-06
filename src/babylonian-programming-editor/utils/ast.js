import { babel } from 'systemjs-babel-build';
const {
  traverse,
  template,
  types,
  transform,
  transformFromAst
} = babel;

import LocationConverter from "./location-converter.js";
import DefaultDict from "./default-dict.js";
import { defaultBabylonConfig } from "./defaults.js";

/**
 * Creates a deep copy of arbitrary objects.
 * Does not copy functions!
 */
export const deepCopy = (obj) => {
  try {
    if(obj instanceof HTMLElement) {
      return obj.cloneNode(true);
    } else {
      return JSON.parse(JSON.stringify(obj));
    }
  } catch(e) {
    console.warn("Could not deeply clone object", obj);
    return Object.assign({}, obj);
  }
}

/**
 * Generates a locationMap for the AST
 */
export const generateLocationMap = (ast, prefix = "(async () => { ") => {
  ast._locationMap = new DefaultDict(Object);
  
  const keywords = {
    "ForStatement": "for",
    "ForInStatement": "for",
    "ForOfStatement": "for",
    "WhileStatement": "while",
    "DoWhileStatement": "do",
    "ReturnStatement": "return"
  };
  
  traverse(ast, {
    enter(path) {
      let location = path.node.loc;
      if(!location) {
        return;
      }
      
      if(location.start.line === 1) {
        if(location.start.column === (prefix.length-2) && path.isBlockStatement()) {
          ast._realProgram = path.node;
          ast._realProgramPath = path;
        }
        if(location.start.column >= prefix.length) {
          location.start.column -= prefix.length;
        } else {
          return;
        }
      }
      
      if(location.end.line === 1) {
        if(location.end.column >= prefix.length) {
          location.end.column -= prefix.length;
        } else {
          return;
        }
      }
      
      // Some Nodes are only associated with their keywords
      const keyword = keywords[path.type];
      if(keyword) {
        location.end.line = location.start.line;
        location.end.column = location.start.column + keyword.length;
      }
      
      ast._locationMap[LocationConverter.astToKey(location)] = path;
    }
  });
};

/**
 * Checks whether a path can be probed
 */
export const canBeProbed = (path) => {
  const isTrackableIdentifier = (path.isIdentifier() || path.isThisExpression())
                                 && (!path.parentPath.isMemberExpression()
                                     || path.parentKey === "object")
                                 && (path.parentPath !== path.getFunctionParent());
  const isTrackableMemberExpression = path.isMemberExpression();
  const isTrackableReturnStatement = path.isReturnStatement();
  return isTrackableIdentifier
         || isTrackableMemberExpression
         || isTrackableReturnStatement;
}

/**
 * Checks whether a path can be a slider
 */
export const canBeSlider = (path) => {
  const isTrackableIdentifier = path.isIdentifier()
                                && path.parentPath === path.getFunctionParent();
  const isTrackableLoop = path.isLoop();
  return isTrackableIdentifier || isTrackableLoop;
}

/**
 * Checks whether a path can be an example
 */
export const canBeExample = (path) => {
  // We have to be the name of a function
  const functionParent = path.getFunctionParent();
  const isFunctionName = (functionParent
                          && (functionParent.get("id") === path
                              || functionParent.get("key") === path));
  return isFunctionName;
}

/**
 * Checks whether a path can be an instance
 */
export const canBeInstance  = (path) => {
  // We have to be the name of a class
  const isClassName = (path.parentPath.isClassDeclaration() && path.parentKey === "id");
  return isClassName;
}

/**
 * Checks whether a path can be replaced
 */
export const canBeReplaced = (path) => {
  // We have to be the righthand side of an assignment
  return ((path.parentPath.isVariableDeclarator() && path.parentKey === "init")
          || (path.parentPath.isAssignmentExpression() && path.parentKey === "right"));
}

/**
 * Assigns IDs to add nodes of the AST
 */
export const assignIds = (ast) => {
  traverse(ast, {
    enter(path) {
      path.node._id = nextId();
    }
  });
  return ast;
};
const assignId = (node) => {
  node._id = nextId();
  return node;
}
let ID_COUNTER = 1;
const nextId = () => ID_COUNTER++;


/**
 * Applies basic modifications to the given AST
 */
export const applyBasicModifications = (ast) => {
  const wrapPropertyOfPath = (path, property) => {
    const oldBody = path.get(property);
    const oldBodyNode = path.node[property];
    if(!oldBodyNode) {
      return;
    }
    if(oldBody.isBlockStatement && oldBody.isBlockStatement()) {
      // This is already a block
      return;
    } else if(oldBody instanceof Array) {
      const newBodyNode = prepForInsert(types.blockStatement(oldBodyNode));
      path.node[property] = [newBodyNode];
    } else {
      const newBodyNode = prepForInsert(types.blockStatement([oldBodyNode]));
      oldBody.replaceWith(newBodyNode);
    }
    return path;
  }
  
  // Prepare Tracker and enforce that all bodies are in BlockStatements
  traverse(ast, {
    BlockParent(path) {
      if(path.isProgram() || path.isBlockStatement() || path.isSwitchStatement()) {
        return;
      }
      if(!path.node.body) {
        console.warn("A BlockParent without body: ", path);
      }
      
      wrapPropertyOfPath(path, "body");
    },
    IfStatement(path) {
      for(let property of ["consequent", "alternate"]) {
        wrapPropertyOfPath(path, property);
      }
    },
    SwitchCase(path) {
      wrapPropertyOfPath(path, "consequent");
    }
  });
}

export const applyTracker = (ast) => {
  ast._realProgram.body.unshift(template("const __connections = this.connections;")());
  ast._realProgram.body.unshift(template("const __tracker = this.tracker;")());
  return ast;
}

export const applyContext = (ast, context) => {
  const prescriptNodes = astForCode(context.prescript).program.body;
  const postscriptNodes = astForCode(context.postscript).program.body;
  ast._realProgram.body = prescriptNodes.concat(ast._realProgram.body).concat(postscriptNodes);
  return ast;
}

/**
 * Applies replacement markers to the given AST
 */
export const applyReplacements = (ast, replacements) => {
  replacements.forEach((replacement) => {
    const replacementNode = replacementNodeForValue(replacement.value);
    if(!replacementNode) {
      return;
    }
    const path = ast._locationMap[replacement.location];
    if(path.parentPath.isVariableDeclarator()) {
      path.parent.init = replacementNode;
    } else {
      path.replaceWith(replacementNode);
    }
  });
};

/**
 * Applies probe markers to the given AST
 */
export const applyProbes = (ast, annotations) => {
  const trackedNodes = annotations.map((a) => ast._locationMap[a.location].node);
  
  traverse(ast, {
    Identifier(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertIdentifierTracker(path);
    },
    MemberExpression(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertIdentifierTracker(path);
    },
    ThisExpression(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertIdentifierTracker(path);
    },
    ReturnStatement(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertReturnTracker(path);
    },
    BlockStatement(path) {
      insertBlockTracker(path);
      insertTimer(path, path.node._id === ast._realProgram._id);
    }
  });
};

/**
 * Generates instances for the given AST
 */
export const generateInstances = (ast, instances) => {
  const exampleInstances = {
    "0": types.nullLiteral()
  };
  
  const constructorCall = template("new CLASS(PARAMS)");
  
  instances.forEach((instance) => {
    const path = ast._locationMap[instance.location];
    const className = path.node.name;
    
    let instanceNode = constructorCall({
      CLASS: types.identifier(className),
      PARAMS: instance.values.map(replacementNodeForValue)
    });
    
    if(!instanceNode) {
      instanceNode = types.nullLiteral();
    }
    
    exampleInstances[instance.id] = instanceNode;
  });
  return exampleInstances;
}

/**
 * Applies example markers to the given AST
 */
export const applyExamples = (ast, examples, exampleInstances) => {
  // Prepare templates to insert
  const functionCall = template("ID.apply(this, PARAMS)");
  const staticMethodCall = template("CLASS.ID.apply(this, PARAMS)");
  const objectMethodCall = template("CLASS.prototype.ID.apply(this, PARAMS)");
  
  const makeInstanceNode = (instanceId) => {
    if(instanceId.isConnection) {
      return replacementNodeForCode(connectorTemplate(instanceId.value));
    } else {
      return exampleInstances[instanceId.value];
    }
  };
  
  // Apply the markers
  examples.forEach((example) => {
    const path = ast._locationMap[example.location];
    let instanceNode = makeInstanceNode(example.instanceId);
    let parametersValuesNode = types.arrayExpression(
      example.values.map(replacementNodeForValue)
    );
    let parametersNames = parameterNamesForFunctionIdentifier(path);
    let parametersNamessNode = types.arrayExpression(
      parametersNames.map((s) => types.identifier(s))
    );
    
    if(!parametersValuesNode) {
      parametersValuesNode = types.nullLiteral();
    }
    
    const functionParent = path.getFunctionParent()
    let exampleCallNode;
    
    // Distinguish between Methods and Functions
    if(functionParent.isClassMethod()) {
      // We have a method
      const classIdNode = functionParent.findParent(p => p.type === "ClassDeclaration").get("id").node;
      
      // Distinguish between static and object methods
      if(functionParent.node.static) {
        exampleCallNode = staticMethodCall({
          CLASS: types.identifier(classIdNode.name),
          ID: types.identifier(path.node.name),
          PARAMS: parametersNamessNode
        });
      } else {
        // Get the example instance
        exampleCallNode = objectMethodCall({
          CLASS: types.identifier(classIdNode.name),
          ID: types.identifier(path.node.name),
          PARAMS: parametersNamessNode
        });
      }
    } else {
      exampleCallNode = functionCall({
        ID: types.identifier(path.node.name),
        PARAMS: parametersNamessNode
      });
    }
    
    // Insert a call at the end of the script
    if(exampleCallNode) {
      ast._realProgram.body.push(
        template(`
          try {
            __tracker.exampleId = "${example.id}";
            const example = function(${parametersNames.join(", ")}) {
              ${example.prescript};
              EXAMPLECALL;
              ${example.postscript};
            };
            example.apply(INSTANCE, PARAMS);
          } catch(e) {
            __tracker.error(e.message);
          }`)({
          EXAMPLECALL: exampleCallNode,
          INSTANCE: instanceNode,
          PARAMS: parametersValuesNode
        })
      );
    }
  });
}

/**
 * Insers an appropriate tracker for the given identifier path
 */
const insertIdentifierTracker = (path) => {
  // Prepare Trackers
  const trackerTemplate = template("__tracker.id(ID, __tracker.exampleId, __blockCount, VALUE, NAME, KEYWORD)");
  const trackerBuilder = (keyword = "after") => trackerTemplate({
    ID:      types.numericLiteral(path.node._id),
    VALUE:   deepCopy(path.node),
    NAME:    types.stringLiteral(stringForPath(path)),
    KEYWORD: types.stringLiteral(keyword),
  });

  // Find the closest parent statement
  let statementParentPath = path.getStatementParent();

  // We have to insert the tracker at different positions depending on
  // the context of the tracked Identifier
  // TODO: Handle switch
  if(path.parentKey === "params") {
    // We are in a parameter list
    // Prepend tracker to body of function
    const functionParentPath = path.getFunctionParent();
    functionParentPath.get("body").unshiftContainer("body", trackerBuilder());
  } else if(statementParentPath.isReturnStatement()) {
    // We are in a return statement
    // Prepend the tracker to the return
    statementParentPath.insertBefore(trackerBuilder());
  } else if(statementParentPath.isBlockParent()) {
    // We are in a block
    // Insert into the block body
    const body = statementParentPath.get("body");
    if(body instanceof Array) {
      body.unshift(trackerBuilder());
    } else if (body.isBlockStatement()) {
      body.unshiftContainer("body", trackerBuilder());
    } else {
      body.replaceWith(
        types.blockStatement([
          body
        ])
      );
      body.unshiftContainer("body", trackerBuilder());
    }
  } else if(statementParentPath.isIfStatement()) {
    // We are in an if
    // We have to insert the tracker before the if
    statementParentPath.insertBefore(trackerBuilder());
  } else if(path.parentPath.isVariableDeclarator()
            && path.parentKey === "id") {
    // Declaration - only track value after
    statementParentPath.insertAfter(trackerBuilder());
  } else {
    // Normal statement - track value before and after
    statementParentPath.insertBefore(trackerBuilder("before"));
    statementParentPath.insertAfter(trackerBuilder("after"));
  }
};

/**
 * Insers an appropriate tracker for the given return statement
 */
const insertReturnTracker = (path) => {
  const returnTracker = template("__tracker.id(ID, __tracker.exampleId, __blockCount, VALUE, NAME)")({
    ID: types.numericLiteral(path.node._id),
    VALUE: path.node.argument,
    NAME: types.stringLiteral("return")
  });
  path.get("argument").replaceWith(returnTracker);
}

/**
 * Inserts a tracker to check whether a block was entered
 */
const insertBlockTracker = (path) => {
  if(typeof path.node._id === "undefined") {
    return;
  }
  const blockId = template("const __blockId = ID")({
    ID: types.numericLiteral(path.node._id)
  });
  const tracker = template("const __blockCount = __tracker.block(__blockId)")();
  path.unshiftContainer("body", tracker);
  path.unshiftContainer("body", blockId);
};


/**
 * Inserts a timer check
 */
const insertTimer = (path, isStart = false) => {
  if(typeof path.node._id === "undefined") {
    return;
  }
  let node = template("__tracker.timer.start();")();
  if(!isStart) {
    node = types.expressionStatement(
      astForCode("async() => await __tracker.timer.check();").program.body[0].expression.body
    );
  }
  path.unshiftContainer("body", node);
};

/**
 * Returns a list of parameter names for the given function Identifier
 */
export const parameterNamesForFunctionIdentifier = (path) => {
  let parameterPaths = path.getFunctionParent().get("params");
  return parameterPaths.map(parameterPath => {
    if(parameterPath.isIdentifier()) {
      return parameterPath.node.name;
    } else if(parameterPath.isAssignmentPattern()) {
      return parameterPath.node.left.name;
    }
    return null;
  }).filter(name => !!name);
}

/**
 * Returns a list of parameter names for the constructor of given class Identifier
 */
export const constructorParameterNamesForClassIdentifier = (path) => {
  const functions = path.parentPath.get("body").get("body");
  for(let f of functions) {
    let idPath = f.get("key");
    if(idPath.node.name === "constructor") {
      return parameterNamesForFunctionIdentifier(idPath);
    }
  }
  return [];
}

/**
 * Generates a replacement node
 * (to be used as the righthand side of an assignment)
 */
export const replacementNodeForCode = (code) => {
  // The code we get here will be used as the righthand side of an Assignment
  // We we pretend that it is that while parsing
  
  if(!code || !code.length) {
    return types.nullLiteral();
  }
  
  code = `placeholder = ${code}`;
  try {
    const ast = astForCode(code);
    return ast.program.body[0].expression.right;
  } catch (e) {
    console.error("Error parsing replacement node", e);
    return null;
  }
}

const replacementNodeForValue = (value) => 
  replacementNodeForCode(value.isConnection ?
                         connectorTemplate(value.value) :
                         value.value);

const wrapPrePostScript = (name, args, code) => {
  code = `const ${name} = function(${args.join(", ")}) { ${code} };`;
  try {
    const ast = astForCode(code);
    return ast.program.body[0];
  } catch (e) {
    console.error("Error parsing replacement node", e);
    return null;
  }
}

/**
 * Parses code and returns the AST
 */
export const astForCode = (code) =>
  transform(code, Object.assign({}, defaultBabylonConfig(), {
    code: false,
    ast: true
  })).ast

/**
 * Generates executable code for a given AST
 */
export const codeForAst = (ast) =>
  transformFromAst(ast, Object.assign({}, defaultBabylonConfig(), {
    code: true,
    ast: false
  })).code;


const stringForPath = (path) => {
  if(path.isIdentifier()) {
    return path.node.name;
  } else if(path.isThisExpression()) {
    return "this";
  } else if(path.isMemberExpression()) {
    return `${stringForPath(path.get("object"))}.${stringForPath(path.get("property"))}`;
  } else {
    return "";
  }
}

export const bodyForPath = (path) => {
  if(path.node.body) {
    return path.get("body");
  } else if(path.parentPath.node.body) {
    return path.parentPath.get("body");
  }
  return null;
}

const assignLocationToBlockStatement = (node) => {
  if(node.body.length) {
    node.loc = {
      start: node.body[0].loc.start,
      end: node.body[node.body.length - 1].loc.end
    }
  } else {
    node.loc = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 0 }
    };
  }
  return node;
}

const prepForInsert = (node) => {
  assignId(node);
  if(node.type === "BlockStatement") {
    assignLocationToBlockStatement(node);
  }
  return node;
}

const connectorTemplate = (id) => {
  return `__connections["${id}"]`;
}

