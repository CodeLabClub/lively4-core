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

/**
 * Creates a deep copy of arbitrary objects.
 * Does not copy functions!
 */
export const deepCopy = (obj) =>
  JSON.parse(JSON.stringify(obj));

/**
 * Generates a locationMap for the AST
 */
export const generateLocationMap = (ast) => {
  ast._locationMap = new DefaultDict(Object);

  traverse(ast, {
    enter(path) {
      let location = path.node.loc;
      // ReturnStatement is an exception
      // We want to only associate it with the "return" token
      if(path.isReturnStatement()) {
        location.end.line = location.start.line;
        location.end.column = location.start.column + "return".length;
      }
      ast._locationMap[LocationConverter.astToKey(location)] = path;
    }
  });
};

/**
 * Checks whether a path can be probed
 */
export const canBeProbed = (path) => {
  // TODO: More sophisticated check
  return path.isIdentifier() || path.isReturnStatement();
}

/**
 * Checks whether a path can be an example
 */
export const canBeExample = (path) => {
  // We have to be the name of a function
  const functionParent = path.getFunctionParent();
  return(functionParent
         && (functionParent.get("id") === path
             || functionParent.get("key") === path));
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
 * Generates a replacement node
 * (to be used as the righthand side of an assignment)
 */
export const replacementNodeForCode = (code) => {
  // The code we get here will be used as the righthand side of an Assignment
  // We we pretend that it is that while parsing
  code = `placeholder = ${code}`;
  try {
    const ast = astForCode(code);
    return ast.program.body[0].expression.right;
  } catch (e) {
    console.warn("Error parsing replacement node", e);
    return null;
  }
}

/**
 * Assigns IDs to add nodes of the AST
 */
export const assignIds = (ast) => {
  let idCounter = 1;
  traverse(ast, {
    enter(path) {
      path.node._id = idCounter++;
    }
  });
  return ast;
};

/**
 * Applies replace markers to the given AST
 */
export const applyReplaceMarkers = (ast, markers) => {
  // Apply the markers
  markers.forEach((marker) => {
    const replacementNode = marker.replacementNode;
    if(!replacementNode) {
      return;
    }
    const path = ast._locationMap[marker.loc];
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
export const applyProbeMarkers = (ast, markers) => {
  const trackedNodes = markers.map(marker => ast._locationMap[marker.loc].node);

  traverse(ast, {
    Identifier(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertIdentifierTracker(path);
    },
    ReturnStatement(path) {
      if(!trackedNodes.includes(path.node)) return;
      insertReturnTracker(path);
    },
    BlockStatement(path) {
      insertBlockTracker(path);
    }
  });
};

/**
 * Applies example markers to the given AST
 */
export const applyExampleMarkers = (ast, markers) => {
  // Prepare templates to insert
  const functionCall = template("ID.apply(null, PARAMS)");
  const methodCall = template("CLASS.ID.apply(null, PARAMS)");
  
  // Apply the markers
  markers.forEach((marker) => {
    let parametersNode = marker.replacementNode;
    if(!parametersNode) {
      parametersNode = types.nullLiteral();
    }
    const path = ast._locationMap[marker.loc];
    const functionParent = path.getFunctionParent()
    let nodeToInsert;
    
    // Distinguish between Methods and Functions
    if(functionParent.isClassMethod()) {
      const className = functionParent.getStatementParent().get("id").get("name").node;
      nodeToInsert = methodCall({
        CLASS: types.identifier(className),
        ID: types.identifier(path.node.name),
        PARAMS: parametersNode
      });
    } else {
      nodeToInsert = functionCall({
        ID: types.identifier(path.node.name),
        PARAMS: parametersNode
      });
    }
    
    // Insert a call at the end of the script
    if(nodeToInsert) {
      ast.program.body.push(nodeToInsert);
    }
  });
}

/**
 * Insers an appropriate tracker for the given identifier path
 */
const insertIdentifierTracker = (path) => {
  // Prepare Trackers
  const tracker = template("window.__tracker.id(ID, VALUE)")({
    ID: types.numericLiteral(path.node._id),
    VALUE: types.identifier(path.node.name)
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
    functionParentPath.get("body").unshiftContainer("body", tracker);
  } else if(statementParentPath.isReturnStatement()) {
    // We are in a return statement
    // Prepend the tracker to the return
    statementParentPath.insertBefore(tracker);
  } else if(statementParentPath.isBlockParent()) {
    // We are in a block
    // Insert into the block body
    const body = statementParentPath.get("body");
    if(body instanceof Array) {
      body.unshift(tracker);
    } else if (body.isBlockStatement()) {
      body.unshiftContainer("body", tracker);
    } else {
      body.replaceWith(
        types.blockStatement([
          body
        ])
      );
      body.unshiftContainer("body", tracker);
    }
  } else if(statementParentPath.isIfStatement()) {
    // We are in an if
    // We have to insert the tracker before the if
    statementParentPath.insertBefore(tracker);
  } else {
    statementParentPath.insertAfter(tracker);
  }
};

/**
 * Insers an appropriate tracker for the given return statement
 */
const insertReturnTracker = (path) => {
  const returnTracker = template("window.__tracker.id(ID, VALUE)")({
    ID: types.numericLiteral(path.node._id),
    VALUE: path.node.argument
  });
  path.get("argument").replaceWith(returnTracker);
}

/**
 * Inserts a tracker to check whether a block was entered
 */
const insertBlockTracker = (path) => {
  const tracker = template("window.__tracker.block(ID)")({
    ID: types.numericLiteral(path.node._id)
  });
  path.unshiftContainer("body", tracker);
};

/**
 * All the standard parameters for babylon
 */
const BABYLON_CONFIG = {
  babelrc: false,
  plugins: [],
  presets: [],
  filename: undefined,
  sourceFileName: undefined,
  moduleIds: false,
  sourceMaps: false,
  compact: false,
  comments: false,
  resolveModuleSource: undefined
};

/**
 * Parses code and returns the AST
 */
export const astForCode = (code) =>
  transform(code, Object.assign({}, BABYLON_CONFIG, {
    code: false,
    ast: true
  })).ast

/**
 * Generates executable code for a given AST
 */
export const codeForAst = (ast) =>
  transformFromAst(ast, Object.assign({}, BABYLON_CONFIG, {
    code: true,
    ast: false
  })).code;
