import { loc, range } from 'utils';

import babelDefault from 'systemjs-babel-build';
const babel = babelDefault.babel;

import ContextMenu from 'src/client/contextmenu.js';

export default class ASTCapabilities {

  constructor(lcm, cm) {
    this.lcm = lcm;
    this.codeMirror = cm;
  }
  get editor() {
    return this.codeMirror;
  }
  get selectionRanges() {
    return this.editor.listSelections().map(range);
  }

  /*MD ## Navigation MD*/
  get programPath() {
    let programPath;
    this.sourceCode.traverseAsAST({
      Program(path) {
        programPath = path;
      }
    });
    return programPath;
  }
  getPathForRoute(route) {
    let path = this.programPath;
    if (!path) {
      lively.warn('No programPath found');
    }

    route.forEach(routePoint => {
      path = path.get(routePoint.inList ? routePoint.listKey + '.' + routePoint.key : routePoint.key);
    });

    return path;
  }
  nextPath(startingPath, isValid) {
    let pathToShow;

    startingPath.traverse({
      enter(path) {
        if (!pathToShow && isValid(path)) {
          pathToShow = path;
        }
      }
    });

    return pathToShow;
  }
  getInnermostPath(startingPath, nextPathCallback) {
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
  expandSelection() {
    const maxPaths = this.editor.listSelections().map(({ anchor, head }) => {

      // go down to minimal selected node
      const nextPathContainingCursor = (startingPath, { anchor, head }) => {
        return this.nextPath(startingPath, path => {
          const location = range(path.node.loc);
          return location.contains(anchor) && location.contains(head);
        });
      };
      const pathToShow = this.getInnermostPath(this.programPath, prevPath => nextPathContainingCursor(prevPath, { anchor, head }));

      // go up again
      let selectionStart = loc(anchor);
      let selectionEnd = loc(head);
      return pathToShow.find(path => {
        const pathLocation = path.node.loc;
        const pathStart = loc(pathLocation.start);
        const pathEnd = loc(pathLocation.end);

        return pathStart.isStrictBefore(selectionStart) || selectionEnd.isStrictBefore(pathEnd);
      }) || pathToShow;
    });

    this.selectPaths(maxPaths);
  }
  forwardList(parentPath) {
    const linearizedPathList = [];
    parentPath.traverse({
      exit(path) {
        linearizedPathList.push(path);
      }
    });
    return linearizedPathList;
  }
  backwardList(parentPath) {
    const linearizedPathList = [];
    parentPath.traverse({
      enter(path) {
        linearizedPathList.push(path);
      }
    });
    return linearizedPathList.reverse();
  }
  selectNextASTNode(reversed) {
    const programPath = this.programPath;
    const pathList = reversed ? this.backwardList(programPath) : this.forwardList(programPath);

    const maxPaths = this.editor.listSelections().map(({ anchor, head }) => {

      // go down to minimal selected node
      const nextPathContainingCursor = (startingPath, { anchor, head }) => {
        return this.nextPath(startingPath, path => {
          const location = range(path.node.loc);
          return location.contains(anchor) && location.contains(head);
        });
      };
      let currentPath = this.getInnermostPath(programPath, prevPath => nextPathContainingCursor(prevPath, { anchor, head }));

      let selectionStart = loc(anchor);
      let selectionEnd = loc(head);
      const pathLocation = currentPath.node.loc;
      const pathStart = loc(pathLocation.start);
      const pathEnd = loc(pathLocation.end);

      // do we fully select the current path?
      if (selectionStart.isEqual(pathStart) && selectionEnd.isEqual(pathEnd)) {

        // check if parents have the same selection range
        currentPath.findParent(path => {
          const pathLocation = path.node.loc;
          const pathStart = loc(pathLocation.start);
          const pathEnd = loc(pathLocation.end);

          if (pathStart.isEqual(selectionStart) && selectionEnd.isEqual(pathEnd)) {
            currentPath = path;
          }

          return false;
        });

        const currentPathInList = pathList.find(path => path.node === currentPath.node);
        const currentIndex = pathList.indexOf(currentPathInList);
        const newPath = pathList[Math.min(currentIndex + 1, pathList.length - 1)];
        return newPath;
      } else {
        return currentPath;
      }
    });

    this.selectPaths(maxPaths);
  }

  selectNodes(nodes) {
    const ranges = nodes.map(node => {
      const [anchor, head] = range(node.loc).asCM();
      return { anchor, head };
    });
    this.editor.setSelections(ranges);
  }
  selectPaths(paths) {
    const ranges = paths.map(path => {
      const [anchor, head] = range(path.node.loc).asCM();
      return { anchor, head };
    });
    // #TODO: include primary selection
    this.editor.setSelections(ranges);
  }
  selectPath(path) {
    range(path.node.loc).selectInCM(this.editor);
  }
  isCursorIn(location, cursorStart) {
    return range(location).contains(this.editor.getCursor(cursorStart));
  }

  get routeToShownPath() {
    return this._routeToShownPath = this._routeToShownPath || [];
  }
  set routeToShownPath(value) {
    return this._routeToShownPath = value;
  }
  get markerWrappers() {
    return this._markerWrappers = this._markerWrappers || [];
  }
  set markerWrappers(value) {
    return this._markerWrappers = value;
  }

  unfold() {
    const prevPath = this.getPathForRoute(this.routeToShownPath);

    const pathToShow = prevPath.findParent(path => this.isValidFoldPath(path));

    if (pathToShow) {
      this.foldPath(pathToShow);
    } else {
      lively.warn("No previous folding level found");
    }
  }
  isValidFoldPath(path) {
    return true;
    return path.isProgram() || path.isForOfStatement() || path.isFunctionExpression() || path.isForAwaitStatement() || path.parentPath && path.parentPath.isYieldExpression() || path.isArrowFunctionExpression();
  }
  nextFoldingPath(startingPath) {
    return this.nextPath(startingPath, path => {
      const location = path.node.loc;
      if (!this.isCursorIn(location, 'anchor')) {
        return false;
      }
      if (!this.isCursorIn(location, 'head')) {
        return false;
      }

      return this.isValidFoldPath(path);
    });
  }
  fold() {
    const prevPath = this.getPathForRoute(this.routeToShownPath);

    const pathToShow = this.nextFoldingPath(prevPath);

    if (pathToShow) {
      this.foldPath(pathToShow);
    } else {
      lively.warn("No next folding level found");
    }
  }
  autoFoldMax() {
    const pathToShow = this.getInnermostPath(this.programPath, prevPath => this.nextFoldingPath(prevPath));

    if (pathToShow) {
      this.foldPath(pathToShow);
    } else {
      lively.warn("No folding level for automatic fold found");
    }
  }
  getRouteForPath(path) {
    const route = [];

    path.find(path => {
      if (path.isProgram()) {
        return false;
      } // we expect to start at a Program node

      route.unshift({
        inList: path.inList,
        listKey: path.listKey,
        key: path.key
      });

      return false;
    });

    return route;
  }
  foldPath(path) {
    this.removeFolding();

    this.routeToShownPath = this.getRouteForPath(path);

    const location = path.node.loc;

    this.createWrapper({
      line: 0, ch: 0
    }, {
      line: location.start.line - 1, ch: location.start.column
    });
    this.createWrapper({
      line: location.end.line - 1, ch: location.end.column
    }, {
      line: this.editor.lineCount(), ch: 0
    });

    requestAnimationFrame(() => {
      this.editor.refresh();
    });
  }
  createWrapper(from, to) {
    const divStyle = {
      width: "2px",
      height: "1px",
      minWidth: "2px",
      minHeight: "1px",
      borderRadius: "1px",
      backgroundColor: "green"
    };

    return this.lcm.wrapWidget('div', from, to).then(div => {
      // div.innerHTML='<i class="fa fa-plus"></i>xx'
      Object.assign(div.style, divStyle);
      this.lcm.markerWrappers.push(div);
    });
  }
  removeFolding() {
    this.lcm.markerWrappers.forEach(wrapper => wrapper.marker.clear());
    this.lcm.markerWrappers.length = 0;
  }

  async openMenu() {
    function fa(name, ...modifiers) {
      return `<i class="fa fa-${name} ${modifiers.join(' ')}"></i>`;
    }

    const menuItems = [
      ['selection to local variable', () => {
        menu.remove();
        this.extractExpressionIntoLocalVariable();
      }, '→', fa('share-square-o', 'fa-flip-horizontal')],
      ['wrap into active expression', () => {
        menu.remove();
        this.wrapExpressionIntoActiveExpression();
      }, '→', fa('suitcase')],
      ['test', () => {
        menu.remove();
        this.wrapExpressionIntoActiveExpression();
      }, '→', fa('share-alt', 'fa-rotate-90')]
    ];

    const menu = await ContextMenu.openIn(document.body, {/*clientX: x, clientY: y*/}, undefined, document.body, menuItems);
  }

  /*MD ## Transformations MD*/

  async extractExpressionIntoLocalVariable() {
    const selection = this.getFirstSelection();
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
    const selection = this.getFirstSelection();
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
    return this.lcm.value;
  }
  set sourceCode(text) {
    return this.lcm.value = text;
  }

  focusEditor() {
    this.lcm.focus();
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

  getFirstSelection() {
    const { anchor, head } = this.editor.listSelections()[0];
    const selectionStart = loc(anchor);
    const selectionEnd = loc(head);
    return { selectionStart, selectionEnd };
  }

  isPathExactlySelected(path, { selectionStart, selectionEnd }) {
    const pathLocation = path.node.loc;
    if (!pathLocation) { return; }
    
    const pathStart = loc(pathLocation.start);
    const pathEnd = loc(pathLocation.end);
    return pathStart.isEqual(selectionStart) && selectionEnd.isEqual(pathEnd);
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

}