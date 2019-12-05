import { loc, range } from 'utils';

import ContextMenu from 'src/client/contextmenu.js';
import FileIndex from "src/client/fileindex.js";

import babelDefault from 'systemjs-babel-build';
const babel = babelDefault.babel;

const t = babel.types;
const template = babel.template;

export default class ASTCapabilities {

  constructor(livelyCodeMirror, codeMirror) {
    this.livelyCodeMirror = livelyCodeMirror;
    this.codeMirror = codeMirror;
  }
  get editor() {
    return this.codeMirror;
  }
  get selectionRanges() {
    if (this.editor.listSelections().length == 0) {
      return this.firstSelection;
    }
    return this.editor.listSelections().map(range);
  }

  get firstSelection() {
    return range(this._getFirstSelectionOrCursorPosition());
  }

  _getFirstSelectionOrCursorPosition() {
    if (this.editor.listSelections().length == 0) {
      return { anchor: this.editor.getCursor(), head: this.editor.getCursor() };
    }
    return this.editor.listSelections()[0];
  }

  /*MD ## Navigation MD*/
  /**
   * Get the root path
  */
  get programPath() {
    let programPath;
    this.sourceCode.traverseAsAST({
      Program(path) {
        programPath = path;
      }
    });
    return programPath;
  }

  /** 
   * Return first child in depth first search that satisfies a condition
   */
  nextPath(startingPath, isValid) {
    let pathToShow;

    startingPath.traverse({
      enter(path) {
        if (!pathToShow && isValid(path)) {
          pathToShow = path;
          path.stop();
        }
      }
    });

    return pathToShow;
  }

  /**
   * Return the last valid path that is generated by a given callback function on the previous path
   */
  getLastPath(startingPath, nextPathCallback) {
    let pathToShow = startingPath;
    while (true) {
      let nextPath = nextPathCallback(pathToShow);
      if (nextPath) {
        pathToShow = nextPath;
      } else {
        break;
      }
    }

    return pathToShow;
  }

  /**
   * Returns the first child of a node or the node itself, if it has no children
   */
  getFirstChildOrSelf(startingPath) {
    let child;
    startingPath.traverse({
      enter(path) {
        if (!child) {
          child = path;
        }
      }
    });
    return child || startingPath;
  }

  /**
  * Returns the nearest path before the cursor location
  */
  getPathBeforeCursor(startingPath, anchor) {
    const selectionStart = loc(anchor);
    let foundPath;
    startingPath.traverse({
      exit(path) {
        const pathLocation = path.node.loc;
        const pathEnd = loc(pathLocation.end);
        if (selectionStart.isBefore(pathEnd)) {
          path.stop();
          return;
        }
        foundPath = path;
      }
    });
    return foundPath;
  }

  /**
   * Returns the innermost node, that contains the selected text.
   */
  getInnermostPathContainingSelection(startingPath, selection) {
    // go down to minimal selected node
    const nextPathContainingCursor = (newStartingPath, selection) => {
      return this.nextPath(newStartingPath, path => {
        return range(path.node.loc).containsRange(selection);
      });
    };
    return this.getLastPath(startingPath, prevPath => nextPathContainingCursor(prevPath, selection));
  }

  getSelectedPaths(programPath) {
    return this.selectionRanges.map(selection => {
      const pathContainingWholeSelection = this.getInnermostPathContainingSelection(programPath, selection);

      //path already matches the selection
      if (this.isPathExactlySelected(pathContainingWholeSelection, selection)) {
        return pathContainingWholeSelection;
      }

      //find children that match the selection
      let selectedPaths = [];
      pathContainingWholeSelection.traverse({
        enter(path) {
          if (selection.containsPartsOfRange(range(path.node.loc))) {
            selectedPaths.push(path);
          }
          path.skip();
        }
      });
      return selectedPaths;
    }).flat();
  }

  getSelectedStatements(programPath) {
    return this.selectionRanges.map(selection => {
      //Replace with get surrounding statement?
      const pathContainingWholeSelection = this.getOutermostPathContainingSelectionWithMinimalSelectionRange(programPath, selection);

      if (t.isStatement(pathContainingWholeSelection) && !t.isBlockStatement(pathContainingWholeSelection)) {
        return pathContainingWholeSelection;
      }

      //find children that match the selection
      let selectedPaths = [];
      pathContainingWholeSelection.traverse({
        Statement(path) {
          if (selection.containsPartsOfRange(range(path.node.loc))) {
            selectedPaths.push(path);
          }
          path.skip();
        }
      });
      return selectedPaths;
    }).flat();
  }

  getSelectedExpressions(programPath) {
    return this.selectionRanges.map(selection => {
      //Replace with get surrounding statement?
      const pathContainingWholeSelection = this.getOutermostPathContainingSelectionWithMinimalSelectionRange(programPath, selection);

      if (t.isExpression(pathContainingWholeSelection) && !t.isIdentifier(pathContainingWholeSelection)) {
        return pathContainingWholeSelection;
      }
      //find children that match the selection
      let selectedPaths = [];
      pathContainingWholeSelection.traverse({
        Expression(path) {
          if (selection.containsPartsOfRange(range(path.node.loc)) && !t.isIdentifier(path)) {
            selectedPaths.push(path);
          }
          path.skip();
        }
      });
      return selectedPaths;
    }).flat();
  }

  /** 
   * Takes the outermost node whose corresponding selection range is minimal for containing the selected text.
   * a      foo = bar
   * --b    foo
   *   --c  foo
   * 
   * In this example, when 'foo' is selected, b will be returned, since it is the outermost node that contains the
   * entire selection, but nothing more.
   */
  getOutermostPathContainingSelectionWithMinimalSelectionRange(startingPath, selection) {
    var currentPath = this.getInnermostPathContainingSelection(startingPath, selection);
    currentPath.findParent(path => {
      if (selection.isEqual(range(path.node.loc))) {
        currentPath = path;
      }
      return false;
    });
    return currentPath;
  }

  /**
   * Array of all children in depth first search order
   */
  forwardList(parentPath) {
    const linearizedPathList = [];
    parentPath.traverse({
      exit(path) {
        linearizedPathList.push(path);
      }
    });
    return linearizedPathList;
  }
  /**
   * Array of all children in reversed depth first search order
   */
  backwardList(parentPath) {
    const linearizedPathList = [];
    parentPath.traverse({
      enter(path) {
        linearizedPathList.push(path);
      }
    });
    return linearizedPathList.reverse();
  }
  /**
   * select the selection range of the next ast node after the current selection that satisfies a given condition
   * select previous selection instead of next, if reversed is set to true
   */
  selectNextASTNodeWith(condition, reversed) {
    const programPath = this.programPath;
    const pathList = reversed ? this.backwardList(programPath) : this.forwardList(programPath);

    const maxPaths = this.selectionRanges.map(selection => {

      const currentPath = this.getOutermostPathContainingSelectionWithMinimalSelectionRange(programPath, selection);

      // do we fully select the current path?
      if (selection.isEqual(range(currentPath.node.loc))) {
        return this.getNextASTNodeInListWith(condition, pathList, currentPath);
      } else {
        return currentPath;
      }
    });

    this.selectPaths(maxPaths);
  }

  getFirstSelectedIdentifier(startPath) {
    if (t.isIdentifier(startPath.node)) {
      return startPath;
    }
    var first;
    startPath.traverse({
      Identifier(path) {
        if (!first) {
          first = path;
          path.stop();
        }
      }
    });
    return first;
  }

  getFirstSelectedIdentifierWithName(startPath, name) {
    if (t.isIdentifier(startPath.node, { name: name })) {
      return startPath;
    }
    var first;
    startPath.traverse({
      Identifier(path) {
        if (!first && t.isIdentifier(path.node, { name: name })) {
          first = path;
          path.stop();
        }
      }
    });
    return first;
  }

  getAllIdentifiers(startPath) {
    var identifiers = [];
    /*if (startPath.node.type == "Identifier") {
      identifiers.push(startPath);
    }*/
    startPath.traverse({
      Identifier(path) {
        identifiers.push(path);
      }
    });
    return identifiers;
  }

  getDeclaration(identifier) {
    if (identifier.scope.hasBinding(identifier.node.name)) {
      return identifier.scope.getBinding(identifier.node.name).path;
    }
  }

  getBindingDeclarationIdentifierPath(binding) {
    return this.getFirstSelectedIdentifierWithName(binding.path, binding.identifier.name);
  }

  getBindings(startPath) {
    var identifier = this.getFirstSelectedIdentifier(startPath);
    if (identifier && identifier.scope.hasBinding(identifier.node.name)) {
      const binding = identifier.scope.getBinding(identifier.node.name);
      return [...new Set([this.getBindingDeclarationIdentifierPath(binding), ...binding.referencePaths, ...binding.constantViolations.map(cv => this.getFirstSelectedIdentifierWithName(cv, binding.identifier.name))])];
    }
  }

  getNextASTNodeInListWith(condition, pathList, path) {
    const currentPathInList = pathList.find(pathInList => pathInList.node === path.node);
    const currentIndex = pathList.indexOf(currentPathInList);
    for (var i = currentIndex + 1; i < pathList.length; i++) {
      if (condition(path, pathList[i])) {
        return pathList[i];
      }
    }
    return pathList[pathList.length - 1];
  }

  /** 
   * Select the text corresponding to the given nodes in the editor
   */
  selectNodes(nodes) {
    const ranges = nodes.map(node => {
      const [anchor, head] = range(node.loc).asCM();
      return { anchor, head };
    });
    // #TODO: include primary selection
    if (ranges.length == 1) {
      this.editor.setSelection(ranges[0].head, ranges[0].anchor);
    } else {
      this.editor.setSelections(ranges);
    }
  }

  /** 
   * Select the text corresponding to the given paths in the editor
   */
  selectPaths(paths) {
    this.selectNodes(paths.map(path => path.node));
  }

  /** 
   * Get the path for the first method with the given name
   */
  getMethodPath(programPath, name) {
    let methodPath;
    programPath.traverse({
      ClassMethod(path) {
        if (!methodPath && path.node.key.name == name) {
          methodPath = path;
        }
      },
      FunctionDeclaration(path) {
        if (!methodPath && path.node.id.name == name) {
          methodPath = path;
        }
      }
    });
    return methodPath;
  }

  /** 
   * Get the path of the first file
   */
  getClassPath(programPath) {
    let classPath;
    programPath.traverse({
      ClassDeclaration(path) {
        if (!classPath) {
          classPath = path;
        }
      }
    });
    return classPath;
  }

  /*MD ### Shortcuts MD*/

  expandSelection() {
    const maxPaths = this.selectionRanges.map(selection => {
      const pathToShow = this.getInnermostPathContainingSelection(this.programPath, selection);

      // go up again
      return pathToShow.find(path => {
        return range(path.node.loc).strictlyContainsRange(selection);
      }) || pathToShow;
    });

    this.selectPaths(maxPaths);
  }

  reduceSelection() {
    const maxPaths = this.selectionRanges.map(selection => {
      const pathToShow = this.getInnermostPathContainingSelection(this.programPath, selection);

      return this.getFirstChildOrSelf(pathToShow);
    });

    this.selectPaths(maxPaths);
  }

  selectNextASTNode(reversed) {
    return this.selectNextASTNodeWith(() => true, reversed);
  }

  selectNextASTNodeLikeThis(reversed) {
    return this.selectNextASTNodeWith((currentNode, nextNode) => currentNode.type == nextNode.type, reversed);
  }

  selectNextReference(reversed) {

    const selectedPath = this.getInnermostPathContainingSelection(this.programPath, this.firstSelection);

    const bindings = this.getBindings(selectedPath);
    if (bindings) {
      let sortedBindings = [...bindings].sort((a, b) => a.node.start - b.node.start);
      let index = sortedBindings.indexOf(selectedPath);
      index += reversed ? -1 : 1;
      index = (index + sortedBindings.length) % sortedBindings.length;
      this.selectPaths([sortedBindings[index]]);
    }
  }

  async selectDeclaration() {
    const selectedPath = this.getInnermostPathContainingSelection(this.programPath, this.firstSelection);
    const identifier = this.getFirstSelectedIdentifier(selectedPath);
    if (!identifier) {
      return;
    }
    const identName = identifier.node.name;

    const declaration = await this.getDeclaration(identifier);
    //needs smarter selection of source
    if (declaration && !t.isImportSpecifier(declaration)) {
      this.selectPaths([declaration]);
    } else {
      let classPath = this.getClassPath(this.programPath);
      let methodPath = this.getMethodPath(classPath, identName);
      const classUrls = await this.getCorrespondingClasses(identName).then(arr => arr.map(cl => cl.url));
      const functionUrls = await this.getFunctionExportURLs(identName);
      const urls = classUrls.concat(functionUrls);
      if (methodPath) {
        this.selectPaths([methodPath]);
      } else {
        urls.forEach(url => lively.openBrowser(url, true).then(container => {
          container.asyncGet("#editor").then(async livelyEditor => {
            let newCodeMirror = livelyEditor.livelyCodeMirror();
            var cm = await livelyEditor.awaitEditor();
            newCodeMirror.astCapabilities(cm).then(ac => {
              ac.selectPaths([ac.getMethodPath(ac.programPath, identName)]);
            });
          });
        }));
      }
    }
  }

  selectBindings() {
    const selectedPath = this.getInnermostPathContainingSelection(this.programPath, this.firstSelection);

    const bindings = this.getBindings(selectedPath);
    if (bindings) {
      this.selectPaths(bindings);
    }
  }

  async findImports() {
    let functions, classes, identName;
    const selectedPath = this.getInnermostPathContainingSelection(this.programPath, this.firstSelection);
    const identifier = this.getFirstSelectedIdentifier(selectedPath);
    if (identifier) {
      identName = identifier.node.name;
      functions = await this.getFunctionExportURLs(identName);
      classes = await this.getCorrespondingClasses(identName);
    }
    return { identName, functions, classes };
  }
  /*MD ## Factoring Menu MD*/

  async openMenu() {

    function fa(name, ...modifiers) {
      return `<i class="fa fa-${name} ${modifiers.map(m => 'fa-' + m).join(' ')}"></i>`;
    }

    const myself = this;

    //next: create getInnermostDescribePath
    function isInDescribe(path) {

      while (path !== null) {
        if (path.node.type === "CallExpression" && path.node.callee.name === "describe") {
          return true;
        }
        path = path.parentPath;
      }
      return false;
    }

    function directlyIn(type, path) {
      if (type instanceof Array) {
        return type.map(elem => directlyIn(elem, path)).reduce((accu, elem) => accu || elem, false);
      }
      return path.node && path.node.type === type;
    }
    /*MD ### Generate Submenus MD*/

    async function generateGenerationSubmenu() {

      let submenu = [['Class', () => {
        menu.remove();
        myself.generateClass();
      }, '→', fa('suitcase')]];

      const selectedPath = myself.getInnermostPathContainingSelection(myself.programPath, myself.firstSelection);

      //add testcase if in describe
      if (isInDescribe(selectedPath)) {
        submenu.unshift(['Testcase', () => {
          menu.remove();
          myself.generateTestCase();
        }, '→', fa('suitcase')]);
      }

      if (directlyIn(["ClassBody", "ObjectExpression"], selectedPath)) {
        submenu.push(['Getter', () => {
          menu.remove();
          myself.generateGetter();
        }, '→', fa('suitcase')], ['Setter', () => {
          menu.remove();
          myself.generateSetter();
        }, '→', fa('suitcase')]);
      }

      return submenu;
    }

    async function generateImportSubmenu() {
      let { identName, functions, classes } = await myself.findImports();
      let submenu = [];
      if (!identName || functions.length == 0 && classes.length == 0) {
        submenu.push(['none', () => {
          menu.remove();
        }, '', '']);
      } else {
        functions.forEach(url => submenu.push([url.replace(lively4url, ''), () => {
          menu.remove();
          myself.addImport(url, identName, true);
        }, '-', fa('share-square-o')]));
        classes.forEach(cl => submenu.push([cl.name + ", " + cl.url.replace(lively4url, ''), () => {
          menu.remove();
          myself.addImport(cl.url, cl.name, false);
        }, '-', fa('share-square-o')]));
      }
      return submenu;
    }

    /*MD ### Generate Factoring Menu MD*/

    const menuItems = [['selection to local variable', () => {
      menu.remove();
      this.extractExpressionIntoLocalVariable();
    }, '→', fa('share-square-o', 'flip-horizontal')], ['wrap into active expression', () => {
      menu.remove();
      this.wrapExpressionIntoActiveExpression();
    }, '→', fa('suitcase')], ['Rename', () => {
      menu.remove();
      this.selectBindings();
    }, 'Alt+R', fa('suitcase')], ['Extract Method', () => {
      menu.remove();
      this.extractMethod();
    }, 'Alt+M', fa('suitcase'), () => {
      const selection = this.selectMethodExtraction(this.programPath, true);
      if(selection) {
        this.changedSelectionInMenu = true;
        this.selectPaths(selection.selectedPaths);
      } else {        
        this.changedSelectionInMenu = false;
      }
    }, () => {
      if(this.changedSelectionInMenu) {
          this.editor.undoSelection();
      }
    }], ['Generate', generateGenerationSubmenu()], ['Import', generateImportSubmenu()]];
    var menuPosition = this.codeMirror.cursorCoords(false, "window");

    const menu = await ContextMenu.openIn(document.body, { clientX: menuPosition.left, clientY: menuPosition.bottom }, undefined, document.body, menuItems);
    menu.addEventListener("DOMNodeRemoved", () => {
      this.focusEditor();
    });
  }
  /*MD ## Generations MD*/

  /*MD ### Generate Testcase MD*/

  generateTestCase() {
    this.getUserInput("Enter test case explanation", "should work properly").then(input => this.generateCodeFragment(this.compileTestCase(input)));
  }

  generateGetter() {
    this.getUserInput("Enter property name", "myCoolProperty").then(input => this.generateCodeFragment(this.compileGetter(input)));
  }

  generateSetter() {
    this.getUserInput("Enter property name", "myCoolProperty").then(input => this.generateCodeFragment(this.compileSetter(input)));
  }

  generateClass() {
    this.getUserInput("Enter class name", "Foo").then(input => this.generateCodeFragment(this.compileClass(input)));
  }

  async generateCodeFragment(replacement) {
    const selection = this.firstSelection;
    const scrollInfo = this.scrollInfo;

    this.sourceCode = this.sourceCode.transformAsAST(() => ({
      visitor: {
        Program: programPath => {
          let path = this.getPathBeforeCursor(programPath, selection.start);
          if (path === undefined) {
            programPath.pushContainer('body', replacement);
          } else {
            path.insertAfter(replacement);
          }
        }
      }
    })).code;
    this.scrollTo(scrollInfo);
    this.focusEditor();
    this.editor.setSelection(selection.asCM()[0]);
  }

  compileTestCase(explanation) {
    return template("it(EXP, () => {\n" + "let put = 'code here';" + "})")({
      EXP: t.stringLiteral(explanation)
    });
  }

  //TODO: nice identifier
  compileGetter(propertyName) {
    return t.classMethod("get", t.identifier(propertyName), [], t.blockStatement([t.returnStatement(t.memberExpression(t.thisExpression(), t.identifier(propertyName)))]));
  }

  compileSetter(propertyName) {
    return t.classMethod("set", t.identifier(propertyName), [t.Identifier("newValue")], t.blockStatement([t.expressionStatement(t.assignmentExpression("=", t.memberExpression(t.thisExpression(), t.identifier(propertyName)), t.identifier("newValue")))]));
  }

  compileClass(className) {
    return t.classDeclaration(t.identifier(className), null, t.classBody([t.classMethod("constructor", t.Identifier("constructor"), [], t.blockStatement([]))]), []);
  }

  async getUserInput(description, defaultValue) {
    let input = await lively.prompt(description, defaultValue);
    return new Promise((resolve, reject) => {
      if (input) {
        resolve(input);
      } else {
        reject("No input given!");
      }
    });
  }

  /*MD ### Generate Import MD*/

  addImport(url, importName, isFunction) {
    const selection = this.firstSelection;
    const scrollInfo = this.scrollInfo;
    this.sourceCode = this.sourceCode.transformAsAST(() => ({
      visitor: {
        Program: programPath => {
          let existingImportStatement = this.nextPath(programPath, path => {
            return t.isImportDeclaration(path) && path.node.source.value == url;
          });
          let selectedPath = this.getInnermostPathContainingSelection(programPath, selection);
          if (!existingImportStatement) {
            let importStatement = t.importDeclaration([t.importSpecifier(t.identifier(importName), t.identifier(importName))], t.stringLiteral(url));
            programPath.node.body.unshift(importStatement);
          } else if (!existingImportStatement.node.specifiers.some(spec => spec.imported.name == importName)) {
            existingImportStatement.node.specifiers.push(t.identifier(importName));
          }
          if (!isFunction) {
            selectedPath.replaceWith(t.memberExpression(t.identifier(importName), t.identifier(selectedPath.node.name)));
          }
        }
      }
    })).code;
    this.scrollTo(scrollInfo);
  }

  /*MD ## Transformations MD*/

  /*MD ### Extract Method MD*/
  findParameters(identifiers, surroundingMethod, actualSelections) {
    return identifiers.filter(identifier => {
      return this.needsToBeParameter(identifier, surroundingMethod);
    }).filter(identifier => {
      const bindingPath = identifier.scope.getBinding(identifier.node.name).path;
      return !this.isSelected(bindingPath, actualSelections);
    }).map(identifier => {
      return this.getBindingDeclarationIdentifierPath(identifier.scope.getBinding(identifier.node.name)).node;
    });
  }

  needsToBeParameter(identifier, surroundingMethod) {
    return identifier.scope.hasBinding(identifier.node.name) && !surroundingMethod.parentPath.scope.hasBinding(identifier.node.name);
  }

  findReturnValues(identifiers, surroundingMethod, actualSelections) {
    const bindings = [...new Set(identifiers.filter(identifier => {
      return identifier.scope.hasBinding(identifier.node.name) && !surroundingMethod.parentPath.scope.hasBinding(identifier.node.name);
    }).map(identifier => {
      return identifier.scope.getBinding(identifier.node.name);
    }))];

    return bindings.filter(binding => {
      const declarationInSelection = this.isSelected(binding.path, actualSelections);
      const constantViolationInSelection = binding.constantViolations.some(constantViolation => this.isSelected(constantViolation, actualSelections));
      const referenceOutsideSelection = binding.referencePaths.some(reference => !this.isSelected(reference, actualSelections));

      return this.needsToBeReturned(declarationInSelection, constantViolationInSelection, referenceOutsideSelection);
    }).map(binding => {
      const constantViolationOutsideSelection = binding.constantViolations.some(constantViolation => !this.isSelected(constantViolation, actualSelections));
      return { node: this.getBindingDeclarationIdentifierPath(binding).node, declaredInExtractedCode: this.isSelected(binding.path, actualSelections), constantViolationOutsideSelection };
    });
  }

  needsToBeReturned(declarationInSelection, constantViolationInSelection, referenceOutsideSelection) {
    return !declarationInSelection && constantViolationInSelection || (constantViolationInSelection || declarationInSelection) && referenceOutsideSelection;
  }

  createMethod(content, parameter, returnValues, scope, extractingExpression) {
    if (extractingExpression && returnValues.length > 0) {
      lively.warn("Unable to extract an expression, that assigns something to variables used outside the expression.");
    }
    var returnStatement;
    returnValues.forEach(returnValue => returnValue.returnIdentifier = returnValue.declaredInExtractedCode ? returnValue.node : t.identifier(returnValue.node.name + "_return"));
    if (returnValues.length == 1) {
      returnStatement = t.returnStatement(returnValues[0].node);
    } else if (returnValues.length > 1) {
      returnStatement = t.returnStatement(t.objectExpression(returnValues.map(i => t.objectProperty(i.returnIdentifier, i.node, false, true))));
    }

    var methodContent = content.map(p => {
      //remove formatting for propper re-formatting
      p.node.loc = null;
      p.node.start = null;
      p.node.end = null;
      return p.node;
    });
    if (returnStatement) {
      methodContent.push(returnStatement);
    } else if (extractingExpression) {
      methodContent = [t.returnStatement(content[0].node)];
    }
    const newMethod = t.classMethod("method", t.identifier("HopefullyNobodyEverUsesThisMethodName"), parameter, t.blockStatement(methodContent));
    scope.insertAfter(newMethod)[0];
    for (let i = 0; i < content.length - 1; i++) {
      content[i].remove();
    }
    var methodCall;
    const callExpression = t.callExpression(t.identifier("this.HopefullyNobodyEverUsesThisMethodName"), parameter);
    if (returnValues.length == 1) {
      if (returnValues[0].declaredInExtractedCode) {
        const variableType = returnValues[0].constantViolationOutsideSelection ? "var" : "const";
        methodCall = [t.variableDeclaration(variableType, [t.variableDeclarator(returnValues[0].node, callExpression)])];
      } else {
        methodCall = [t.expressionStatement(t.assignmentExpression("=", returnValues[0].node, callExpression))];
      }
    } else if (returnValues.length > 1) {
      const objectPattern = t.objectPattern(returnValues.map(i => t.objectProperty(i.returnIdentifier, i.returnIdentifier, false, true)));
      methodCall = [t.variableDeclaration("const", [t.variableDeclarator(objectPattern, callExpression)])];
      returnValues.forEach(returnStatement => {
        if (returnStatement.node != returnStatement.returnIdentifier) {
          methodCall.push(t.expressionStatement(t.assignmentExpression("=", returnStatement.node, returnStatement.returnIdentifier)));
        }
      });
    } else {
      methodCall = [callExpression];
    }
    content[content.length - 1].replaceWithMultiple(methodCall);
  }

  async extractMethod() {

    const scrollInfo = this.scrollInfo;
    const transformed = this.sourceCode.transformAsAST(({ types: t, template }) => ({
      visitor: {
        Program: programPath => {
          /*var selectedPaths = this.getSelectedPaths(programPath);*/
          const {
            selectedPaths,
            extractingExpression,
            actualSelections
          } = this.selectMethodExtraction(programPath);

          const identifiers = selectedPaths.map(this.getAllIdentifiers).flat();
          const surroundingMethod = selectedPaths[0].find(parent => {
            return parent.node.type == "ClassMethod";
          });
          const parameters = this.findParameters(identifiers, surroundingMethod, actualSelections);
          const returnValues = this.findReturnValues(identifiers, surroundingMethod, actualSelections);
          this.createMethod(selectedPaths, [...new Set(parameters)], returnValues, surroundingMethod, extractingExpression);
        }
      }
    }));
    this.sourceCode = transformed.code;
    this.scrollTo(scrollInfo);
    const pathsToSelect = [];
    this.programPath.traverse({
      Identifier(path) {
        if (path.node.name == "HopefullyNobodyEverUsesThisMethodName") {
          pathsToSelect.push(path);
        }
      }
    });
    this.selectPaths(pathsToSelect);
  }

  /*MD ### Extract Variable MD*/

  selectMethodExtraction(programPath, silent = false) {
    var selectedPaths = this.getSelectedStatements(programPath);
    var extractingExpression = false;

    if (selectedPaths.length == 0) {
      var expressions = this.getSelectedExpressions(programPath);
      if (expressions.length > 1) {
        if (!silent) lively.warn('You cannot extract multiple statements at once. Select statements or a single expression!');
        return;
      } else if (expressions.length == 0) {
        if (!silent) lively.warn('Select statements or an expression to extract!');
        return;
      } else {
        selectedPaths = expressions;
        extractingExpression = true;
      }
    }

    const actualSelections = selectedPaths.map(path => {
      return range(path.node.loc);
    });
    return {
      selectedPaths,
      extractingExpression,
      actualSelections
    };
  }

  async extractExpressionIntoLocalVariable() {
    const selection = this.firstSelection;
    let done = false;

    const scrollInfo = this.scrollInfo;

    let pathLocationToBeExtracted;
    const res = this.sourceCode.transformAsAST(({ types: t }) => ({
      visitor: {
        Expression: path => {
          if (!done) {
            const isSelectedPath = this.isPathExactlySelected(path, selection);
            if (isSelectedPath) {
              pathLocationToBeExtracted = path.getPathLocation();

              path.find(p => {
                const parentPath = p.parentPath;
                if (!parentPath) {
                  return false;
                }

                function ensureBlock(body) {
                  if (!body.node) return false;

                  if (body.isBlockStatement()) {
                    return false;
                  }

                  const statements = [];
                  if (body.isStatement()) {
                    statements.push(body.node);
                    const blockNode = t.blockStatement(statements);
                    body.replaceWith(blockNode);
                    return true;
                  } else if (body.parentPath.isArrowFunctionExpression() && body.isExpression()) {
                    statements.push(t.returnStatement(body.node));
                    const blockNode = t.blockStatement(statements);
                    body.replaceWith(blockNode);
                    return true;
                  } else {
                    throw new Error("I never thought this was even possible.");
                  }
                }

                const targetLocation = path.getPathLocation();
                const blockLocation = p.getPathLocation();
                if (p.parentKey === 'body' && (parentPath.isFor() || parentPath.isWhile())) {
                  const becameABlock = ensureBlock(p);
                  if (becameABlock) {
                    pathLocationToBeExtracted = blockLocation + '.body[0]' + targetLocation.replace(blockLocation, '');
                  }
                  return true;
                }
                if (p.parentKey === 'body' && parentPath.isFunction()) {
                  const becameABlock = ensureBlock(p);
                  if (becameABlock) {
                    pathLocationToBeExtracted = blockLocation + '.body[0].argument' + targetLocation.replace(blockLocation, '');
                  }
                  return true;
                }
                if ((p.parentKey === 'consequent' || p.parentKey === 'alternate') && parentPath.isIfStatement()) {
                  const becameABlock = ensureBlock(p);
                  if (becameABlock) {
                    pathLocationToBeExtracted = blockLocation + '.body[0]' + targetLocation.replace(blockLocation, '');
                  }
                  return true;
                }
              });

              done = true;
            }
          }
        }
      }
    }));

    if (!pathLocationToBeExtracted) {
      lively.warn('No Expression to extract found.');
      return;
    }

    const pathLocationsToSelect = [];
    const resultExtracted = res.code.transformAsAST(({ types: t, template }) => ({
      visitor: {
        Program: programPath => {
          const path = this.pathByLocationFromProgram(programPath, pathLocationToBeExtracted);
          let value = '';
          path.traverse({
            Identifier(p) {
              value += '-' + p.node.name;
            }
          });
          if (value.length > 0) {
            // #TODO: ensure unique identifier
            value = value.camelCase();
          } else {
            value = path.scope.generateUidIdentifier('temp').name;
          }
          const identifier = t.Identifier(value);
          const decl = template('const ID = INIT;')({
            ID: identifier,
            INIT: path.node
          });

          let referree = t.Identifier(value);

          path.replaceWith(referree);
          const insertedDeclaration = path.getStatementParent().insertBefore(decl)[0];
          const insertedDeclarationIdentifier = insertedDeclaration.get('declarations')[0].get('id');

          pathLocationsToSelect.push(insertedDeclarationIdentifier.getPathLocation());
          pathLocationsToSelect.push(path.getPathLocation());
        }
      }
    }));
    this.sourceCode = resultExtracted.code;

    const pathsToSelect = this.pathLocationsToPathes(pathLocationsToSelect);

    this.selectPaths(pathsToSelect);
    this.focusEditor();
    this.scrollTo(scrollInfo);
  }

  async wrapExpressionIntoActiveExpression() {
    const selection = this.firstSelection;
    let done = false;

    const scrollInfo = this.scrollInfo;

    let pathLocationToBeExtracted;
    const res = this.sourceCode.transformAsAST(() => ({
      visitor: {
        Expression: path => {
          if (!done) {
            const isSelectedPath = this.isPathExactlySelected(path, selection);
            if (isSelectedPath) {
              pathLocationToBeExtracted = path.getPathLocation();
              done = true;
            }
          }
        }
      }
    }));

    if (!pathLocationToBeExtracted) {
      lively.warn('No `Expression` to wrap found.');
      return;
    }

    const pathLocationsToSelect = [];
    const resultExtracted = res.code.transformAsAST(({ template }) => ({
      visitor: {
        Program: programPath => {
          const path = this.pathByLocationFromProgram(programPath, pathLocationToBeExtracted);
          const ae = template('aexpr(() => EXPR)')({
            EXPR: path.node
          }).expression;

          path.replaceWith(ae);

          pathLocationsToSelect.push(path.getPathLocation());
        }
      }
    }));
    this.sourceCode = resultExtracted.code;

    const pathsToSelect = this.pathLocationsToPathes(pathLocationsToSelect);

    this.selectPaths(pathsToSelect);
    this.focusEditor();
    this.scrollTo(scrollInfo);
  }

  /*MD ## Accessors MD*/

  get sourceCode() {
    return this.livelyCodeMirror.value;
  }
  set sourceCode(text) {
    return this.livelyCodeMirror.value = text;
  }

  focusEditor() {
    this.livelyCodeMirror.focus();
  }

  get scrollInfo() {
    return this.codeMirror.getScrollInfo();
  }
  scrollTo(scrollInfo) {
    this.codeMirror.scrollIntoView({
      left: scrollInfo.left,
      top: scrollInfo.top,
      right: scrollInfo.left + scrollInfo.width,
      bottom: scrollInfo.top + scrollInfo.height
    });
  }

  /*MD ## Utilities MD*/

  isSelected(path, selections = null) {
    if (!selections) {
      selections = this.selectionRanges;
    }
    const pathRange = range(path.node.loc);
    for (const selection of selections) {
      if (selection.containsRange(pathRange)) {
        return true;
      }
    }
    return false;
  }

  isPathExactlySelected(path, selection) {
    return selection.isEqual(range(path.node.loc));
  }

  pathByLocationFromProgram(programPath, location) {
    let path = programPath;
    const reg = /(\.[A-Za-z0-9]+|(\[[0-9]+\]))/ig;
    let result;
    while ((result = reg.exec(location)) !== null) {
      let part = result[0];
      if (part.startsWith('.')) {
        part = part.replace('.', '');
        path = path.get(part);
      } else {
        part = part.replace(/\[|\]/ig, '');
        part = parseInt(part);
        path = path[part];
      }
    }

    return path;
  }

  pathLocationsToPathes(pathLocations) {
    const paths = [];

    this.sourceCode.traverseAsAST({
      Program: path => {
        pathLocations.forEach(location => {
          paths.push(this.pathByLocationFromProgram(path, location));
        });
      }
    });

    return paths;
  }

  async getCorrespondingClasses(methodName) {
    let index = await FileIndex.current();

    //find classes that contain the method
    let possibleClasses = await index.db.classes.filter(cl => {
      return cl.methods.some(me => me.name == methodName);
    }).toArray();

    //find files that export things with the urls from the found classes
    let possibleExports = await index.db.exports.where('url').anyOf(possibleClasses.map(cl => cl.url)).toArray();

    //reduce the found classes with the found possible exports
    let locations = possibleClasses.filter(cl => {
      return possibleExports.some(e => e.url == cl.url && e.classes.some(eCl => eCl == cl.name));
    });
    locations = locations.filter(ea => ea.url.match(lively4url)); //filter local files
    return locations;
  }

  async getFunctionExportURLs(methodName) {
    let index = await FileIndex.current();
    let locations = await index.db.exports.filter(exp => {
      return exp.functions.some(me => me == methodName);
    }).toArray();
    return locations.map(loc => loc.url); //.replace(lively4url,''));
  }
}