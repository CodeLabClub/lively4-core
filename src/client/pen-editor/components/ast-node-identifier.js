"enable aexpr";

import AbstractAstNode from './abstract-ast-node.js'

import babelDefault from 'systemjs-babel-build';
const babel = babelDefault.babel;

import keyInfo from 'src/client/keyinfo.js';
import { isVariable } from 'src/client/reactive/babel-plugin-active-expression-rewriting/utils.js';
import d3 from 'src/external/d3.v5.js';

const VARIABLE_ID_MAP = new Map();
let NEXT_VARIABLE_ID = 0;

export default class AstNodeIdentifier extends AbstractAstNode {
  async initialize() {
    await super.initialize();
    this.windowTitle = "AstNodeIdentifier";
  }

  furtherStyles() { return `
::part(input-field) {
  ${isVariable(this.path) ?
    
    ' font-weight: bold; color: ' + d3.hsl(
      Math.random() * 360,
      Math.random() * 0.2 + 0.4,
      Math.random() * 0.2 + 0.4
    )
    : ''}
}
`; }
  
  addNodeStylingInfo(path) {
    lively.notify('hello')
    super.addNodeStylingInfo(path);
    
    if (!isVariable(path)) { return; }
    if (!path.scope.hasBinding(path.node.name)) { return; }

    this.setAttribute('ast-node-identifier-id', VARIABLE_ID_MAP.getOrCreate(path.scope.getBinding(path.node.name), () => NEXT_VARIABLE_ID++ % 200));
  }


  
  get name() { return this.get('#name'); }

  async updateProjection() {
    this.name.value = this.node.name;
  }

  onFocus(evt) {
    super.onFocus(evt);
    this.name.focus();
  }

  onKeydown(evt) {
    const info = keyInfo(evt);
    
    if (info.ctrl && info.char === "R") {
      evt.preventDefault();
      evt.stopPropagation();
      
      const newName = window.prompt('new identifier name');
      
      if (newName) {
        this.editor.changeIdentifier(this.node, newName);
      }
      
      return;
    }
    
    return super.onKeydown(evt);
  }
  
}