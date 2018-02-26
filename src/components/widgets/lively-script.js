import Morph from 'src/components/widgets/lively-morph.js';
import boundEval from 'src/client/bound-eval.js';

export default class LivelyScript extends Morph {

  async initialize() {
    var src = this.textContent

    var result = await this.boundEval(src)
    if (result.isError) {
      lively.showError(result.value)
    }
    
    if (result.value && result.value.then) {
      result.value = await result.value
    }
    
    
    if (result.value instanceof HTMLElement) {
      this.shadowRoot.querySelector("#result").innerHTML = ""
      this.shadowRoot.querySelector("#result").appendChild(result.value)
    } else if (result.value !== undefined) {
      this.shadowRoot.querySelector("#result").innerHTML = "" + result.value 
    } else {
      this.shadowRoot.querySelector("#result").innerHTML = ""
    }
  }
    
  async boundEval(str) {
    return boundEval(str, this)
  }
}
