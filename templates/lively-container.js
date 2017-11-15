import Morph from './Morph.js';
import highlight from 'src/external/highlight.js';
import {pt} from 'src/client/graphics.js';
import halo from 'templates/lively-halo.js';
import ContextMenu from 'src/client/contextmenu.js';
import SyntaxChecker from 'src/client/syntax.js';
import components from "src/client/morphic/component-loader.js";
import * as cop  from "src/external/ContextJS/src/contextjs.js";
import ScopedScripts from "./ScopedScripts.js";
import Clipboard from "src/client/clipboard.js" 
import {debounce} from "utils"

export default class Container extends Morph {

  initialize() {
    // this.shadowRoot.querySelector("livelyStyle").innerHTML = '{color: red}'
    
    // there seems to be no <link ..> tag allowed to reference css inside of templates
    // lively.files.loadFile(lively4url + "/templates/livelystyle.css").then(css => {
    //   this.shadowRoot.querySelector("#livelySt\yle").innerHTML = css
    // })
    this.windowTitle = "Browser";
    if (this.isSearchBrowser) {
      this.windowTitle = "Search Browser";
    }
    
    this.contentChangedDelay = (() => {
        this.checkForContentChanges()
      })::debounce(1000)
    
    // make sure the global css is there...
    lively.loadCSSThroughDOM("hightlight", lively4url + "/src/external/highlight.css");

    lively.addEventListener("Container", this, "mousedown", evt => this.onMouseDown(evt));

    // #TODO continue here, halo selection and container do now work yet
    // var halos = halo.halo && halo.halo[0];
    // if (halos)
    //   halos.registerBodyDragAndDrop(this); // for content selection
    if (this.useBrowserHistory()) {
      window.onpopstate = (event) => {
        var state = event.state;
        if (state && state.followInline) {
          console.log("follow " + state.path);
          this.followPath(state.path);
        }
      };
      var path = lively.preferences.getURLParameter("load");
      var edit = lively.preferences.getURLParameter("edit");
      var fullsreen = lively.preferences.getURLParameter("fullscreen");
      
      // force read mode
      if(this.getAttribute("mode") == "read" && edit) {
        path = edit;
        edit = undefined;
      }
      if (path) {
          this.setPath(path);
      } else if (edit) {
          this.setPath(edit, true).then(() => {
            this.editFile();
          });
      } else {
        if (lively4url.match(/github\.io/)) { 
          this.setPath("/"); // the lively4url is not listable
        } else {
          this.setPath(lively4url +"/");
        }
      }
    } else {
    	var src = this.getAttribute("src");
    	if (src) {
    		this.setPath(src).then(() => {
          if (this.getAttribute("mode") == "edit") {
            this.editFile();
      		}
        });
    	}
    }
    
    // #TODO very ugly... I want to hide that level of JavaScript and just connect "onEnter" of the input field with my code
    var input = this.get("#container-path");
    $(input).keyup(event => {
      if (event.keyCode == 13) { // ENTER
        this.onPathEntered(input.value);
      }
    });
    this.get("#fullscreenInline").onclick = (e) => this.onFullscreen(e);
    
    lively.html.registerButtons(this);

    this.addEventListener('contextmenu',  evt => this.onContextMenu(evt), false);
    // this.addEventListener('keyup',   evt => this.onKeyUp(evt));
    this.addEventListener('keydown',   evt => this.onKeyDown(evt));
    this.setAttribute("tabindex", 0);
    this.hideCancelAndSave();
    
    if(this.getAttribute("controls") =="hidden" || fullsreen) {
      this.hideControls()
    }
    
    this.withAttributeDo("leftpane-flex", value => 
      this.get("#container-leftpane").style.flex = value)
    this.withAttributeDo("rightpane-flex", value => 
      this.get("#container-rightpane").style.flex = value)

  }
 
  onContextMenu(evt) {
    // fall back to system context menu if shift pressed
    if (!evt.shiftKey) { 
      evt.preventDefault();
      var worldContext = document.body; // default to opening context menu content globally
      // opening in the content makes only save if that content could be persisted and is displayed
      if (this.contentIsEditable() && !this.isEditing()) {
        worldContext = this
      }
      
	    lively.openContextMenu(document.body, evt, undefined, worldContext);
	    return false;
    } 
  }
  
  onFullscreen(evt) {
    this.toggleControls();
    if (!this.parentElement.isMaximized) return;
    if ((this.isFullscreen() && !this.parentElement.isMaximized()) ||
       (!this.isFullscreen() && this.parentElement.isMaximized()))  {
        this.parentElement.toggleMaximize();
        if ( this.parentElement.isMaximized()) {
          this.parentElement.get(".window-titlebar").style.display = "none"
        } else {
          this.parentElement.get(".window-titlebar").style.display = ""
        }
    }
    

  }
    
  useBrowserHistory() {
    return this.getAttribute("load") == "auto";
  }  

  hideCancelAndSave() {
    _.each(this.shadowRoot.querySelectorAll(".edit"), (ea) => {
      ea.style.visibility = "hidden";
      ea.style.display = "none";
    });
    _.each(this.shadowRoot.querySelectorAll(".browse"), (ea) => {
      ea.style.visibility = "visible";
      ea.style.display = "inline-block";
    });
  }

  showCancelAndSave() {
    _.each(this.shadowRoot.querySelectorAll(".browse"), (ea) => {
      ea.style.visibility = "hidden";
      ea.style.display = "none";
    });
    _.each(this.shadowRoot.querySelectorAll(".edit"), (ea) => {
      ea.style.visibility = "visible";
      ea.style.display = "inline-block";
    });

  }
  
  history() {
    if (!this._history) this._history = [];
    return this._history;
  }

  forwardHistory() {
    if (!this._forwardHistory) this._forwardHistory = [];
    return this._forwardHistory;
  }

  onKeyDown(evt) {
    var char = String.fromCharCode(evt.keyCode || evt.charCode);
    if ((evt.ctrlKey || evt.metaKey /* metaKey = cmd key on Mac */) && char == "S") {
      if (evt.shiftKey) {
        this.onAccept();          
      } else {
        this.onSave();  
      }
      evt.preventDefault();
      evt.stopPropagation();
    }
  }

  reloadModule(url) {
    var urlString = url.toString()
    lively.unloadModule(urlString)
    return System.import(urlString).then( m => {
        this.shadowRoot.querySelector("#live").disabled =false;
        lively.notify({
          title: "Loaded " + url, color: "green"});
        this.resetLoadingFailed();
      }, error => {
        this.loadingFailed(url.toString().replace(/.*\//,""), error);
      });
  }

  async loadTestModule(url) {
    var testRunner = document.body.querySelector("lively-testrunner");
    if (testRunner) {
      console.group("run test: " + this.getPath());
      testRunner.clearTests();
      await this.reloadModule(url.toString())
      testRunner.runTests();
    } else {
      lively.notify("no rest-runner to run " + url.toString().replace(/.*\//,""));
    }
  }
  
  loadModule(url) {
    lively.reloadModule("" + url).then(module => {
      lively.notify("","Module " + url + " reloaded!", 3, null, "green");
      
      this.resetLoadingFailed();
    }, err => {
      this.loadingFailed(url, err);
    });
  }
  
  resetLoadingFailed() {
    // that.resetLoadingFailed()
    // System.import(urlString)
    var urlString = this.getURL().toString();
    
    // #TODO #babel6refactoring
    if (lively.modules) {
      if (urlString.match(/\.js$/)) {
        var m = lively.modules.module(urlString);
        this.get("#live").disabled = !m.isLoaded();
      }
    }
    this.lastLoadingFailed = false;
    var b = this.get("#apply"); if (b) b.style.border = "";

  }
  
  loadingFailed(moduleName, err) {
    this.lastLoadingFailed = err;
    this.get("#live").disabled = true;
    this.get("#apply").style.border = "2px solid red";

    lively.notify({
      title: "Error loading module " + moduleName,
      text:  err.toString().slice(0,200),
      color: "red",
      details: err});
    console.error(err);
  }

  async openTemplateInstance(url) {
      var name = url.toString().replace(/.*\//,"").replace(/\.((html)|(js))$/,"");
      var comp = await lively.openComponentInWindow(name);
      if (comp.livelyExample) comp.livelyExample(); // fill in with example content
  }

  onApply() {
    var url = this.getURL().toString();
    if (url.match(/templates\/.*\.(html)|(js)$/)) {
      this.openTemplateInstance(url);
    } else if (url.match(/\.js$/))  {
      this.reloadModule(url);
    } else {
      lively.openBrowser(url);
    }
  }

  onHome() {
    this.followPath(lively4url)
  }
  
  async onSync(evt) {
    var comp = lively.components.createComponent("lively-sync");
    var compWindow;
    lively.components.openInWindow(comp).then((w) => {
      compWindow = w;
      lively.setPosition(w, lively.pt(100, 100));
    });
  
    var serverURL = lively4url.match(/(.*)\/([^\/]+$)/)[1];
    comp.setServerURL(serverURL);
    console.log("server url: " + serverURL);
    if (!this.getPath().match(serverURL)) {
      return lively.notify("can only sync on our repositories");
    }
    var repo =  this.getPath().replace(serverURL +"/", "").replace(/\/.*/,"");
    comp.setRepository(repo);
    comp.sync();
    // .then(() => compWindow.remove())
  }


  onPathEntered(path) {
    this.followPath(path);
  }
    

  onEdit() {
    this.setAttribute("mode", "edit");
    this.showCancelAndSave();
    this.editFile();
  }

  onCancel() {
    if (this.unsavedChanges()) { 
      if (!confirm("There are unsaved changes. Discard them?")) {
        return;
      }
    }
    this.setAttribute("mode", "show");
    this.setPath(this.getPath());
    this.hideCancelAndSave();

  }

  onUp() {
    var path = this.getPath();
    if (path.match(/index\.((html)|(md))/))
      // one level more
      this.followPath(path.replace(/(\/[^/]+\/[^/]+$)|([^/]+\/$)/,"/"));
    else
      this.followPath(path.replace(/(\/[^/]+$)|([^/]+\/$)/,"/"));
  }

  onBack() {
    if (this.history().length < 2) {
      lively.notify("No history to go back!");
      return;
    }
    var url = this.history().pop();
    var last = _.last(this.history());
    // lively.notify("follow " + url)
    this.forwardHistory().push(url);
    this.followPath(last);
  }
  
  onMouseDown(evt) {
    if (halo.halo && halo.halo[0])
      halo.halo[0].onBodyMouseDown(evt, this);
    evt.stopPropagation();
    // evt.preventDefault();
    Clipboard.onBodyMouseDown(evt)
    
  }
  
  onForward() {
    var url = this.forwardHistory().pop();
    if (url) {
      this.followPath(url);
    } else {
      lively.notify("Could not navigate forward");
    }
  }

  async onBrowse() {
    var url = this.getURL();
    var comp = await lively.openComponentInWindow("lively-container");
    comp.editFile("" + url);
  }

  async onSaveAs() {
    var newPath = await lively.prompt("Save as..", this.getPath())
    if (newPath === undefined) return;
    
    if (!this.isEditing()) {
      lively.notify("save as " + newPath)
      var result = await fetch(newPath, {
        method: "get"
      })
      this.lastVersion = result.headers.get("fileversion")
      
      this.saveEditsInView(newPath);
      
      
      this.get("#container-path").value = newPath
      return; 
    }
    lively.notify("Save as... in EditMode not implemented yet");
  }

  onSave(doNotQuit) {
    if (!this.isEditing()) {
      this.saveEditsInView();
      return; 
    }
    
    if (this.getPath().match(/\/$/)) {
      lively.files.saveFile(this.getURL(),"");
      return;
    }
    this.get("#editor").setURL(this.getURL());
    
    return this.get("#editor").saveFile().then( async () => {
      var sourceCode = this.get("#editor").currentEditor().getValue();
      if (this.getPath().match(/templates\/.*html/)) {
        lively.updateTemplate(sourceCode);
      }
      var url = this.getURL();
      
      
      if (this.getPath().match(/.*css/)) {
        this.updateCSS();
      }
      
      this.updateOtherContainers();
      
    
      var moduleName = this.getURL().pathname.match(/([^/]+)\.js$/);
      if (moduleName) {
        moduleName = moduleName[1];
        
        if (this.lastLoadingFailed) {
          this.reloadModule(url); // use our own mechanism...
        } else if (this.getPath().match(/test\/.*js/)) {
          this.loadTestModule(url); 
        } else if ((this.get("#live").checked && !this.get("#live").disabled)) {
          await this.loadModule("" + url)
          
          
          lively.findDependedModules("" + url).forEach(ea => {
            if (ea.match(/test\/.*js/)) {
              this.loadTestModule(ea); 
            } 
          })
        }
        
        
      }
    }).then(() => this.showNavbar());
  }
  
  updateCSS() {
    var url = "" + this.getURL()
    // lively.notify("update " + url)
    // var url = "https://lively-kernel.org/lively4/lively4-jens/src/client/lively.css"
    var style = document.head.querySelector('link[href="'+ url  + '"]')
    if (style && style.id) {
      lively.notify("reload " + style.id)
      lively.loadCSSThroughDOM(style.id, url)
    }
  }

  updateOtherContainers() {
    var url = "" + this.getURL();
    document.body.querySelectorAll('lively-container').forEach(ea => {
      if (ea !== this && !ea.isEditing() 
        && ("" +ea.getURL()).match(url.replace(/\.[^.]+$/,""))) {
        console.log("update container content: " + ea);
        ea.setPath(ea.getURL() + "");
      }  
    });
  }

  onDelete() {
    var url = this.getURL() +"";
    this.deleteFile(url)
  }
  
  async deleteFile(url) {
    if (await lively.confirm("delete " + url)) {
      var result = await fetch(url, {method: 'DELETE'})
        .then(r => r.text());
        
      this.setAttribute("mode", "show");
      this.setPath(url.replace(/\/$/, "").replace(/[^/]*$/, ""));
      this.hideCancelAndSave();

      lively.notify("deleted " + url, result);
    } 
  }

  async renameFile(url) {
    url = "" + url
    var newURL = await lively.prompt("rename", url)
    if (newURL != url) {
      var content = await fetch(url).then(r => r.blob())


      // first, save the content...
      var putResponse = await fetch(newURL, {
        method: 'PUT',
        body: content
      })
      
      if (putResponse.status !== 200) {
        lively.confirm("could not rename to " + newURL)
        return 
      }

      // ok, lets be crazy... we first delete
      var delResponse = await fetch(url, {method: 'DELETE'})
      if (delResponse.status !== 200) {
        lively.notify("could not properly delete " + url, await delResponse.text())
      }

      var getResponse = await fetch(newURL)
      if (getResponse.status !== 200) {
        lively.notify("save again, because we might need to...")
        var putAgainResponse = await fetch(newURL, {
          method: 'PUT',
          body: content
        })
        return 
      }
  
      

      
      
      this.setAttribute("mode", "show");
      this.setPath(url.replace(/\/$/, "").replace(/[^/]*$/, ""));
      this.hideCancelAndSave();

      lively.notify("deleted " + url);
    } 
  }

  
  onNewfile() {
    this.newfile(this.getPath())
  }
  
  async newfile(path) {
    var fileName = window.prompt('Please enter the name of the file', path);
    if (!fileName) {
      lively.notify("no file created");
      return;
    }
    await lively.files.saveFile(fileName,"");
    lively.notify("created " + fileName);
    this.setAttribute("mode", "edit");
    this.showCancelAndSave();
    
    this.followPath(fileName);
  }
  
  async onNewdirectory() {
    var fileName = window.prompt('Please enter the name of the directory', this.getPath());
    if (!fileName) {
      lively.notify("no file created");
      return;
    }
    await fetch(fileName, {method: 'MKCOL'});
    lively.notify("created " + fileName);
    this.followPath(fileName);
  }


  onVersions() {
    this.get("#editor").toggleVersions();
  }

  onAccept() {
    this.onSave().then((sourceCode) => {
      this.setAttribute("mode", "show");
      this.setPath(this.getPath());
      this.hideCancelAndSave();
    });
  }

  clear() {
    this.getContentRoot().innerHTML = '';
    Array.from(this.get('#container-content').childNodes)
      .filter( ea => ea.id !== "container-root")
      .forEach(ea => ea.remove());
    this.get('#container-editor').innerHTML = '';
  }
  
  async appendMarkdown(content) {
    var md = document.createElement("lively-markdown")
    await components.openIn(this, md)
    md.getDir = this.getDir.bind(this);
    md.followPath = this.followPath.bind(this);
    await md.setContent(content)
    if (this.getAttribute("mode") == "presentation") {
      var presentation = await md.startPresentation()
      if (this.lastPage) {
        presentation.gotoSlideAt(this.lastPage)
      }
    }
    if (this.wasContentEditable) {
      md.contentEditable = true  
    }
    
    // get around some async fun
    if (this.preserveContentScroll) {
      this.get("#container-content").scrollTop = this.preserveContentScroll
      delete this.preserveContentScroll
    }
  }

  appendLivelyMD(content) {
    content = content.replace(/@World.*/g,"");
    content = content.replace(/@+Text: name="Title".*\n/g,"# ");
    content = content.replace(/@+Text: name="Text.*\n/g,"\n");
    content = content.replace(/@+Text: name="Content.*\n/g,"\n");
    content = content.replace(/@+Box: name="SteppingWordCounter".*\n/g,"\n");
    content = content.replace(/@+Text: name="MetaNoteText".*\n(.*)\n\n/g,  "<i style='color:orange'>$1</i>\n\n");
    content = content.replace(/@+Text: name="WordsText".*\n.*/g,"\n");

    this.appendMarkdown(content);
  }
  
  appendScript(scriptElement) {
    // #IDEA by instanciating we can avoid global (de-)activation collisions
    // Scenario (A) There should be no activation conflict in this case, because appendScript wait on each other...
    // Scenario (B)  #TODO opening a page on two licely-containers at the same time will produce such a conflict. 
    // #DRAFT instead of using ScopedScripts as a singleton, we should instanciate it. 
    var layers = ScopedScripts.layers(this.getURL(), this.getContentRoot());
    ScopedScripts.openPromises = [];  
    return new Promise((resolve, reject)=> {
      var root = this.getContentRoot();
      var script   = document.createElement("script");
      script.type  = "text/javascript";
      
      layers.forEach( ea => ea.beGlobal());

      if (scriptElement.src) {
        script.src  = scriptElement.src;
        script.onload = () => {
          // #WIP multiple activations are not covered.... through this...
          Promise.all(ScopedScripts.openPromises).then( () => {
            layers.forEach( ea => ea.beNotGlobal());
            // console.log("ScopedScripts openPromises: " + ScopedScripts.openPromises)
            resolve();
          }, () => {
            // error
            reject();
          });
        };
        script.onerror = reject; 
      }
      script.text  = scriptElement.textContent;
      
      cop.withLayers(layers, () => {
        root.appendChild(script);  
      });
      if (!script.src) {
        Promise.all(ScopedScripts.openPromises).then( () => {
          layers.forEach( ea => ea.beNotGlobal());
          // console.log("ScopedScripts openPromises: " + ScopedScripts.openPromises)
          resolve();
        }, () => {
          // error
          reject();
        });
      }
    })
    
  }

  async appendHtml(content) {
    // strip lively boot code... 
    
    // content = content.replace(/\<\!-- BEGIN SYSTEM\.JS(.|\n)*\<\!-- END SYSTEM.JS--\>/,"");
    // content = content.replace(/\<\!-- BEGIN LIVELY BOOT(.|\n)*\<\!-- END LIVELY BOOT --\>/,"");
    
    if (content.match("<template") && this.getPath().match("html$")) {
      
      content = "<pre><code> " + content.replace(/</g,"&lt;") +"</code></pre>"
    }
    
    
    if (content.match(/<script src=".*d3\.v3(.min)?\.js".*>/)) {
      if (!window.d3) {
        console.log("LOAD D3");
        // #TODO check if dealing with this D3 is covered now through our general approach...
        await lively.loadJavaScriptThroughDOM("d3", "src/external/d3.v3.js");
      }
    
      if (!window.ScopedD3) {
        console.log("LOAD D3 Adaption Layer");
        await System.import("templates/ContainerScopedD3.js")
        ScopedD3.updateCurrentBodyAndURLFrom(this);
        // return this.appendHtml(content) // try again
      }
    }

    if (content.match(/<script src=".*cola(\.min)?\.js".*>/)) {
        console.log("LOAD Cola");
        await lively.loadJavaScriptThroughDOM("cola", "src/external/cola.js")
    }
    
    //  var content = this.sourceContent
    try {
      var root = this.getContentRoot();
      var nodes = $.parseHTML(content, document, true);
      if (nodes[0] && nodes[0].localName == 'template') {
      	// lively.notify("append template " + nodes[0].id);
		    return this.appendTemplate(nodes[0].id);
      }
      lively.html.fixLinks(nodes, this.getDir(),
        (path) => this.followPath(path));
      for(var ea of nodes) {
        if (ea && ea.tagName == "SCRIPT") {
          await this.appendScript(ea);
        } else {
          root.appendChild(ea);
          if (ea.querySelectorAll) {
            for(var block of ea.querySelectorAll("pre code")) {
              highlight.highlightBlock(block);
            }
          }
        }
        components.loadUnresolved(root);
      }
    } catch(e) {
      console.log("Could not append html:" + content.slice(0,200) +"..." +" ERROR:", e);
    }
    
    // get around some async fun
    if (this.preserveContentScroll) {
       this.get("#container-content").scrollTop = this.preserveContentScroll
      delete this.preserveContentScroll
    }
    setTimeout(() => {
      this.resetContentChanges()
      this.observeHTMLChanges()
    }, 0)
  }
  
  appendTemplate(name) {
    try {
    	var node = lively.components.createComponent(name);
    	this.getContentRoot().appendChild(node);
      lively.components.loadByName(name);
    } catch(e) {
      console.log("Could not append html:" + content);
    }
  }
  
  async followPath(path) {
    if (this.unsavedChanges()) {
      if (!window.confirm("You will lose unsaved changes, continue anyway?")) {
        return;
      }
    } 
    
    var m = path.match(/start\.html\?load=(.*)/);
    if (m) {
      return this.followPath(m[1]);
    }
  
    // this check could happen later
    if (!path.match("https://lively4") && !path.match(window.location.host)) {
      // lively.notify("follow foreign url: " + path);
      var startTime = Date.now();
      if (!await fetch(path, {method: "OPTIONS"}).catch(e => false)) {
        return window.open(path);
      }
    }

    if (_.last(this.history()) !== path)
      this.history().push(path);
      
    var opts = ""
    if (this.useBrowserHistory() && this.isFullscreen()) {
      opts="&fullscreen=true"
    }
    
    if (this.isEditing() && !path.match(/\/$/)) {
      if (this.useBrowserHistory())
        window.history.pushState({ followInline: true, path: path }, 'view ' + path, window.location.pathname + "?edit="+path  + opts);
      return this.setPath(path, true).then(() => this.editFile());
    } else {
      if (this.useBrowserHistory())
        window.history.pushState({ followInline: true, path: path }, 'view ' + path, window.location.pathname + "?load="+path  + opts);
      // #TODO replace this with a dynamic fetch
      return this.setPath(path);
    }
  }

  isEditing() {
    return this.getAttribute("mode") == "edit";
  }

  getContentRoot() {
    // #Design #Lively4 The container should hide all its contents. The styles defined here should not affect others. 
    // return this.get('#container-root');
    
    // #BUT #TODO Blockly and connectors just work globally...
    return this;
  }

  getDir() {
    return this.getPath().replace(/[^/]*$/,"");
  }

  getURL() {
    var path = this.getPath();
    if (path && path.match(/^https?:\/\//)) {
      return new URL(path);
    } else {
      return new URL("https://lively4/" + path);
    }
  }

  getPath() {
    return this.shadowRoot.querySelector("#container-path").value;
  }

  getEditor() {
    var container = this.get('#container-editor');
    var editor = container.querySelector("lively-editor");
    if (editor) return Promise.resolve(editor);
    // console.log("[container] create editor")
    editor = lively.components.createComponent("lively-editor");
    editor.id = "editor";
    return lively.components.openIn(container, editor).then( async () => {
      editor.hideToolbar();
      var aceComp = editor.get('#editor');
      if (!aceComp) throw new Error("Could not initialalize lively-editor");
      if (aceComp.tagName == "LIVELY-CODE-MIRROR") {
         await new Promise(resolve => {
          aceComp.addEventListener("editor-loaded", () => {
            resolve()
          })            
        })
      }

      aceComp.enableAutocompletion();
      aceComp.getDoitContext = () => {
        return window.that;
      };
      // aceComp.getDoitContextModuleUrl = () => {
      //   return this.getURL()
      // }
      if (aceComp.aceRequire) { 
        aceComp.aceRequire('ace/ext/searchbox');
      }
      aceComp.doSave = text => {
        if (aceComp.tagName !== "LIVELY-CODE-MIRROR") {
        	this.onSave(); // CTRL+S does not come through... 
        } 
      };
      return editor;
    });
  }

  getAceEditor() {
    var livelyEditor = this.get('lively-editor');
    if (!livelyEditor) return;
    return livelyEditor.get('#editor');
  }
  
  // #TODO replace this with asyncGet
  async realAceEditor() {
    return new Promise(resolve => {
      var checkForEditor = () => {
        var editor = this.getAceEditor();
        if (editor && editor.editor) {
          resolve(editor.editor);
        } else {
          setTimeout(() => {
            checkForEditor();
          },100);
        }
      };
      checkForEditor();
    });
  }
  
  thumbnailFor(url, name) {
    if (name.match(/\.((png)|(jpe?g))$/))
      return "<img class='thumbnail' src='" + name +"'>";
    else
      return "";    
  }
  
  listingForDirectory(url, render) {
    return lively.files.statFile(url).then((content) => {
      var files = JSON.parse(content).contents;
      var index = _.find(files, (ea) => ea.name.match(/^index\.md$/i));
      if (!index) index = _.find(files, (ea) => ea.name.match(/^index\.html$/i));
      if (index) { 
        return this.setPath(url + "/" + index.name) ;
      }
      // return Promise.resolve(""); // DISABLE Listings
      
      this.sourceContent = content;
      
      var fileBrowser = document.createElement("lively-file-browser");
      /* DEV
        fileBrowser = that.querySelector("lively-file-browser")
        url = "https://lively-kernel.org/lively4/"
       */
      if (render) {
        return lively.components.openIn(this.getContentRoot(), fileBrowser).then( () => {
          // lively.notify("set url " + url)
          fileBrowser.hideToolbar();
          // override browsing file and direcotry
          fileBrowser.setMainAction((newURL) => {
            // lively.notify("go " + newURL)
            this.followPath(newURL.toString());
          });
          fileBrowser.setMainDirectoryAction((newURL) => {
            // lively.notify("go dir " + newURL)
            this.followPath(newURL.toString() + "/");
          });
          fileBrowser.setURL(url);
        });
      } else {
        return ;
      }
    }).catch(function(err){
      console.log("Error: ", err);
      lively.notify("ERROR: Could not set path: " + url,  "because of: ",  err);
    });
  }
  
  async setPath(path, donotrender) {
    this.get('#container-content').style.display = "block";
    this.get('#container-editor').style.display = "none";
    this.windowTitle = path.replace(/.*\//,"")
    if (!path) {
        path = "";
    }
	  var isdir= path.match(/.\/$/);

    var url;
    if (path.match(/^https?:\/\//)) {
      url = new URL(path);
      url.pathname = lively.paths.normalize(url.pathname);
      path = "" + url;
    } else {
      path = lively.paths.normalize(path);
      url = "https://lively4" + path
    }
    if (!isdir) {
      // check if our file is a directory
      var options = await fetch(url, {method: "OPTIONS"}).then(r =>  r.json()).catch(e => {})
      if (options && options.type == "directory") {
        isdir = true
      }
    }
    path =  path + (isdir ? "/" : "");

    var container=  this.get('#container-content');
    // don't scroll away whe reloading the same url
    if (this.getPath() == path) {
      this.preserveContentScroll = this.get("#container-content").scrollTop;
    }
    
    var markdown = this.get("lively-markdown")
    if (markdown) {      
      var presentation = markdown.get("lively-presentation")
      if (presentation) {
        this.lastPage  = presentation.currentSlideNumber()
      }
      
      this.wasContentEditable = markdown.contentEditable == "true"
    }
    
    
	  this.setAttribute("src", path);
    this.clear();
    this.get('#container-path').value = path.replace(/\%20/g, " ");
    container.style.overflow = "auto";

    url = this.getURL();
    
    this.showNavbar();
    // console.log("set url: " + url);
    this.sourceContent = "NOT EDITABLE";
    var render = !donotrender;
    // Handling directories
    
    if (isdir) {
      // return new Promise((resolve) => { resolve("") });
      return this.listingForDirectory(url, render)
    }
    // Handling files
    this.lastVersion = null; // just to be sure
    
    var format = path.replace(/.*\./,"");
    if (format.match(/(png)|(jpe?g)/)) {
      if (render) return this.appendHtml("<img style='max-width:100%; max-height:100%' src='" + url +"'>");
      else return;
    } else if (format.match(/(ogm)|(m4v)|(mp4)|(avi)|(mpe?g)|(mkv)/)) {
      if (render) return this.appendHtml('<lively-movie src="' + url +'"></lively-movie>');
      else return;
    } else if (format == "pdf") {
      if (render) return this.appendHtml('<lively-pdf overflow="visible" src="'
        + url +'"></lively-pdf>');
      else return;
    }
  
    return fetch(url).then( resp => {
      this.lastVersion = resp.headers.get("fileversion");
      return resp.text();
    }).then((content) => {
      if (format == "html")  {
        this.sourceContent = content;
        if (render) return this.appendHtml(content);
      } else if (format == "md") {
        this.sourceContent = content;
        if (render) return this.appendMarkdown(content);
      } else if (format == "livelymd") {
        this.sourceContent = content;
        if (render) return this.appendLivelyMD(content);
      } else {
        this.sourceContent = content;
        if (render) return this.appendHtml("<pre><code>" + content.replace(/</g, "&st;") +"</code></pre>");
      }
    }).then(() => {
      this.dispatchEvent(new CustomEvent("path-changed", {url: this.getURL()}));
    })
    .catch(function(err){
      console.log("Error: ", err);
      lively.notify("ERROR: Could not set path: " + path,  "because of: ", err);
    });
  }

  navigateToName(name) {
    // lively.notify("navigate to " + name);
    this.getAceEditor().find(name);
  }

  clearNavbar() {
    var container = this.get('#container-leftpane');
    container.clear()
    return container;
  }
  
  hideNavbar() {
    this.get('lively-separator').onClick()
  }

  async showNavbar() {
    // this.get('#container-leftpane').style.display = "block";
    // this.get('lively-separator').style.display = "block";
    
    var navbar = this.get('#container-leftpane')
    // implement hooks
    navbar.deleteFile = (url) => { this.deleteFile(url) } 
    navbar.renameFile = (url) => { this.renameFile(url) } 
    navbar.newfile = (url) => { this.newfile(url) } 
    navbar.followPath = (path) => { this.followPath(path) } 
    navbar.navigateToName = (name) => { this.navigateToName(name) } 
    
    await navbar.show(this.getURL(), this.sourceContent)
    
    if (this.isEditing()) {
      this.get('#container-leftpane').showSublist()
    }
  }
  
  isFullscreen() {
    return this.get("#container-navigation").style.display  == "none"
  }
  
  toggleControls() {
    var showsControls = this.get("#container-navigation").style.display  == "none"
    if (showsControls) {
      this.showControls();
    } else {
      this.hideControls();
    }
    // remember the toggle fullscreen in the url parameters
    var path = this.getPath()
    if (this.useBrowserHistory()) {
      window.history.pushState({ followInline: true, path: path }, 'view ' + path, window.location.pathname + "?edit=" + path  + "&fullscreen=" + !showsControls);  
    }
  }
  
  hideControls() {
    this.setAttribute("controls","hidden")
    this.get("#fullscreenInline").style.display = "block"
    this.get("#container-navigation").style.display  = "none";
    this.get("#container-leftpane").style.display  = "none";
    this.get("lively-separator").style.display  = "none";
  }
  
  showControls() {    this.getAttribute("controls")
    this.setAttribute("controls","shown")
    this.get("#fullscreenInline").style.display = "none"
    this.get("#container-navigation").style.display  = "";
    this.get("#container-leftpane").style.display  = "";
    this.get("lively-separator").style.display  = "";
  }
  
  
  editFile(path) {
    // console.log("[container ] editFile " + path)
    this.setAttribute("mode","edit"); // make it persistent
    return (path ? this.setPath(path, true /* do not render */) : Promise.resolve()).then( () => {
      this.clear();
      var containerContent=  this.get('#container-content');
      containerContent.style.display = "none";
      var containerEditor =  this.get('#container-editor');
      containerEditor.style.display = "block";

      var urlString = this.getURL().toString();
      this.resetLoadingFailed();

      this.showNavbar();
      
      return this.getEditor().then(livelyEditor => {
        var aceComp = livelyEditor.get('#editor');
        
        aceComp.addEventListener("change", evt => this.onTextChanged(evt))
        
        var url = this.getURL();
        livelyEditor.setURL(url);
      
        if (aceComp.editor && aceComp.editor.session) {
          aceComp.editor.session.setOptions({
      			mode: "ace/mode/javascript",
          	tabSize: 2,
          	useSoftTabs: true
      		});
        }
      	aceComp.changeModeForFile(url.pathname);

        // NOTE: we don't user loadFile directly... because we don't want to edit PNG binaries etc...
        livelyEditor.setText(this.sourceContent); // directly setting the source we got
        
        if (aceComp.editor) {
          if (!aceComp.tagName == "LIVELY-CODE-MIRROR") {
            aceComp.editor.selection.moveCursorTo(0,0);
            var lineWidth = 100
            aceComp.editor.session.setWrapLimit(lineWidth);
            aceComp.editor.renderer.setPrintMarginColumn(lineWidth)
          }
        }
        
        livelyEditor.lastVersion = this.lastVersion;
        this.showCancelAndSave();
    
        if ((""+url).match(/\.js$/)) {
          aceComp.setTargetModule("" + url); // for editing
        }
        // livelyEditor.loadFile() // ALT: Load the file again?
      });
    });
  }

  getHTMLSource() {
    this.querySelectorAll("*").forEach( ea => {
      if (ea.livelyPrepareSave) 
        ea.livelyPrepareSave();
    });
    return this.getContentRoot().innerHTML
  }
  
  saveSource(url, source) {
    return this.getEditor().then( editor => {
      editor.setURL(url);
      editor.setText(source);
      editor.lastVersion = this.lastVersion;
      editor.saveFile().then( () => {
        this.lastVersion = editor.lastVersion
        // #TODO we should update here after conflict resolution?
        this.updateOtherContainers()
      }).then(() => {
        this.resetContentChanges()
        lively.notify("saved content!")        
      })
    });
    
  }

  async saveHTML(url) {
    return this.saveSource(url, this.getHTMLSource());
  }
  
  async saveMarkdown(url) {
    var source = await this.get("lively-markdown").htmlAsMarkdownSource()
    return this.saveSource(url, source);
  }
  
  saveEditsInView(url) {
    url = (url || this.getURL()).toString();
    if (url.match(/template.*\.html$/)) {
        return lively.notify("Editing templates in View not supported yet!");
    } else if (url.match(/\.html$/)) {
      this.saveHTML(new URL(url)).then( () => {
        // lively.notify({
        //   title: "saved HTML",
        //   color: "green"});
       });
    } else if (url.match(/\.md$/)) {
      this.saveMarkdown(new URL(url)).then( () => {
        // lively.notify({
        //   title: "saved HTML",
        //   color: "green"});
       });
    } else {
      lively.notify("Editing in view not supported for the content type!");
    }
    
  }
  
  unsavedChanges() {
    var editor = this.get("#editor");
    if (!editor) return this.contentChanged;
    return  editor.textChanged;
  }
  
  
  
  // make a gloval position relative, so it can be used in local content
  localizePosition(pos) {
    var offsetBounds = this.get('#container-content').getBoundingClientRect();
    return pos.subPt(pt(offsetBounds.left, offsetBounds.top));
  }
  
  // let's do it the hard way
  asyncGet(selector, maxtime) {
    maxtime = maxtime || 10000;
    var startTime = Date.now();
    return new Promise((resolve, reject) => {
      var check = () => {
        var found = this.get(selector);
        if (found) resolve(found);
        else if (Date.now() - startTime > maxtime) reject();
        else setTimeout(check, 100);
      };
      check();
    });
  }
  
  async onTextChanged() {
    if (!this.getURL().pathname.match(/\.js$/)) {
      return
    }
  }
  
 
  
  onMutation(mutations, observer) {
    if (this.isPersisting) return // we mutate while persisting 
    
    mutations.forEach(record => {
      
      var indicator = this.get("#changeIndicator")
      if (indicator ) {
        indicator.style.backgroundColor = "rgb(250,250,0)";
      }
      
      // if (record.target.id == 'console'
      //     || record.target.id == 'editor') return;
     
      this.contentChangedDelay()

      // let shouldSave = true;
      if (record.type == 'childList') {
      //     let addedNodes = [...record.addedNodes],
      //         removedNodes = [...record.removedNodes],
      //         nodes = addedNodes.concat(removedNodes);
  
      //     //removed nodes never have a parent, so remeber orphans when they are created
      //     for (let node of addedNodes) {
      //         if (hasParentTag(node) == false) {
      //             orphans.add(node);
      //         }
      //     }
  
      //     // shouldSave = hasNoDonotpersistFlagInherited(addedNodes) || checkRemovedNodes(removedNodes, orphans);
  
      //     //remove removed orphan nodes from orphan set
      //     for (let node of removedNodes) {
      //         if (orphans.has(node)) {
      //             orphans.delete(node);
      //         }
      //     }
      }
      else if (record.type == 'attributes'
          || record.type == 'characterData') {
          
      
          // shouldSave = hasNoDonotpersistFlagInherited([record.target]);
      }
  
      // if (shouldSave) {
          // sessionStorage["lively.scriptMutationsDetected"] = 'true';
          // restartPersistenceTimerInterval();
      // }
    })  
  }
  
  
  observeHTMLChanges() {

    if (this.mutationObserver) this.mutationObserver.disconnect()
    this.mutationObserver = new MutationObserver((mutations, observer) => {
        this.onMutation(mutations, observer)
    });
     this.mutationObserver.observe(this, {
      childList: true, 
      subtree: true, 
      characterData: true, 
      attributes: true});
  }
  
  contentIsEditable() {
    return this.getPath().match(/\.html$/)
  }
  
  checkForContentChanges() {
    if (!this.contentIsEditable()) {
      this.contentChanged = false
      return 
    }
    
    if (this.isPersisting) return;
    this.isPersisting = true;
    // console.log("checkForContentChanges " + (Date.now() - this.lastChecked) + "ms " + document.activeElement)
    this.lastChecked = Date.now()

    try {
      window.oldActiveElement = document.activeElement
      var currentSource = this.getHTMLSource()
      
      if (!this.lastSource || this.lastSource != currentSource) {
        this.contentChanged = true
      } else {
        this.contentChanged = false
      }
      this.updateChangeIndicator()
    } finally {
      // setTimeout(() => {
        // console.log("refocus " + oldActiveElement)
        
        if (oldActiveElement && oldActiveElement.editor) oldActiveElement.editor.focus()
      
        // we don't want to catch our own mutations... that were cause
        // by detecting some mutations in the first place
        this.isPersisting = false
      // }, 0)
    }
  }

  resetContentChanges() {
    this.lastSource  =  this.getHTMLSource();
    this.contentChanged = false
    this.updateChangeIndicator()
  }

  updateChangeIndicator() {
    var indicator = this.get("#changeIndicator")
    if (indicator && this.contentChanged) {
      indicator.style.backgroundColor = "rgb(220,30,30)";
    } else {
      indicator.style.backgroundColor = "rgb(200,200,200)";
    }
  }
  
  focus() {
    // var editor = this.getAceEditor();
    // if (editor) {
    //   editor.focus()
    // }
  }
  
  createLink(base, name, href) {
    var link = document.createElement("a")
    link.textContent = name
    var path = base + href
    link.href = path
    link.addEventListener("click", (evt) => {
        this.followPath(path); 
        evt.preventDefault(); 
        evt.stopPropagation()
    }); 
    return link  
  }
  
  livelyAcceptsDrop() {
    return this.contentIsEditable() && !this.isEditing()
  }
  
  
  livelyPrepareSave() {
    this.setAttribute("leftpane-flex", this.get("#container-leftpane").style.flex)
    this.setAttribute("rightpane-flex", this.get("#container-rightpane").style.flex)
  }
  
  livelyPreMigrate() {
    // do something before I got replaced  
    this.oldContentScroll = this.get("#container-content").scrollTop;
 	var fileEditor = this.get("#editor");
    if (fileEditor) {
      this.oldScrollInfo = fileEditor.getScrollInfo()
      this.oldCursor = fileEditor.getCursor()
      this.oldFocused = document.activeElement == this
    }
  }
  
  livelyMigrate(other) {
    // other = that
    this.isMigrating = true;
    this.preserveContentScroll = other.oldContentScroll;
    var editor = other.get("#editor");
    if (editor) {
      var otherAce = editor.currentEditor();  
      if (otherAce && otherAce.selection) {
        var range = otherAce.selection.getRange();
        var scrollTop = otherAce.session.getScrollTop();
        this.asyncGet("#editor").then( editor => {
          var thisAce = editor.currentEditor();
          if (otherAce && thisAce) {
            thisAce.session.setScrollTop(scrollTop);
            thisAce.selection.setRange(range);
          }
          this.isMigrating = false;
        }).catch(() => {
          // jsut to be sure..
          this.isMigrating = false;
        });
      } 
      this.asyncGet("#editor").then( editor => { 
        editor.setScrollInfo(other.oldScrollInfo)
      	editor.setCursor(other.oldCursor)
      	if (other.oldFocused) {
      	  // lively.notify("set focus again!")
      	  // setTimeout(() => editor.focus(), 1000)
        }
      })
    } else {
      this.isMigrating = false;
    }
  }
}