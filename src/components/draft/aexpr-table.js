"enable aexpr";

import Morph from 'src/components/widgets/lively-morph.js';
import {AExprRegistry} from 'src/client/reactive/active-expression/active-expression.js';

const attributes = {
  id : ae => ae.meta().get('id'),
  function : ae => ae.func,
  //lastValue : ae => ""+ae.lastValue,
  currentValue : getValueTag,
  callbacks : ae => ae.callbacks,
  dependencies : ae => ae.supportsDependencies() ? ae.dependencies().all()
    .map(dependencyString)
    .joinElements(()=><br/>) : <font color="red">{"no dependecy api available"}</font>,
  actions : ae => <div>
    <button click={evt => lively.openInspector(ae, undefined, ae)}>inspect</button>
    <button click={() => ae.dispose()}>dispose</button>
  </div>
}
                  

function getValueTag(ae) {
  let {value, isError} = ae.evaluateToCurrentValue();
  return <font color={isError ? "red" : "blue"}>{""+value}</font>;
}
  
function dependencyString(dependency) {
  let descriptor = dependency.getAsDependencyDescription();
  return dependency._type +
    Object.keys(descriptor)
      .map(key => '\t'+key+' : '+descriptor[key])
      .join('\n')
}

function colorForHeat(heat) {
  let others = Math.round(256/Math.pow(heat+0.1, 1)).toString(16);
  if(others.length == 1)others = "0"+others;
  return "#FF"+others+others;
}

function coolDown(element) {
  let currentcount = parseFloat(element.getAttribute("heat"));
  if(currentcount <= 0)return;
  let step = 0.1;
  currentcount = currentcount - step;
  element.setAttribute("heat", Math.max(currentcount, 0));
  let newColor = colorForHeat(currentcount+1);
  element.setAttribute("bgcolor", newColor);
  if(currentcount <= 0) {
    element.setAttribute('heat', 0);
    element.setAttribute("bgcolor", "#FFFFFF");
  }
}

export default class AexprTable extends Morph {
  async initialize() {
    this.windowTitle = "Active Expression Monitor";
    this.initializeCallbacks();
    this.initializeHeader();
    this.value = new Array();
    this.repopulate();
    this.events = new Map();
    this.coolDown();
    //this.filter.onchange = (x,y,z) => lively.notify(x+" -- "+y+" -- "+z);
    this.buttonShowEvents.addEventListener('click', () => this.openEventDrops());
    this.filterElement.addEventListener('change', () => this.filterChanged());
    this.filterChanged();
  }
  
  initializeCallbacks(){
    AExprRegistry.on('add', (aexpr) => this.addAexpr(aexpr));
    AExprRegistry.on('remove', (aexpr) => this.removeAexpr(aexpr));
    AExprRegistry.on('update', (aexpr) => this.updateAexpr(aexpr));
  }
  
  initializeHeader(){
    let header = <tr class='header'></tr>;
    for(let col in attributes)header.appendChild(<td>{col}</td>)
    this.table.appendChild(header);
  }
  
  coolDown() {
    this.rows().forEach(coolDown);
    setTimeout(() => {this.coolDown()}, 100);
  }
  
  get value() {
    return this._value
  }

  set value(v) {
    this._value = v
    //this.update()
  }
  
  get table() {
    return this.get("#table");
  }
  
    
  get filterElement() {
    return this.get("#filter");
  }
  
  get buttonShowEvents() {
    return this.get("#buttonShowEvents");
  }

  
  repopulate() {  
    let added = AExprRegistry.allAsArray().difference(this.value);
    let removed = this.value.difference(AExprRegistry.allAsArray());
    for(let each of removed)this.removeAexpr(each);
    for(let each of added)this.addAexpr(each);
  } 
  
  addAexpr(aexpr){
    let row = this.createRow(aexpr);
    this.table.appendChild(row);
    this.value.push(aexpr);
  }
  
  removeAexpr(aexpr){
    this.table.removeChild(this.rowOf(aexpr));
    let index = this.value.indexOf(aexpr);
    this.value.splice(index, 1);
  }
  
  updateAexpr(aexpr){
    let row = this.rowOf(aexpr);
    if(!row)return;
    this.setRow(row, aexpr);
    this.igniteRow(row);
  }
  
  igniteRow(row){
    let currentHeat = parseFloat(row.getAttribute("heat"));
    row.setAttribute("heat", currentHeat+1);
    let newColor = colorForHeat(Math.min(currentHeat+1, 30));
    row.setAttribute("bgcolor", newColor);
  }
  
  rows() {
    return this.table.childNodes
      .filter(each => each.tagName == 'TR')
      .filter(each => each.getAttribute('class') == 'aeRow');
  }
  
  rowOf(aexpr){
    let index = this.value.indexOf(aexpr);
    return this.rows()[index];
  }
  
  createRow(aexpr){
    let htmlRow = <tr class='aeRow'></tr>;
    htmlRow.setAttribute("heat", 0);
    this.setRow(htmlRow, aexpr);
    return htmlRow; 
  }
  
  setRow(row, aexpr){
    row.aexpr = aexpr;
    while(row.firstChild) {
      row.removeChild(row.firstChild);
    }
    for(let attribute in attributes){
      let value = attributes[attribute](aexpr);
      row.appendChild(<td>{...value}</td>);
    }
  }
  
  clearTable() {
    while (this.table.firstChild)this.table.firstChild.remove();
  }
  
  filterChanged() {
    let code = this.filterElement.value;
    let numResults = 0;
    let numErrored = 0;
    try {
      if(!code || code == '')code = 'true';
      this.filter = new Function("each", "return "+code);
      this.rows().forEach(each => {
        let filterIn = false;
        try {
          filterIn = this.filter(each.aexpr);
        } catch(e) {
          filterIn = false;
          numErrored++;
        };
        if(filterIn)numResults++;
        each.style.display = filterIn ? 'table-row' : 'none';
        this.get('#filter-info').textContent = "results/errored/total = "+numResults+"/"+numErrored+"/"+this.rows().length;
      });
    } catch(e) {
      lively.notify('Error parsing '+code+': '+e);
    }
  }
  
  async openEventDrops() {
    let eventDrops = await lively.openComponentInWindow('event-drops');
    eventDrops.dataFromSource = this.rows()
      .map(each => each.aexpr)
      .filter(each => this.filter(each));
    eventDrops.groupingFunction = each => each.meta().get('id');
    eventDrops.update();
  }
  
  livelyMigrate(other) {
    
  }
  
  async livelyExample() {
    
  }
  
  
}