import Morph from 'src/components/widgets/lively-morph.js';

export default class VivideView extends Morph {
  get input() { return this._input || (this._input = []); }
  set input(val) { return this._input = val; }

  async initialize() {
    this.windowTitle = "VivideView";
  }
  
  async setScript(scriptURL) {
    this.scriptURL = scriptURL;
  }
  
  async newDataFromUpstream(data) {
    this.input = data;
    
    if(this.scriptURL) {
      await this.calculateDisplayData();
    } else {
      this.displayedData = this.input;
    }
    
    await this.updateWidget();
  }
  
  async calculateDisplayData() {
    let m = await System.import(this.scriptURL.href);

    this.displayedData = [];
    m.default(this.input, this.displayedData)
  }
  async scriptGotUpdated(urlString) {
    lively.warn(`received script updated`, urlString);
    if(this.scriptURL && this.scriptURL.href === urlString) {
      await this.calculateDisplayData();
      await this.updateWidget();
    }
  }
  
  async updateWidget() {
    this.innerHTML = '';
    let list = await lively.create('vivide-list-widget');
    this.appendChild(list);
    list.display(this.displayedData, {});
  }
  
  livelyExample() {
    let exampleData = [
      function foo() { return 1; },
      function bar() { return 2; },
      function baz() { return 3; },
    ];
    
    this.newDataFromUpstream(exampleData);
  }
  
  livelyMigrate(other) {
    this.newDataFromUpstream(other.input);
  }
}
