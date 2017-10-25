'use strict';

// Livel4 Keyboard shortcuts

// Experiments for more late bound modules... that way the expots won't get frozen!
// idea

// #Duplication with shortcuts.js #TODO

// import lively from "./lively.js"; #TODO does not work anymore...

export default class Keys {

  static getChar(evt) {
    return String.fromCharCode(evt.keyCode || evt.charCode);
  }

  static logEvent(evt) {
    console.log("key: "
      +" shift=" + evt.shiftKey
      +" ctrl=" + evt.ctrlKey
      +" alt=" + evt.altKey
      +" meta=" + evt.metaKey
      +" char=" + this.getChar(evt)
      );
  }

  static getTextSelection() {
    return window.getSelection().toLocaleString()
  }

  static handle(evt) {
    
    // #Hack, fix a little but in ContextMenu movement...
    lively.lastScrollTop = document.scrollingElement.scrollTop;
    lively.lastScrollLeft = document.scrollingElement.scrollLeft;
    
    // lively.showPoint(pt(0,0))
    // lively.notify("handle " + this.getChar(evt) + " " + evt.keyCode  + " "+ evt.charCode, (evt.shiftKey ? " SHIFT" : "") + (evt.ctrlKey ? " CTRL" : ""))
    try {
      var char = this.getChar(evt);
      // this.logEvent(evt)
      
      // TODO refactor it, so that there is only a single place for shortcut definition
      // see /src/client/contextmenu.js and /templates/classes/AceEditor.js
      if ((evt.ctrlKey || evt.metaKey) && char == "K") {
        lively.openWorkspace("");
        evt.preventDefault();
      } else if ((evt.ctrlKey || evt.metaKey) && evt.shiftKey &&char == "F") {
        lively.openSearchWidget(this.getTextSelection());
        evt.preventDefault();
      } else if (evt.shiftKey && (evt.ctrlKey || evt.metaKey) && char == "B") {
        lively.notify("open browser")
        lively.openBrowser(this.getTextSelection());
        evt.preventDefault();
      } else if (evt.shiftKey && (evt.ctrlKey || evt.metaKey) && char == "G") {
        // this does not work up on #Jens' windows machine
        lively.notify("open sync")
        lively.openComponentInWindow("lively-sync");
        evt.preventDefault();
      } else if ((evt.ctrlKey || evt.metaKey) && char == "O") {
        lively.openComponentInWindow("lively-component-bin");
        evt.preventDefault();
      } else if (!evt.shiftKey && (evt.ctrlKey || evt.metaKey) && char == "J") {
        lively.openComponentInWindow("lively-console");
        evt.preventDefault();
      } else if ((evt.ctrlKey || evt.metaKey)  && char == "H") {
        lively.openHelpWindow(this.getTextSelection());
        evt.preventDefault();
      } else if (evt.keyCode == 27) {
        lively.hideSearchWidget();
      }
      
      if ((evt.ctrlKey || evt.metaKey) && char == "D") {
        
        if (evt.path.find(ea => ea.tagName == "LIVELY-CODE-MIRROR")) {
          // lively.notify("codemirror handles itself " )
          return; // code mirror does not stop it's propagation
        }
        let str = window.getSelection().toLocaleString();
        lively.notify("eval: " + str)
        try {
          lively.boundEval(str);
        } catch(e) {
          lively.handleError(e);
        }
        evt.preventDefault();
      }
    } catch (err) {
      console.log("Error in handleKeyEvent" +  err);
    }
  }
}