import PropertyView from 'src/client/stroboscope/propertyview.js';

export default class PropertyMap
{
  constructor(event){
    this.id = event.object_id;
    this.propertyViewMap = new Map();
    this.handleEvent(event);
    
  }
  
  handleEvent(event) {
    if(event.property in this.propertyViewMap){
      // wenn property bekannt -> dann existiert eine propertyview dazu -> soll die sich darum kümmern
      this.propertyViewMap.get(event.property).handleEvent(event);
    }
    else
    {
      // füge neue property view zur map hinzu
      this.propertyViewMap[event.property] = new PropertyView(event);
    }
  }
}