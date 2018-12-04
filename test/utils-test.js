import { waitForDeepProperty, isFunction, functionMetaInfo, CallableObject, using, shallowEqualsArray, shallowEqualsSet, shallowEqualsMap } from 'utils';
"enable aexpr";
import chai, {expect} from 'src/external/chai.js';
import sinon from 'src/external/sinon-3.2.1.js';
import sinonChai from 'src/external/sinon-chai.js';
chai.use(sinonChai);

describe('Dynamic type checks', function() {
  // #TODO #Question: are generators functions in this case?
  it('`isFunction` works on functions but not on non-functions', () => {
    expect(isFunction(function foo() {})).to.be.true;
    expect(isFunction(async function foo() {})).to.be.true;

    expect(isFunction({})).to.be.false;
    expect(isFunction('')).to.be.false;
    expect(isFunction(1)).to.be.false;
    expect(isFunction(undefined)).to.be.false;
    expect(isFunction(null)).to.be.false;
    expect(isFunction(0)).to.be.false;
    expect(isFunction(true)).to.be.false;
    expect(isFunction(new Date())).to.be.false;
  });
  describe('Dynamic type checks', function() {
    it('functionMetaInfo function', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo(function foo() {});
      expect(isFunction).to.be.true;
      expect(isAsync).to.be.false;
      expect(isGenerator).to.be.false;
    });
    it('functionMetaInfo anonymous function', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo(() => {});
      expect(isFunction).to.be.true;
      expect(isAsync).to.be.false;
      expect(isGenerator).to.be.false;
    });
    it('functionMetaInfo async function', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo(async () => {});
      expect(isFunction).to.be.true;
      expect(isAsync).to.be.true;
      expect(isGenerator).to.be.false;
    });
    it('functionMetaInfo generator function', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo(function* foo() {});
      expect(isFunction).to.be.true;
      expect(isAsync).to.be.false;
      expect(isGenerator).to.be.true;
    });
    it('functionMetaInfo async generator function', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo(async function* foo() {});
      expect(isFunction).to.be.true;
      expect(isAsync).to.be.true;
      expect(isGenerator).to.be.true;
    });
    it('functionMetaInfo string', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo('');
      expect(isFunction).to.be.false;
      expect(isAsync).to.be.false;
      expect(isGenerator).to.be.false;
    });
    it('functionMetaInfo null', () => {
      const { isFunction, isAsync, isGenerator } = functionMetaInfo('');
      expect(isFunction).to.be.false;
      expect(isAsync).to.be.false;
      expect(isGenerator).to.be.false;
    });

  });
});

describe('Callable Object', () => {
  it('defines CallableObject', () => {
    expect(CallableObject).to.be.ok;
  });
});

// === Python's with statement
describe('using', () => {
  class TestContextManager {
    constructor() {
      this.__enter__ = sinon.spy();
      this.__exit__ = sinon.spy();
    }
  }
  
  it('using is defined', () => {
    expect(using).to.be.ok;
  });

  it('using calls the specified function', () => {
    const spy = sinon.spy();
    
    const actual = using([], spy);
    expect(spy).to.be.calledOnce;
  });

  it("using returns the callback's value", () => {
    const expected = 42;
    
    const actual = using([], () => expected);
    expect(actual).to.equal(expected);
  });

  it('calls __enter__ and __exit__ of one context manager', () => {
    const callbackSpy = sinon.spy();
    const contextManager = new TestContextManager();
        
    using([contextManager], callbackSpy);
    expect(contextManager.__enter__).to.be.calledOnce;
    expect(callbackSpy).to.be.calledOnce;
    expect(contextManager.__exit__).to.be.calledOnce;
    expect(contextManager.__enter__).to.be.calledBefore(callbackSpy)
    expect(callbackSpy).to.be.calledBefore(contextManager.__exit__)
  });

  it('calls __enter__ and __exit__ of multiple context managers', () => {
    const callbackSpy = sinon.spy();
    const contextManager1 = new TestContextManager();
    const contextManager2 = new TestContextManager();

    using([contextManager1, contextManager2], callbackSpy);
    
    expect(contextManager1.__enter__).to.be.calledOnce;
    expect(contextManager2.__enter__).to.be.calledOnce;
    expect(callbackSpy).to.be.calledOnce;
    expect(contextManager2.__exit__).to.be.calledOnce;
    expect(contextManager1.__exit__).to.be.calledOnce;

    expect(contextManager1.__enter__).to.be.calledBefore(contextManager2.__enter__)
    expect(contextManager2.__enter__).to.be.calledBefore(callbackSpy)
    expect(callbackSpy).to.be.calledBefore(contextManager2.__exit__)
    expect(contextManager2.__exit__).to.be.calledBefore(contextManager1.__exit__)
  });

  it('nested usings call respective context managers', () => {
    const callbackSpy = sinon.spy();
    const contextManager1 = new TestContextManager();
    const contextManager2 = new TestContextManager();

    using([contextManager1], () =>
      using([contextManager2], callbackSpy)
    );
    
    expect(contextManager1.__enter__).to.be.calledOnce;
    expect(contextManager2.__enter__).to.be.calledOnce;
    expect(callbackSpy).to.be.calledOnce;
    expect(contextManager2.__exit__).to.be.calledOnce;
    expect(contextManager1.__exit__).to.be.calledOnce;

    expect(contextManager1.__enter__).to.be.calledBefore(contextManager2.__enter__)
    expect(contextManager2.__enter__).to.be.calledBefore(callbackSpy)
    expect(callbackSpy).to.be.calledBefore(contextManager2.__exit__)
    expect(contextManager2.__exit__).to.be.calledBefore(contextManager1.__exit__)
  });

  it('using calls context managers with error in case of exceptions', () => {
    const expectedError = new Error('test error');
    const contextManager1 = new TestContextManager();
    const contextManager2 = new TestContextManager();

    function errornousFunction() {
      using([contextManager1], () =>
        using([contextManager2], (callbackSpy => {
          throw expectedError;
        }))
      );
    }
    
    expect(errornousFunction).to.throw(expectedError);
    
    expect(contextManager2.__exit__).to.be.calledOnce;
    expect(contextManager2.__exit__).to.be.calledWith(expectedError);

    expect(contextManager1.__exit__).to.be.calledOnce;
    expect(contextManager1.__exit__).to.be.calledWith(expectedError);

    expect(contextManager2.__exit__).to.be.calledBefore(contextManager1.__exit__)
  });
});



describe('waitForDeepProperty', () => {
  it('it works', async (done) => {
    
    var o = new Object();
    
    lively.sleep(20).then(() => {
      o.foo = {}
    })

    lively.sleep(30).then(() => {
      o.foo.bar = 7
    })

    var result = await waitForDeepProperty(o, "foo.bar", 1000, 10) 
    expect(result).to.equal(7)
    done()
  });
});

describe('shallowEqualsArray', () => {
  it('it works', () => {
    const arr = [1,2,3];
    expect(shallowEqualsArray(arr, arr)).to.be.true;
    expect(shallowEqualsArray([], [])).to.be.true;
    expect(shallowEqualsArray([1], [1])).to.be.true;
    expect(shallowEqualsArray([1], [1,2])).to.be.false;
    expect(shallowEqualsArray([1,2], [1])).to.be.false;
    expect(shallowEqualsArray([1,2], [2,1])).to.be.false;
    const obj1 = {};
    expect(shallowEqualsArray([1, obj1, arr], [1, obj1, arr])).to.be.true;
    
    // not same identity
    expect(shallowEqualsArray([{}], [{}])).to.be.false;
  });
});

describe('shallowEqualsSet', () => {
  it('it works', () => {
    const set = new Set([1,2,3]);
    expect(shallowEqualsSet(set, set)).to.be.true;
    expect(shallowEqualsSet(new Set(), new Set())).to.be.true;
    expect(shallowEqualsSet(new Set([1]), new Set([1]))).to.be.true;
    expect(shallowEqualsSet(new Set([1]), new Set([1,2]))).to.be.false;
    expect(shallowEqualsSet(new Set([1,2]), new Set([1]))).to.be.false;
    expect(shallowEqualsSet(new Set([1,2]), new Set([2,1]))).to.be.true;
    const obj1 = {};
    expect(shallowEqualsSet(new Set([1, obj1, set]), new Set([obj1, 1, set]))).to.be.true;
    
    // not same identity
    expect(shallowEqualsSet(new Set([{}]), new Set([{}]))).to.be.false;
  });
});

describe('shallowEqualsMap', () => {
  it('it works', () => {
    const map = new Map([[1,2],[3,4],[5,6]]);
    expect(shallowEqualsMap(map, map)).to.be.true;
    expect(shallowEqualsMap(new Map(), new Map())).to.be.true;
    expect(shallowEqualsMap(new Map([[1,2]]), new Map([[1,2]]))).to.be.true;
    expect(shallowEqualsMap(new Map([[1,2]]), new Map([[1,2],[3,4]]))).to.be.false;
    expect(shallowEqualsMap(new Map([[1,2],[3,4]]), new Map([[1,2]]))).to.be.false;
    expect(shallowEqualsMap(new Map([[1,2],[3,4]]), new Map([[3,4],[1,2]]))).to.be.true;
    const obj1 = {};
    expect(shallowEqualsMap(new Map([[1,obj1],[map,2]]), new Map([[map,2],[1,obj1]]))).to.be.true;
    
    // not same identity
    expect(shallowEqualsMap(new Map([[1,{}]]), new Map([[1,{}]]))).to.be.false;
  });
});
