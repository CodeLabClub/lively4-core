/*MD
# Lively 4 Text Editor

[doc](../../../doc/tools/editor.md)

 - simple load/save/navigate UI, that can be disabled to use elsewhere, e.g. container
 - updates change indicator while when editting,loading, and saving
 
![](lively-editor.png){height=200} 
 
 
We have to many objects called "editor", because they wrap around and FACADE each other.

- (babylonian-programming-editor)
 - lively-editor
   - lively-code-mirror
     - cm CodeMirror object
 
![](../../../doc/figures/editors.drawio)

MD*/

import Strings from "src/client/strings.js"
import Morph from 'src/components/widgets/lively-morph.js'
import moment from "src/external/moment.js"
import diff from 'src/external/diff-match-patch.js'
import components from "src/client/morphic/component-loader.js"
import {pt} from "src/client/graphics.js"
import {getObjectFor, updateEditors} from "utils";
import files from "src/client/files.js"

export default class Editor extends Morph {

  /*MD ## Setup MD*/
  
  async initialize() {
    var container = this.get(".container");
		this.versionControl = this.shadowRoot.querySelector("#versionControl");
    
    var editor = document.createElement("lively-code-mirror")
    editor.id = "editor"; // this is important to do before opening 
    await components.openIn(container, editor);
    editor.setAttribute("overscroll", "contain")
    editor.setAttribute("wrapmode", true)
    editor.setAttribute("tabsize", 2)

    editor.doSave = async (text) => {
      await this.saveFile(); // CTRL+S does not come through...    
    };
    
    
    this.addEventListener("drop", evt => {
      this.onDrop(evt)
    })       
    
    this.get("lively-version-control").editor = editor

    this.registerButtons();
    var input = this.get("#filename");
    
    input.addEventListener("keyup", event => {
      if (event.keyCode == 13) { // ENTER
        this.onFilenameEntered(input.value);
      }
    });
    var url = this.getAttribute("url") 
    if (url) {
      this.setURL(url)
    }
    
    container.dispatchEvent(new Event("initialized"));   
    editor.addEventListener('change', () => {
      this.onTextChanged();
    });
    
    this.addEventListener("paste", evt => this.onPaste(evt))

    
    // wait for CodeMirror for adding custom keys
    await  editor.editorLoaded()
    editor.registerExtraKeys({
      "Alt-P": cm => {
        // lively.notify("toggle widgets")
        this.toggleWidgets();
      },
      
      "Ctrl-Alt-P": cm => {
        // #TODO how can we have custom snippets?
        this.currentEditor().replaceSelection(`\/\*MD MD\*\/`)
        this.currentEditor().execCommand(`goWordLeft`)
      }

    })
  }

  updateChangeIndicator() {
    if (!this.lastText) return;
    var newText = this.currentEditor().getValue();
    if (newText != this.lastText) {
      this.get("#changeIndicator").style.backgroundColor = "rgb(220,30,30)";
      this.textChanged = true;
    } else {
      this.get("#changeIndicator").style.backgroundColor = "rgb(200,200,200)";
      this.textChanged = false;
    }
  }
  
  updateOtherEditors() {
    console.warn('updateEditors')
    const url = this.getURL().toString();
    updateEditors(url, [this]);
  }
  
  updateEditorMode() {
    var url = this.getURL();
    var editorComp = this.get("#editor");
    if (editorComp && editorComp.changeModeForFile) {
      editorComp.changeModeForFile(url.pathname);
    }
  }
  /*MD ## Event Handlers MD*/
  
  onTextChanged() {
    this.updateChangeIndicator();
  }

  onSaveButton() {
    this.saveFile();
  }
  
  onLoadButton() {
    this.loadFile();
  }
  
  onVersionsButton() {
    this.toggleVersions();
  }
  
  onLoadVersionButton() {
    this.loadFile(this.currentVersion());
  }

  onCloseVersionsButton() {
    this.toggleVersions()
  }
  
  
  onPaste(evt) {
    if(this.insertDataTransfer(evt.clipboardData, undefined, true)) {
      evt.stopPropagation()
      evt.preventDefault();
    }
  }
  
  async onBrowse() {
    lively.openBrowser(this.getURLString())
  }
  
  async onDrop(evt) {
    
    if(this.insertDataTransfer(evt.dataTransfer, evt, false)) {
      evt.stopPropagation()
      evt.preventDefault();
    }
  }
  
  /*MD ## Getters/Setters MD*/
  
  getVersionWidget() {
    var myWindow = lively.findWindow(this)
    if (myWindow) {
      var versionControl = myWindow.querySelector("#versionControl")
    }
    return versionControl.get("#versions")  
  }
  
  currentVersion() {
    var selection = this.getVersionWidget().selection;
    if (selection) return selection.version;
  }
  
  async onFilenameEntered() {
    this.setAttribute("url", this.getURLString())
    await this.loadFile();
    this.dispatchEvent(new CustomEvent("url-changed", {detail: { url: this.getURLString() }}));
  }

  getMountURL() {
    return "https://lively4/sys/fs/mount";
  }

  currentEditor() {
    return this.get('#editor').editor;
  }
  
  getURL() {
    return new URL(this.getURLString());
  }

  getURLString() {
    return this.getSubmorph('#filename').value;
  }

  setURL(urlString) {
    if (!urlString) {
      this.getSubmorph("#filename").value = "";
    } else {
      var url = new URL(urlString);
      this.getSubmorph("#filename").value = url.href;
    }
    
    this.dispatchEvent(new CustomEvent("url-changed", {detail: {url: urlString}}))
  }

  setText(text, preserveView) {
    text = text.replace(/\r\n/g, "\n") // code mirror changes it anyway
    this.lastText = text;
    var codeMirror = this.currentEditor();
    var cur = this.getCursor()
    var scroll = this.getScrollInfo()

    
    if (codeMirror) {
      if (!this.isCodeMirror()) {
          var oldRange = this.currentEditor().selection.getRange()
      }

      this.updateChangeIndicator();
      codeMirror.setValue(text);
      if (codeMirror.resize) codeMirror.resize();
      this.updateEditorMode();
      
      this.showEmbeddedWidgets()
      
    } else {
      // Code Mirror
      this.get('#editor').value = text
    }
    
    if (preserveView) {
      this.setScrollInfo(scroll)
      this.setCursor(cur)
      if (!this.isCodeMirror()) {
        this.currentEditor().selection.setRange(oldRange)
      }
    }
    return text
  }
  
  getScrollInfo() {
    if (!this.isCodeMirror()) return 
    return this.withEditorObjectDo(editor => editor.getScrollInfo())
  }
  
  setScrollInfo(info) {
    if (!this.isCodeMirror()) return 
    return this.withEditorObjectDo(editor => editor.scrollTo(info.left, info.top))
  }
  
  getCursor() {
    if (!this.isCodeMirror()) return 
    return this.withEditorObjectDo(editor => editor.getCursor())
  }
  
  setCursor(cur) {
    if (!cur || !this.isCodeMirror()) return 
    return this.withEditorObjectDo(editor => editor.setCursor(cur))
  }  
  
  isCodeMirror() {
    return this.get("#editor").tagName == "LIVELY-CODE-MIRROR"
  }
  
  /*MD ## Get UI Elements MD*/
  
  livelyEditor() {
    return this  
  }
  
  livelyCodeMirror() {
    return this.get('#editor')
  }
  
  // #deprecated
  withEditorObjectDo(func) {
    var editor = this.currentEditor()
    if (editor) {
      return func(editor)
    }    
  }

  // #refactor #generalize?
  async awaitEditor() {
    while(!editor) {
      var editor = this.currentEditor()
      if (!editor) {
        await lively.sleep(10) // busy wait
      }
    }
    return editor
  }

  /*MD ## Files MD*/
  
  async loadFile(version) {
    var url = this.getURL();
    console.log("load " + url);
    this.updateEditorMode();

    var result = await fetch(url, {
      headers: {
        fileversion: version
      }
    }).then( response => {
      // remember the commit hash (or similar version information) if loaded resource
      this.lastVersion = response.headers.get("fileversion");
      // lively.notify("loaded version " + this.lastVersion);
      return response.text();
    }).then((text) => {
       return this.setText(text, true); 
    }, (err) => {
        lively.notify("Could not load file " + url +"\nMaybe next time you are more lucky?");
        return ""
    });
    if (this.postLoadFile) {
      result = await this.postLoadFile(result) // #TODO babylonian programming requires to adapt editor behavior
    }
    return result
  }

  
  async saveFile() {
    var url = this.getURL();
    // console.log("save " + url + "!");
    // console.log("version " + this.latestVersion);
    var data = this.currentEditor().getValue();
    if (this.preSaveFile) {
      data = await this.preSaveFile(data)
    }
  
    var urlString = url.toString();
    if (urlString.match(/\/$/)) {
      return fetch(urlString, {method: 'MKCOL'});
    } else {
      window.LastData = data
      
      var headers = {}
      if (this.lastVersion) {
        headers.lastversion = this.lastVersion
      }
      if (urlString.match(/\.svg$/)) {
        headers['Content-Type'] = 'image/svg+xml'
      }
      
      await fetch(urlString, {
        method: 'PUT', 
        body: data,
        headers: headers
      }).then((response) => {
        // console.log("edited file " + url + " written.");
        var newVersion = response.headers.get("fileversion");
        var conflictVersion = response.headers.get("conflictversion");
        // lively.notify("LAST: " + this.lastVersion + " NEW: " + newVersion + " CONFLICT:" + conflictVersion)
        if (conflictVersion) {
          return this.solveConflic(conflictVersion, newVersion);
        }
        if (newVersion) {
          // lively.notify("new version " + newVersion);
          this.lastVersion = newVersion;
        }
        lively.notify("saved file", url );
        this.lastText = data;
        this.updateChangeIndicator();
        this.updateOtherEditors();
      }, (err) => {
         lively.notify("Could not save file" + url +"\nMaybe next time you are more lucky?");
         throw err;
      }); // don't catch here... so we can get the error later as needed...
    }
  }
  
  /*MD ## Merging MD*/
  
  threeWayMerge(a,b,c) {
    var dmp = new diff.diff_match_patch();
    var diff1 = dmp.diff_main(a, b);
    var diff2 = dmp.diff_main(a, c);
    
    var patch1 = dmp.patch_make(diff1);
    var patch2 = dmp.patch_make(diff2);
    var merge = dmp.patch_apply(patch1.concat(patch2), a);
    // #TODO handle conflicts detected in merge
    return merge[0];
  }

    highlightChanges(otherText) {
    var editor = this.currentEditor();
    var myText = editor.getValue(); // data
    var dmp = new diff.diff_match_patch();
    var d = dmp.diff_main(otherText, myText);
    var index = 0;
    for (var ea of d) {
      var change = ea[0];
      var text = ea[1];
      index = this.highlightChange(change, editor, text, index);
    }
  }  

  highlightChange(change, editor, text, index) {
    if (change != 0) {
      var cm = editor;
      var toPos;
      var backgroundColor;
      let marker;
      let widget = <span>{text}</span>;
      let targetColor = "black";
      if (change == 1) {
        // Added 
        toPos = cm.posFromIndex(index + text.length);
        backgroundColor = "green";
        marker = cm.markText(cm.posFromIndex(index), toPos, { replacedWith: widget });
      } else {
        backgroundColor = "red";
        targetColor = "transparent";
        marker = cm.setBookmark(cm.posFromIndex(index), { widget: widget });
      }
      var animation = widget.animate([{ background: backgroundColor, color: "black" }, { background: "transparent", color: targetColor }], {
        duration: 3000
      });
      animation.onfinish = () => marker.clear();
    } else {

      index += text.length;
    }

    return index;
  }

  
  /*
   * solveConflict
   * use three-way-merge
   */
  async solveConflic(otherVersion, newVersion) {
    var conflictId = `conflic-${otherVersion}-${newVersion}`;
    if (this.solvingConflict == conflictId) {
      lively.error("Sovling conflict stopped", "due to recursion: " + this.solvingConflict);
      return;
    }
    if (this.solvingConflic) {
      lively.warn("Recursive Solving Conflict", "" + this.solvingConflict + " and now: " + conflictId);
      return;
    }

    lively.notify("Solve Conflict between: " + otherVersion + `and ` + newVersion);
    var parentText = this.lastText; // 
    // load from conflict version
    var otherText = await fetch(this.getURL(), {
      headers: { fileversion: otherVersion }
    }).then(r => r.text());
    var myText = this.currentEditor().getValue(); // data

    // #TODO do something when actual conflicts occure?
    var mergedText = this.threeWayMerge(parentText, myText, otherText);
    this.setText(mergedText, true);
    this.highlightChanges(myText);
    this.lastVersion = otherVersion;
    this.solvingConflict = conflictId;
    try {
      // here it can come to infinite recursion....
      await this.saveFile();
    } finally {
      this.solvingConflict = false;
    }
  }
  
  /*MD ## Editor MD*/

  showToolbar() {
    this.getSubmorph("#toolbar").style.display = "";
  }
  
  hideToolbar() {
    this.getSubmorph("#toolbar").style.display = "none";
  }

  toggleVersions() {
    var editor = this.shadowRoot.querySelector("#editor");

    if (this.versionControl.style.display == "block") {
      this.versionControl.remove()
      this.versionControl.style.display = "none";
      if (editor.editView) {
        editor.editView(); // go back into normal editing...
      }
    } else {
      var myWindow = lively.findWindow(this)
      if (myWindow.isWindow) {
        myWindow.get(".window-content").style.overflow = "visible"
      }
      myWindow.appendChild(this.versionControl)
      lively.showElement(this.versionControl)

      this.versionControl.style.display = "block";
      this.versionControl.style.backgroundColor = "gray";
            
      this.versionControl.querySelector("#versions").showVersions(this.getURL());
      lively.setGlobalPosition(this.versionControl, 
        lively.getGlobalPosition(this).addPt(pt(lively.getExtent(this.parentElement).x,0)));
      // we use "parentElement" because the extent of lively-editor is broken #TODO
      lively.setExtent(this.versionControl, pt(400, 500))
      this.versionControl.style.zIndex = 10000;

    }
  }
  
  find(pattern) {
    var editor = this.get('#editor')
    if (editor) {
      editor.find(pattern)
    }
  }
  /*MD ## Copy and Paste MD*/
  
  insertDataTransfer(dataTransfer, evt, generateName) {
    // #CopyAndPaste mild code duplication with #Clipboard 
    
    var items = dataTransfer.items;
    if (items.length> 0) {
      for (var index in items) {
        var item = items[index];
        if (item.kind === 'file') {
          this.pasteFile(item, evt, generateName) 
          return true
        }
        if (item.type == 'lively/element') {
          
          item.getAsString(data => {
            var element = getObjectFor(data)
            if (element.localName == "lively-file") {
              this.pasteDataUrlAs(element.url, 
                                  this.getURLString().replace(/[^/]*$/,"") + element.name, 
                                  element.name, 
                                  evt)
            }
            
            // lively.showElement(element)
          })
          
          return true
        }
      }
    }
  }

  async pasteFile(fileItem, evt, generateName) {
    var editor = this.currentEditor()
    if (!editor) return;
    var file = fileItem.getAsFile();
    if (generateName) {
      var name = "file_" + moment(new Date()).format("YYMMDD_hhmmss")
      var selection = editor.getSelection()
      if (selection.length > 0 ) name = selection;
      var filename = name + "." + fileItem.type.replace(/.*\//,"")
      filename = await lively.prompt("paste as... ", filename)
      
    } else {
      filename = fileItem.getAsFile().name
      if (filename.match(/\.((md)|(txt))/)) return // are handle by code mirror to inline text // #Content vs #Container alt: value vs reference? #Journal
      
    }
    if (!filename) return
    
    var newurl = this.getURLString().replace(/[^/]*$/,"") + filename 
    
    var dataURL = await files.readBlobAsDataURL(file)  
    this.pasteDataUrlAs(dataURL, newurl, filename, evt)
  }
  
  async pasteDataUrlAs(dataURL, newurl, filename, evt) {

    var blob = await fetch(dataURL).then(r => r.blob())
    await files.saveFile(newurl, blob)
    
    this.withEditorObjectDo(editor => {
      var text = encodeURIComponent(filename).replace(/\%2F/g,"/")
      if (this.getURLString().match(/\.md/)) {
        if (files.isVideo(filename)){
          text = `<video autoplay controls><source src="${text}" type="video/mp4"></video>`
        } else if (files.isPicture(filename)){
          text = "![](" + text + ")" // #ContextSpecificBehavior ?  
        } else {
          text = `[${text.replace(/.*\//,"")}](${text})`
          
        }
      }  

      // #Hack... this is ugly... but seems the official way to do it
      if (evt) {
        var coords = editor.coordsChar({
          left:   evt.clientX + window.scrollX,
          top: evt.clientY + window.scrollY
        });
        editor.setSelection(coords)        
      }
      editor.replaceSelection(text, "around")      
    })

    lively.notify("uploaded " + newurl)
    
    var navbar = lively.query(this, "lively-container-navbar")
    if (navbar) navbar.update() 
  }
  
  /*MD ## Widgets MD*/
  
  async showEmbeddedWidgets() {
    var type = files.getEnding(this.getURL())
    var codeMirrorComponent = this.get("lively-code-mirror")
    if (!codeMirrorComponent) return

    if (type == "js") {
      for(let m of Strings.matchAll(/\/\*((?:HTML)|(?:MD))(.*?)\1\*\//, codeMirrorComponent.value)) {
          var widgetName = "div"
          var mode = m[1]
          if (mode == "MD") {
            widgetName = "lively-markdown"
          }
          let cm = codeMirrorComponent.editor,
            // cursorIndex = cm.doc.indexFromPos(cm.getCursor()),
            fromIndex = m.index,
            toIndex = m.index + m[0].length
                           
          // if (cursorIndex > fromIndex && cursorIndex < toIndex) continue;
          var from = cm.posFromIndex(fromIndex)
          var to = cm.posFromIndex(toIndex)
          let widget = await codeMirrorComponent.wrapWidget(widgetName, from, to)
          // widget.style.border = "2px dashed orange "
          widget.classList.add('inline-embedded-widget');
          lively.removeEventListener('widget', widget)
          // widget.style.padding = "5px"
//           lively.addEventListener("context", widget, "contextmenu", evt => {
//             if (!evt.shiftKey) {
//                const menuElements = [
//                 ["edit source", () =>  widget.marker.clear()],
//               ];
//               const menu = new lively.contextmenu(this, menuElements)
//               menu.openIn(document.body, evt, this)
              
//               evt.stopPropagation();
//               evt.preventDefault();
//               return true;
//             }
//           })
        
          if (mode == "MD") {
            await widget.setContent(m[2])    
            let container = lively.query(this, "lively-container")
            if (container) {
              lively.html.fixLinks(widget.shadowRoot.querySelectorAll("[href],[src]"), 
                                    this.getURL().toString().replace(/[^/]*$/,""),
                                    url => container.followPath(url))
            }
          } else {
            widget.innerHTML = m[2]
            let container = lively.query(this, "lively-container")
            if (container) {
              lively.html.fixLinks(widget.querySelectorAll("[href],[src]"), 
                                    this.getURL().toString().replace(/[^/]*$/,""),
                                    url => container.followPath(url))
            }
            
          }
      }
     
    }
  }
  
  async hideEmbeddedWidgets() {
    var codeMirrorComponent = this.get("lively-code-mirror")
    if (!codeMirrorComponent) return
    codeMirrorComponent.editor.doc.getAllMarks()
      .filter(ea => ea.widgetNode && ea.widgetNode.querySelector(".lively-widget")).forEach(ea => ea.clear())
  }
  
  async toggleWidgets() {
    var codeMirrorComponent = this.get("lively-code-mirror")
    if (!codeMirrorComponent) return
    
    var cm = codeMirrorComponent.editor
    var cursorPos = cm.getCursor()
    
    var allWidgets = codeMirrorComponent.editor.doc.getAllMarks()
      .filter(ea => ea.widgetNode && ea.widgetNode.querySelector(".lively-widget"))
    if (allWidgets.length == 0) {
      await this.showEmbeddedWidgets()
    } else {
      await this.hideEmbeddedWidgets()
    }
    
    // scroll back into view...
    // #TODO make it stable...
    // await lively.sleep(1000)
    // cm.setCursor(cursorPos)
    // cm.scrollTo(null, cm.charCoords(cursorPos).top)
  }
  
  /*MD ## Hooks MD*/

  livelyExample() {
    this.setURL(lively4url + "/README.md");
    this.loadFile()
  }
  
  livelyMigrate(obj) {
		if (obj.versionControl) obj.versionControl.remove();
    this.setURL(obj.getURL());
    this.loadFile();
  }
}