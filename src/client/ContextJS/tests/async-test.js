/*
 * Copyright (c) 2008-2018 Hasso Plattner Institute
 *
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import chai, {expect} from 'src/external/chai.js';

import * as cop from '../src/contextjs.js';

import { wrapAwait } from '../src/async.js';

describe("Async Activation", async () => {
  xit("Async Activation", async () => {

    var o = {m() { return 3}}
    var l = cop.layer(window, "AsyncLayer").refineObject(o, {
      m() { return cop.proceed() + 4}
    });

    var p = Promise.resolve();

    expect(o.m(),"(a)").equals
    var ignorePromise = cop.withLayers([l], async () => {

      expect( o.m(), "(b)").equals(7) 
      await wrapAwait(p)

      expect( o.m(), "(c)").equals(7) 
      await wrapAwait(Promise.resolve())

      expect( o.m(), "(d)").equals(7) 
      await wrapAwait(Promise.resolve())

      expect( o.m(), "(e)").equals(7) 

    });
    expect(o.m(), "(f)").equals(3)

    await ignorePromise;
  });
});

