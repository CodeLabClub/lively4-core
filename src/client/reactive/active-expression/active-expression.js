import Annotations from 'src/client/reactive/utils/annotations.js';
import CachingFetch from '../utils/caching-fetch.js';
import CachingPromise from '../utils/caching-promise.js';
import { shallowEqualsArray, shallowEqualsSet, shallowEqualsMap } from 'utils';

// TODO: this is use to keep SystemJS from messing up scoping
// (BaseActiveExpression would not be defined in aexpr)
const HACK = {};

function isPromise(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
}

export const AExprRegistry = {

  _aexprs: new Set(),

  /**
   * Handling membership
   */
  addAExpr(aexpr) {
    this._aexprs.add(aexpr);
  },
  removeAExpr(aexpr) {
    this._aexprs.delete(aexpr);
  },

  /**
   * Access
   */
  allAsArray() {
    return Array.from(this._aexprs);
  }
};

function resolveValue(value, func) {
  if(isPromise(value)) {
    value.then(func);
  } else {
    func(value);
  }
}

export class BaseActiveExpression {

  /**
   *
   * @param func (Function) the expression to be observed
   * @param ...params (Objects) the instances bound as parameters to the expression
   */
  constructor(func, { params = [] } = {}) {
    this.func = func;
    this.params = params;
    this.cachingFetch = new CachingFetch();
    this.cachingPromise = new CachingPromise(this.cachingFetch);
    let currentValue = this.getCurrentValue();
    if(isPromise(currentValue)) {
      this.isAsync = true;
    }
    resolveValue(currentValue, (value) => {
      this.storeResult(value);
    })
    this.callbacks = [];
    this._isDisposed = false;
    this._shouldDisposeOnLastCallbackDetached = false;

    this._annotations = new Annotations();

    if(new.target === BaseActiveExpression) {
      this.addToRegistry();
    }
  }

  addToRegistry() {
    AExprRegistry.addAExpr(this);
  }

  /**
   * Executes the encapsulated expression with the given parameters.
   * aliases with 'now'
   * @public
   * @returns {*} the current value of the expression
   */
  getCurrentValue() {
    return this.cachingFetch.trace(() => {
      return this.cachingPromise.trace(() => {
        return this.func(...(this.params));
      });
    });
  }

  /**
   * @public
   * @param callback
   * @returns {BaseActiveExpression} this very active expression (for chaining)
   */
  onChange(callback) {
    this.callbacks.push(callback);

    return this;
  }
  /**
   * @public
   * @param callback
   * @returns {BaseActiveExpression} this very active expression (for chaining)
   */
  // #TODO: should this remove all occurences of the callback?
  offChange(callback) {
    var index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
    if (this._shouldDisposeOnLastCallbackDetached && this.callbacks.length === 0) {
      this.dispose();
    }

    return this;
  }

  /**
   * Signals the active expression that a state change might have happened.
   * Mainly for implementation strategies.
   * @public
   */
  checkAndNotify() {
    const currentValue = this.getCurrentValue();
    resolveValue(currentValue, (value) => {
      if(this.compareResults(this.lastValue, value)) { return; }
      const lastValue = this.lastValue;
      this.storeResult(value);

      this.notify(value, {
        lastValue,
        expr: this.func ,
        aexpr: this
      });
    });
  }
  
  // #TODO: extract into CompareAndStore classes
  compareResults(lastResult, newResult) {
    // array
    if(Array.isArray(lastResult) && Array.isArray(newResult)) {
      return shallowEqualsArray(lastResult, newResult);
    }
    
    // set
    if(lastResult instanceof Set && newResult instanceof Set) {
      return shallowEqualsSet(lastResult, newResult);
    }

    // map
    if(lastResult instanceof Map && newResult instanceof Map) {
      return shallowEqualsMap(lastResult, newResult);
    }

    return lastResult == newResult;
  }
  
  storeResult(result) {
    // array
    if(Array.isArray(result)) {
      this.lastValue = Array.prototype.slice.call(result)
      return;
    }
    
    // set
    if(result instanceof Set) {
      this.lastValue = new Set(result);
      return;
    }
    
    // map
    if(result instanceof Map) {
      this.lastValue = new Map(result);
      return;
    }
    
    this.lastValue = result;
  }

  notify(...args) {
    this.callbacks.forEach(callback => callback(...args));
  }

  /**
   * TODO
   * like a bind for AExpr
   * @param items
   */
  applyOn(...items) {
    throw new Error('Not yet implemented');
  }

  onBecomeTrue(callback) {
    // setup dependency
    this.onChange(bool => {
      if(bool) {
        callback();
      }
    });
    // check initial state
    resolveValue(this.getCurrentValue(), (value) => {
      if(value) { callback() }
    });

    return this;
  }

  onBecomeFalse(callback) {
    // setup dependency
    this.onChange(bool => {
      if(!bool) {
        callback();
      }
    });
    // check initial state
    resolveValue(this.getCurrentValue(), (value) => {
      if(!value) { callback() }
    });

    return this;
  }

  nowAndOnChange(callback) {
    // setup dependency
    this.onChange(callback);

    // call immediately
    // #TODO: duplicated code: we should extract this call
    resolveValue(this.getCurrentValue(), (value) => {
      this.notify(value, {});
    });

    return this;
  }

  dispose() {
    this._isDisposed = true;
    AExprRegistry.removeAExpr(this);
  }

  isDisposed() {
    return this._isDisposed;
  }

  /**
   * #TODO: implement
   * disposeOnLastCallbackDetached
   * chainable
   * for some auto-cleanup
   * (only triggers, when a callback is detached; not initially, if there are no callbacks)
   */
  disposeOnLastCallbackDetached() {
    this._shouldDisposeOnLastCallbackDetached = true;
    return this;
  }

  /**
   * Reflection information
   */

  name(...args) {
    if(args.length > 0) {
      this._annotations.add({ name: args[0] });
      return this;
    } else {
      return this._annotations.get('name');
    }
  }

  meta(annotation) {
    if(annotation) {
      this._annotations.add(annotation);
      return this;
    } else {
      return this._annotations;
    }
  }

  supportsDependencies() {
    return false;
  }
}

export function aexpr(func, ...args) {
  return new BaseActiveExpression(func, ...args);
}

export default BaseActiveExpression;
