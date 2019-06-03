/*
 * Direct-HTTP read-only file system used to
 * access all unknown, default resources.
 */

import { Base } from './base.js'

export default class Filesystem extends Base {
  constructor(path, options) {
    super('http', path, options)

    if(!options.base)
      throw new Error('Option `base` required.')

    this.base = options.base
  }

  async read(path, request, no_cache=false) {
    let f_request = await this.createProxyRequest(path, request)
    let response = this._getResponse(f_request, no_cache);

    return response
  }

  async write(path, content, request) {
    return fetch(await this.createProxyRequest(path, request, content))
  }

  async stat(path, request, no_cache=false) {
    let f_request = await this.createProxyRequest(path, request);
    let response = this._getResponse(f_request, no_cache);

    return response
  }
  
  async _getResponse(f_request, no_cache) {
    let response = await self.fetch(f_request);
    return response.clone();
  }

  async createProxyRequest(path, request, content) {
    let init = {
      mode: request.mode,
      cache: request.cache,
      method: request.method,
      headers: request.headers,
      redirect: request.redirect,
      referrer: request.referrer,
      credentials: request.credentials
    }

    if(request.method !== 'HEAD' && request.method !== 'GET' && typeof content !== 'undefined') {
      init.body = await content;
    }

    return new Request(this.base + '/' + path, init)
  }
}
