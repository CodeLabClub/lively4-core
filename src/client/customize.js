import boundEval from "src/client/bound-eval.js";

'use strict';

export default class Customize {
  
  static openCustomizeWorkspace(evt) {
    var code = localStorage["customLivelyCode"] || "// costomize all pages of domain here"
    lively.openWorkspace(code, evt).then( comp => {
      comp.doSave = function doSave(text) {
          lively.notify("store custom workspace")
          localStorage["customLivelyCode"] = text
          this.tryBoundEval(text); // just a default implementation...
      }
      comp.parentElement.setAttribute("title", "Customize Page")
    })
  }
 
  static customizePage() {
    var code = localStorage["customLivelyCode"]
    if (code) {
      try {
        boundEval(code)  
      } catch(e) {
        lively.notify("Error executing local code: " + code +"\n error:" + e)
      }
    }
  }
}
console.log("loadedc customize.js")
