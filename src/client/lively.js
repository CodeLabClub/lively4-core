/* Lively4 core module 
 * #Lively4 #Singleton #KitchenSink #CyclicDependecies #RefactoringNeeded
 * 
 */
import './patches.js'; // monkey patch the meta sytem....
import * as jquery from '../external/jquery.js';
import * as _ from '../external/underscore.js';
import * as scripts from './script-manager.js';
import * as messaging from './messaging.js';
import preferences from './preferences.js';
import persistence from './persistence.js';
import html from './html.js';
import files from './files.js';
import paths from './paths.js';
import contextmenu from './contextmenu.js';
import keys from './keys.js';
import components from './morphic/component-loader.js';
import authGithub from './auth-github.js';
import authDropbox from './auth-dropbox.js';
import authGoogledrive  from './auth-googledrive.js';
import expose from './expose.js';
import { toArray, uuid as generateUUID } from 'utils';
import {pt, rect} from './graphics.js';
import Dialog from 'templates/lively-dialog.js'
import ViewNav from 'src/client/viewnav.js'

/* expose external modules */
import color from '../external/tinycolor.js';
import focalStorage from '../external/focalStorage.js';
import * as kernel from 'kernel';
import Selection from 'templates/lively-selection.js'
import windows from "templates/lively-window.js"
import boundEval from "src/client/bound-eval.js";

let $ = window.$; // known global variables.

// a) Special shorthands for interactive development
// b) this is the only reasonable way to use modules in template scripts, due to no shared lexical scope #TODO
// c) This indirection is also needed to let old events listeners signal to code in current modules 
var exportmodules = [
  "preferences",
  "files",
  "keys",
  "paths",
  "html",
  "components",
  "persistence",
  "color",
  "focalStorage",
  "authGithub",
  "authDropbox",
  "authGoogledrive",
  "windows"
];

class LivelyNotification {
  constructor(data) {
    this.data = data;
  }
  
  displayOnConsole() {
    console.log('%cLively Notification', "color: gray; font-size: x-small", this.data);
  }
}

/*
 * The "lively" module is currently the kitchen-sink of this environment.
 * 
 * #TODO refactor so that methods go into more specific modules. 
 */
export default class Lively {
  
  static get location() {
    return window.location;
  }
  
  static set location(url) {
    return window.location = url;
  }

  static findDependedModules(path) {
     var mod = System.normalizeSync(path);
     return Object.values(System.loads)
      .filter( ea => 
        ea.dependencies.find(dep => System.normalizeSync(dep, ea.key) == mod))
      .map( ea => ea.key)
  }
  
  // #TODO remove code duplication lively-con
  static unloadModule(path) {
    var normalizedPath = System.normalizeSync(path)
    System.import(normalizedPath).then(module => {
      if(module && typeof module.__unload__ === "function") {
        module.__unload__();
      }
    });
    System.registry.delete(normalizedPath);
    // #Hack #issue in SystemJS babel syntax errors do not clear errors
    System['@@registerRegistry'][normalizedPath] = undefined;
    delete System.loads[normalizedPath] 
  }

  static async reloadModule(path) {
    path = "" + path;
    var changedModule = System.normalizeSync(path);
    var load = System.loads[changedModule]
    if (!load) {
      
	    this.unloadModule(path) // just to be sure...
      console.log("Don't reload non-loaded module")
      return   
    }
    var modulePaths = [path]
    this.unloadModule(path)
    return System.import(path).then( m => {
      
      // #TODO how can we make the dependecy loading optional... I don't need the whole environment to relaod while developing a core module everybody depends on
      // if (path.match("graphics.js")) {
      //   console.log("[reloadModule] don't load dependencies of " + path)
      //   return m
      // }
      
      // Find all modules that depend on me
      var dependedModules = lively.findDependedModules(path)
      // and update them
      for(var ea of dependedModules) {
        modulePaths.push(ea)
        console.log("reload " + path + " triggers reload of " + ea)
        System.registry.delete(ea)  
        System.import(ea)
        // #TODO think about if this is ennough or if we need some kind of recursion
      }
      return m
    }).then( mod => {
      var moduleName = path.replace(/[^\/]*/,"");
      
      var defaultClass = mod.default;
      
      if (defaultClass) {
        console.log("update template prototype: " + moduleName);
        components.updatePrototype(defaultClass.prototype);
      }
   
      return mod;
    }).then(async (mod) => {
      modulePaths.forEach(eaPath => {
        // lively.notify("update dependend: ", eaPath, 3, "blue")
        if (eaPath.match(/templates\/.*js/)) {
          var templateURL = eaPath.replace(/\.js$/,".html");
          try {
            console.log("[templates] update template " + templateURL);
            setTimeout(() => {
              lively.files.loadFile(templateURL).then( sourceCode => 
                lively.updateTemplate(sourceCode));
            },100)
            
          } catch(e) {
            lively.notify("[templates] could not update template " + templateURL, ""+e);
          }
        }
      })
      return mod
    })
  }

  static loadJavaScriptThroughDOM(name, src, force) {
    return new Promise((resolve) => {
      var scriptNode = document.querySelector("#"+name);
      if (!force && scriptNode) {
        resolve() // nothing to be done here
        return 
      }
      
      if (scriptNode) {
        scriptNode.remove();
      }
      var script = document.createElement("script");
      script.id=name;
      script.charset="utf-8";
      script.type="text/javascript";
      if (force) {
        src += "?" + Date.now();
      }
      script.src= src;
      script.onload = function() {
        resolve();
      };
      document.head.appendChild(script);
    });
  }


  static loadCSSThroughDOM(name, href, force) {
    return new Promise((resolve) => {
      var linkNode = document.querySelector("#"+name);
      if (linkNode) {
        linkNode.remove();
      }
      var link = document.createElement("link");
      link.rel="stylesheet";
      link.id=name;
      link.charset="utf-8";
      link.type="text/css";
      if (force) {
        href += + "?" + Date.now();
      }
      link.href= href;
      link.onload = function() {
        resolve();
      };
      document.head.appendChild(link);
    });
  }


  static fillTemplateStyles(root, debugInfo) {
    // there seems to be no <link ..> tag allowed to reference css inside of templates #Jens
    var promises = [];
    var allSrc = []
    root.querySelectorAll("style").forEach(ea => {
      var src = ea.getAttribute("data-src"); 
      if (src) {
        allSrc.push(src)
        // console.log("load fillTemplateStyles: " + lively4url + src );
        promises.push(fetch(lively4url + src).then(r => r.text()).then(css => {
          ea.innerHTML = css;
        }));
      }
    });
    return Promise.all(promises)
  }

  static showError(error) {
    this.handleError(error);
  }
  
   static async handleError(error) {
    lively.LastError = error;
    try {
      if (!error) return; // hmm... this is currious...
      if (error.message.match("Maximum call stack size exceeded")) {
        console.log(error)
        return 
      }
      if (document.querySelector("lively-console")) {
        console.log(error) 
      } else {
        await lively.notify("Error: ", error, 10, () => {
        		lively.openComponentInWindow("lively-error").then( comp => {
              comp.stack =  error.stack
              comp.parentElement.setAttribute("title",  "" + error.message)
              comp.style.height = "max-content"
              var bounds = comp.getBoundingClientRect()
              comp.parentElement.style.height = (bounds.height + 20)+ "px"
              comp.parentElement.style.width = bounds.width + "px"
            })
          }, "red");
      }
    } catch(e) {
      console.log("An error happend while handling and error: " + e)
    }
  }

  static loaded() {
    // #Refactor with #ContextJS
    // guard againsst wrapping twice and ending in endless recursion
    // if (!console.log.originalFunction) {
    //     var nativeLog = console.log;
    //     console.log = function() {
    //         nativeLog.apply(console, arguments);
    //         lively.log.apply(undefined, arguments);
    //     };
    //     console.log.originalFunction = nativeLog; // #TODO use generic Wrapper mechanism here
    // }
    // if (!console.error.originalFunction) {
    //     var nativeError = console.error;
    //     console.error = function() {
    //         nativeError.apply(console, arguments);
    //         lively.log.apply(undefined, arguments);
    //     };
    //     console.error.originalFunction = nativeError; // #TODO use generic Wrapper mechanism here
    // }

    // General Error Handling
    if (window.onerror === null) {
      window.onerror  = function(message, source, lineno, colno, error) {
    	  lively.handleError(error);
      };
    }
    // do it just once
    if (!window.unhandledRejectionEventLister) {
      window.unhandledRejectionEventLister = function(evt) {lively.handleError(evt.reason)} ;
      window.addEventListener('unhandledrejection', unhandledRejectionEventLister);
    }

    this.exportModules()

    if (!window.lively4chrome) {
      // for container content... But this will lead to conflicts with lively4chrome  ?? #Jens
      lively.loadCSSThroughDOM("livelystyle", lively4url + "/templates/lively4.css");
    }    
    // preload some components
    components.loadByName("lively-window");
    components.loadByName("lively-editor");
    
    System.import("src/client/clipboard.js") // depends on me
    System.import("src/client/graffle.js") // depends on me
    System.import("src/client/draganddrop.js") // depends on me
  }
  
  
  static exportModules() {
    exportmodules.forEach(name => lively[name] = eval(name)); // oh... this seems uglier than expectednit
  }

  static asUL(anyList){
    var ul = document.createElement("ul")
    ul.style.minWidth = "50px"
    ul.style.minHeight = "50px"
    ul.style.backgroundColor = "gray"
    
    anyList.forEach(ea => {
      var item = document.createElement("li")
      item.textContent = ea
      item.value = ea
      ul.appendChild(item)
    })

    return ul
  }


  static openWorkspace(string, pos, worldContext) {
    string = string || "";
    var name = "lively-code-mirror"      
    return  lively.openComponentInWindow(name, null, pt(400,500), worldContext).then((comp) => {
      comp.mode = "javascript";
      comp.value = string;
      var container = comp.parentElement
      if (pos) lively.setPosition(container,pos);
      container.setAttribute("title", "Workspace");
      comp.focus();
      return comp;
    });
  }
  
  static openInspector(object, pos, str, worldContext) {
    return lively.openComponentInWindow("lively-inspector", pos, pt(400,500), worldContext).then(inspector => {
        inspector.windowTitle = "Inspect: " + str;
        inspector.inspect(object);
        return inspector
    });
  }

  static async create(name="lively-table", parent=document.body) {
    var element = document.createElement(name)
    // #TODO normal elements will not resolve this promoise #BUG
    if (name.match("-")) {
      await lively.components.openIn(parent, element)      
    } else {
      parent.appendChild(element)
    }
    // if (document.activeElement) {
    //   var pos = lively.getGlobalBounds(document.activeElement).bottomLeft()
    //   lively.setGlobalPosition(element, pos)
    // }
    return element
  }
  
  static boundEval(str, ctx) {
    // #TODO refactor away
    // lively.notify("lively.boundEval is depricated")
    return boundEval(str, ctx)
  }

  static pt(x,y) {
    return {x: x, y: y};
  }

  static setPosition(obj, point, mode) {
      obj.style.position = mode || "absolute";

      // var bounds = that.getBoundingClientRect().top
      //var deltax = point.x - bounds.left
      // var deltay = point.y - bounds.top

      // obj.style.left = ""+  ((obj.style.left || 0) - deltax) + "px";
      // obj.style.top = "" + ((obj.style.top || 0) - deltay) + "px";
      obj.style.left = ""+  point.x + "px";
      obj.style.top = "" +  point.y + "px";
      obj.dispatchEvent(new CustomEvent("position-changed"))
  }
  
  
  // Example: lively.getPosition(that)
  
  static getPosition(obj) {
    var pos;
    if (obj.clientX)
      return pt(obj.clientX, obj.clientY);
    if (obj.style) {
      pos = pt(parseFloat(obj.style.left), parseFloat(obj.style.top));
    }
    // #TODO #Idea use getComputedStyle get rid of jQuery flallback in getPosition
    if (isNaN(pos.x) || isNaN(pos.y)) {
      pos = $(obj).position(); // fallback to jQuery...
      pos = pt(pos.left, pos.top);
    }
    return pos;
  }
  
  static  getExtent(node) {
    if (node === window) {
      return pt(window.innerWidth, window.innerHeight)
    }
    // using the getBoundingClientRect produces the wrong extent
    var style = getComputedStyle(node); 
    return pt(parseFloat(style.width), parseFloat(style.height))
  }
  
  static  setExtent(node, extent) {
    node.style.width = '' + extent.x + 'px';
    node.style.height = '' + extent.y + 'px';
    node.dispatchEvent(new CustomEvent("extent-changed"))
  }

  static  getGlobalPosition(node) {
    var bounds = node.getBoundingClientRect()
    return pt(bounds.left, bounds.top)
  }
  
  static  setGlobalPosition(node, pos) {
    if (!node.parentElement) return
    // var parentPos = this.getGlobalPosition(node.parentElement)
    // this.setPosition(node, pos.subPt(parentPos))

    // With all the parent elements, shadow roots and so on it is difficult to set a global position
    // ususally, we would get the global position of a parent element, but this is not always correct
    // so we use our own global position...
    lively.setPosition(node, pt(0,0)) // #somehow one time is not enough...
    var delta = pos.subPt(lively.getGlobalPosition(node))
    lively.moveBy(node, delta)
  }
  
  static  getGlobalCenter(node) {
    return this.getGlobalPosition(node).addPt(this.getExtent(node).scaleBy(0.5))
  }
  
  static  setGlobalCenter(node, pos) {
    this.setGlobalPosition(node, pos.subPt(this.getExtent(node).scaleBy(0.5)))
  }

  static moveBy(node, delta) {
    this.setPosition(node, this.getPosition(node).addPt(delta))
  }

  static  getBounds(node) {
    var pos = lively.getPosition(node)
    var extent = lively.getExtent(node)
    return rect(pos, pos.addPt(extent))
  }

  static  setBounds(node, bounds) {
    lively.setPosition(node, bounds.topLeft())
    lively.setExtent(node, bounds.extent())
  }


  static  getGlobalBounds(node) {
    var bounds = node.getBoundingClientRect()
    return rect(bounds.left, bounds.top, bounds.width, bounds.height)
  }


  static getScroll() {
    return pt(
      document.scrollingElement.scrollLeft || 0,
      document.scrollingElement.scrollTop || 0);
  }

  static openFile(url) {
    if (url.hostname == "lively4"){
      var container  = $('lively-container')[0];
      if (container) {
        container.followPath(url.pathname);
      } else {
        console.log("fall back on editor: "+ url);
        this.editFile(url);
      }
    } else {
      this.editFile(url);
    }
  }

  static editFile(url) {
    var editor  = document.createElement("lively-editor");
    components.openInWindow(editor).then((container) => {
        lively.setPosition(container, lively.pt(100, 100));
        editor.setURL(url);
        editor.loadFile();
    });
  }

  static hideContextMenu(evt) {
    if (evt.path[0] !== document.body) return;
    console.log("hide context menu:" + evt);
    contextmenu.hide();
  }

  static openContextMenu(container, evt, target, worldContext) {

    if (HaloService.areHalosActive() ||
      (HaloService.halosHidden && ((Date.now() - HaloService.halosHidden) < 500))) {
      target = that;
    }
    contextmenu.openIn(container, evt, target, worldContext);
  }

  static log(/* varargs */) {
      var args = arguments;
      $('lively-console').each(function() {
        try{
          if (this.log) this.log.apply(this, args);
        }catch(e) {
          // ignore...
        }
      });
  }
  
  static nativeNotify(title, text, timeout, cb) {
    if (!this.notifications) this.notifications = [];
    this.notifications.push({title: title, text: text, cb: cb, time: Date.now()});


    if (Notification.permission !== "granted") Notification.requestPermission();

    var time = Date.now();
    
    // check if the third last notification was already one second ago
    if(this.notifications.length > 5 &&
      (Date.now() - this.notifications[this.notifications.length - 3].time < 1000)) {
      return console.log("SILENT NOTE: " + title  + " (" + text + ")");
    }

    console.log("NOTE: " + title  + " (" + text + ")");


    var notification = new Notification(title || "", {
      icon: 'https://www.lively-kernel.org/media/livelylogo-small.png',
      body: text || "",
    });
    if (cb) notification.onclick = cb;
    if (timeout === undefined) timeout = 3;
    setTimeout(() => notification.close(), timeout * 1000);
    // notification.onclick = cb

  }
  
  /** notify **
   *
   * - displays an notification in the lower left of screen 
   * - takes arguments also as object parameter
   *
   * EXAMPLE:
   * 
      lively.notify({
      	title: "hello",
      	text: "world",
      	color: "blue",
      	timeout: 10,
      	details: "what's up?"})
   */
  static notify(titleOrOptions, text, timeout, cb, color) {
    try {
      console.log("notify:" + titleOrOptions)
    var title = titleOrOptions;
    if (titleOrOptions && titleOrOptions.title) {
      title = titleOrOptions.title;
      text = titleOrOptions.title;
      timeout = titleOrOptions.timeout;
      cb = titleOrOptions.more;
      color = titleOrOptions.color;
      
      // open details in a workspace
      if (titleOrOptions.details) {
        cb = () => {
          lively.openWorkspace(titleOrOptions.details).then( comp => {
            comp.parentElement.setAttribute("title", title);
            comp.unsavedChanges = () => false; // close workspace without asking
          });
        };
      }
    }
    // #TODO make native notifications opitional?
    // this.nativeNotify(title, text, timeout, cb) 
    new LivelyNotification({ title, text }).displayOnConsole();

    var notificationList = document.querySelector("lively-notification-list")
    if (!notificationList) {
     notificationList = document.createElement("lively-notification-list");
      components.openIn(document.body, notificationList).then( () => {
        if (notificationList.addNotification)
          notificationList.addNotification(title, text, timeout, cb, color);
      });
    } else {
      var duplicateNotification = Array.from(document.querySelectorAll("lively-notification")).find(ea => {
        new LivelyNotification({ "ea title": title, text }).displayOnConsole();

        return ("" +ea.title == ""+title) && ("" + ea.message == "" +text)
      });
      new LivelyNotification({ title, text, " duplicate": duplicateNotification }).displayOnConsole();

      if (duplicateNotification) {
      	duplicateNotification.counter++
      	duplicateNotification.render()
        new LivelyNotification({ title, text }).displayOnConsole();
      } else {
        if(notificationList && notificationList.addNotification) {
          notificationList.addNotification(title, text, timeout, cb, color);
        } else {
          console.log('%ccould not notify about', 'font-size: 9px; color: red', title, text);
        }
      }
    }
    } catch(e) {
      console.log("ERROR in lively.notify: " + e)
    }
  }
  
  static warn(title, text, timeout, cb) {
    this.notify(title, text, timeout, cb, 'yellow');
  }
  
  static error(title, text, timeout, cb) {
    this.notify(title, text, timeout, cb, 'red');
  }
  
  
  // we do it lazy, because a hand can be broken or gone missing... 
  static get hand() {
    var hand =  document.body.querySelector(":scope > lively-hand")
    if (!hand){
        hand = document.createElement("lively-hand")
        lively.components.openInBody(hand); // will not be initialized ... should we always return promise?
         hand.style.display = "none"
    }
    return hand
  }

  static get selection() {
    return Selection.current
    // var selection = document.body.querySelector(":scope > lively-selection")
    // if (!selection) {
    //   selection = document.createElement("lively-selection")
    //   lively.components.openInBody(selection);
    // }
    // return selection
  }

  // lively.ini
  static initializeEvents(doc) {
    doc = doc || document
    this.addEventListener('lively', doc, 'mousedown', function(evt){
      lively.onMouseDown(evt)}, false);
    this.addEventListener('lively', doc, 'contextmenu', function(evt) {
        lively.onContextMenu(evt)
    }, false);
    this.addEventListener('lively', doc, 'click', function(evt){lively.hideContextMenu(evt)}, false);
    this.addEventListener('lively', doc, 'keydown', function(evt){lively.keys.handle(evt)}, false);
  }
  
  static async initializeDocument(doc, loadedAsExtension, loadContainer) {
    console.log("Lively4 initializeDocument");

    lively.loadCSSThroughDOM("font-awesome", lively4url + "/src/external/font-awesome/css/font-awesome.min.css");
    this.initializeEvents(doc);
    this.initializeHalos();

    lively.addEventListener("preventDragCopy", document, "dragstart", (evt) => {
      if ((evt.path[0] === document.body)) {
        evt.stopPropagation()
        evt.preventDefault()    
      }
    })


    
    
    console.log("load local lively content ")
    await persistence.current.loadLivelyContentForURL()
    preferences.loadPreferences()
    
    // lazy initialize hand and selection
    lively.hand;
    // lively.selection;

    if (loadedAsExtension) {
      System.import("src/client/customize.js").then(customize => {
          customize.customizePage();
      });
      lively.notify("Lively4 extension loaded!",
        "  CTRL+LeftClick  ... open halo\n" +
        "  CTRL+RightClick ... open menu");
      return Promise.resolve();
    } else {
      // don't want to change style of external web-sites...
      lively.loadCSSThroughDOM("lively4", lively4url +"/src/client/lively.css");
      
      // only scroll thrugh CTRL+drag #TODO what does UX say?
      // document.body.style.overflow = "hidden"
      
      var titleTag = document.querySelector("title");
      if (!titleTag) {
        titleTag = document.createElement("title");
        titleTag.textContent = "Lively 4";        
        document.head.appendChild(titleTag);
      }

      document.body.style.backgroundColor = "rgb(240,240,240)"
      ViewNav.enable(document.body)

      if (loadContainer && lively.preferences.get("ShowFixedBrowser")) {
        this.showMainContainer()
      } 
    }

    if(this.deferredUpdateScroll) {
      document.scrollingElement.scrollLeft = this.deferredUpdateScroll.x;
      document.scrollingElement.scrollTop = this.deferredUpdateScroll.y;
      delete this.deferredUpdateScroll;
		}
    
    console.log("lively persistence start ")
    setTimeout(() => {persistence.current.start()}, 2000)

    
  }
  
  static async showMainContainer() {
    var container = document.querySelector('main-content')
    if (container) return container;
    
    container = document.createElement("lively-container");
    container.id = 'main-content';
    container.setAttribute("load", "auto");

    await components.openInWindow(container).then( () => {
      container.__ingoreUpdates = true; // a hack... since I am missing DevLayers...
      container.get('#container-content').style.overflow = "visible";
      container.parentElement.toggleMaximize()
      container.parentElement.setAttribute("data-lively4-donotpersist","all");
    });
    return container
  }

  static initializeHalos() {
    if (!window.lively) {
      return setTimeout(() => { this.initializeHalos() }, 100)
    }
    if (!document.body.querySelector('lively-halo')) {
      lively.components.openInBody(document.createElement('lively-halo')).then(comp => {
        comp.setAttribute('data-lively4-donotpersist', 'all')
      })
    }
  }

  static unload() {
      
    lively.notify("unloading Lively is not supported yet! Please reload page....");
  }

  static async updateTemplate(html) {
    var tagName = await components.reloadComponent(html);
    if (!tagName) return;

    document.body.querySelectorAll(tagName).forEach(oldInstance => {
      if (oldInstance.__ingoreUpdates) return;

      // if (oldInstance.isMinimized && oldInstance.isMinimized()) return // ignore minimized windows
      // if (oldInstance.isMaximized && oldInstance.isMaximized()) return // ignore isMaximized windows

      var owner = oldInstance.parentElement;
      var newInstance = document.createElement(tagName);
      
      if (oldInstance.livelyPreMigrate) {
        oldInstance.livelyPreMigrate(oldInstance); 
      }
      owner.replaceChild(newInstance, oldInstance);
      oldInstance.childNodes.forEach(ea => {
        if (ea) { // there are "undefined" elemented in childNodes... sometimes #TODO
          newInstance.appendChild(ea);
          // console.log("append old child: " + ea);
        }
      });
      
      Array.from(oldInstance.attributes).forEach(ea => {
        // console.log("set old attribute " + ea.name + " to: " + ea.value);
        newInstance.setAttribute(ea.name, ea.value);
      });

      // Migrate Position
      if (oldInstance.style.position == "absolute") {
        newInstance.style.top = oldInstance.style.top;
        newInstance.style.left = oldInstance.style.left;
      }

      // Migrate "that" pointer
      if (window.that == oldInstance) {
        window.that = newInstance;
      }

      if (newInstance.livelyMigrate) {
        newInstance.livelyMigrate(oldInstance); // give instances a chance to take over old state...
      }
      
      // #LiveProgrammingHack
      document.querySelectorAll("lively-inspector").forEach(inspector => {
        if (inspector.targetObject === oldInstance) {
          inspector.inspect(newInstance)
        }
      })

    });
  }
  
  static showInfoBox(target) {
    var info = document.createElement("div")
    info.classList.add("draginfo")
    info.target = target
    info.isMetaNode = true
    info.style.width = "300px"
    info.style['pointer-events'] = "none";
    info.setAttribute("data-is-meta", "true");
    info.style.color = "darkblue"
    info.update = function() {
      lively.setGlobalPosition(this, lively.getGlobalPosition(this.target).subPt(pt(0, 20)))
    }
    info.style['z-index'] = 10000
    info.update()
    lively.addEventListener("ShowInfoBox", target, "position-changed", () => {
      info.update()
    })
    info.stop = function() {
      this.remove()
      lively.removeEventListener("ShowInfoBox", target, "position-changed")
    }

    document.body.appendChild(info)
    return info
  }


  static showPoint(point) {
    return this.showRect(point, pt(5,5))
  }

  static showEvent(evt) {
    var r = lively.showPoint(pt(evt.clientX, evt.clientY))
    r.style.backgroundColor = "rgba(100,100,255,05)"
    return r
  }

  static showRect(point, extent) {
    // check for alternative args
    if (point && !extent) {
      extent = point.extent()
      point = point.topLeft()
    }
    
    if (!point || !point.subPt) return
    var comp = document.createElement("div");
    comp.style['pointer-events'] = "none";
    comp.style.width = extent.x + "px";
    comp.style.height = extent.y + "px";
    comp.style.padding = "1px";
    comp.style.backgroundColor = 'rgba(255,0,0,0.5)';
    comp.style.zIndex = 1000;
    comp.isMetaNode = true;

    var bodyBounds = document.body.getBoundingClientRect()
    

    document.body.appendChild(comp);
    lively.setPosition(comp, point.subPt(pt(bodyBounds.left, bodyBounds.top)));
    comp.setAttribute("data-is-meta", "true");

    setTimeout( () => $(comp).remove(), 3000);
    // ea.getBoundingClientRect
    return comp
  }


  static showPath(path, color, printArrow) {
    color = color || "red"
    var comp = this.createPath(path, color, printArrow)
    document.body.appendChild(comp);
    comp.style.zIndex = 1000;
    lively.setGlobalPosition(comp, pt(0,0));
    comp.setAttribute("data-is-meta", "true");
    comp.isMetaNode = true;
    comp.style.pointerEvents = "none";
    comp.style.touchAction = "none";   
    setTimeout( () => comp.remove(), 3000);
    return comp
  }

  static createPath(path, color, printArrow, label) {
    if (!path || path.length < 1) return;
    if (printArrow === undefined) printArrow = true;

    var comp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    comp.style = `position: absolute;
        top: 0px;
        left: 0px;
        width: 100px;
        height: 100px;
        border: none;
        opacity: 1;
        overflow: visible;`
    
    var dpath = path.map((ea,i) => (i == 0 ? "M " : "L ") + ea.x + " " + ea.y).join(" ")
    var defs = 
`      <defs>
          <marker id="markerArrow" markerWidth="13" markerHeight="13" refX="2" refY="6"
                 orient="auto">
              <path d="M2,2 L2,11 L10,6 L2,2" style="fill: ${color};" />
          </marker>
       </defs>`;
    
    var last = _.last(path)
    
    comp.innerHTML = defs + `<path id="path" fill="none" stroke='${color}' d='${dpath}' 
      style='${ 
        printArrow ? 'marker-end: url(#markerArrow);' : ""
      }'></path>`  + `<g font-size="12" font-family="sans-serif" fill="${color}" stroke="none"
  text-anchor="middle">
    <text x="${last.x}" y="${last.y}" dx="10">${label ? label : ""}</text>
  </g>`

    return comp
  }


  static showSource(object, evt) {
    if (object instanceof HTMLElement) {
        var comp  = document.createElement("lively-container");
        components.openInWindow(comp).then((container) => {
          comp.editFile(lively4url +"/templates/" + object.localName + ".html");
        });
    } else {
      lively.notify("Could not show source for: " + object);
    }
  }

  static async showClassSource(object, evt) {
    // object = that
    if (object instanceof HTMLElement) {
      let templateFile = lively4url +"/templates/" + object.localName + ".html",
        source = await fetch(templateFile).then( r => r.text()),
        template = $.parseHTML(source).find( ea => ea.tagName == "TEMPLATE"),
        className = template.getAttribute('data-class'),
        baseName = this.templateClassNameToTemplateName(className),
        moduleURL = lively4url +"/templates/" + baseName + ".js";
      lively.openBrowser(moduleURL, true, className);
    } else {
      lively.notify("Could not show source for: " + object);
    }
  }


  static showElement(elem, timeout) {
    if (!elem || !elem.getBoundingClientRect) return ;
    var comp = document.createElement("div");
    var bounds = elem.getBoundingClientRect();
    var bodyBounds = document.body.getBoundingClientRect()
    var offset = pt(bodyBounds.left, bodyBounds.top)
    var pos = pt(bounds.left, bounds.top).subPt(offset);

    comp.style.width = bounds.width +"px";
    comp.style.height = bounds.height +"px";
    comp.style['pointer-events'] = "none";
    // comp.style.height = "0px"
    comp.style["z-index"] = 1000;
    comp.style.border = "1px solid red";
    comp.isMetaNode = true;
    document.body.appendChild(comp);
    lively.setPosition(comp, pos);
    comp.setAttribute("data-is-meta", "true");

    comp.innerHTML = "<pre data-is-meta='true' style='position: relative; top: -8px; width: 200px; background: rgba(255,255,255,0.8); color: red; font-size: 8pt'>" +
        elem.tagName +": " + elem.id + "\n" +
        elem.getAttribute("class") +"\n"

      + "</pre>";

    setTimeout( () => $(comp).remove(), timeout || 3000);
    return comp;
  }

  static async showProgress(label) {
    var progressContainer  = document.querySelector("#progressContainer")
    if (!progressContainer) {
      progressContainer = document.createElement("div")
      progressContainer.id = "progressContainer"
      progressContainer.isMetaNode = true
      // progressContainer.style['pointer-events'] = "none";
      progressContainer.style.zIndex = 1000
      document.body.appendChild(progressContainer)
      lively.setGlobalPosition(progressContainer, pt(50, 50))
    }
    
    var progress = document.createElement("lively-progress")
    await components.openIn(progressContainer, progress)
    lively.setExtent(progress, pt(300,20))
    progress.textContent = label
    return progress
  }

  static allProperties(obj, result) {
    result = result || {};
    Object.getOwnPropertyNames(obj).forEach( name => {result[name] = obj.constructor.name});
    if (obj.__proto__) {
      lively.allProperties(obj.__proto__, result);
    }
    return result;
  }
  
  static templateClassNameToTemplateName(className) {
    return className.replace(/[A-Z]/g, ea => "-" + ea.toLowerCase()).replace(/^-/,"");
  }

  static async registerTemplate() {
    var template = document.currentScript.ownerDocument.querySelector('template');
    var clone = document.importNode(template.content, true);
    var proto;
    var className = template.getAttribute("data-class");
    if (className) {
      // className = "LivelyFooBar"
      let baseName = this.templateClassNameToTemplateName(className);
      var module = await System.import(lively4url +'/templates/' + baseName +".js");
      proto =  Object.create(module.prototype || module.default.prototype);
    }
    components.register(template.id, clone, proto);
  }

  static get eventListeners() {
    if (!window.livelyEventListeners) {
      window.livelyEventListeners = [];
    }
    return window.livelyEventListeners;
  }

  static set eventListeners(list) {
      window.livelyEventListeners = list;
  }

  // Registration and deregistration of eventlisteners for run-time programming...
  static addEventListener(domain, target, type, listener, options) {
    this.eventListeners.push(
      {target: target, type: type, listener: listener, domain: domain, options: options});
    target.addEventListener(type, listener, options);
  }

  static removeEventListener(domain, target, type, listener) {
    this.eventListeners = this.eventListeners.filter(ea => {
      if ((!target      || (ea.target   === target))
          && (!type     || (ea.type     ==  type))
          && (!listener || (ea.listener === listener))
          && (!domain   || (ea.domain   ==  domain))) {
        // actually removing the event listener
        // console.log("removeEventListener", ea.target, ea.type, ea.listener)
        ea.target.removeEventListener(ea.type, ea.listener, ea.options);
        return false;
      } else {
        return true;
      }
    });
  }

  static openSearchWidget(text, worldContext, searchContext) {
    // index based search is not useful at the moment
    if (true) {
      var container = lively.query(searchContext, "lively-container")
      this.openComponentInWindow("lively-search", undefined, undefined, worldContext).then( comp => {
        if (container) {
          // search in the current repository
          var url = container.getURL().toString()
          var base = lively4url.replace(/[^/]*$/,"")
          if (url.match(base)) {
            var repo = url.replace(base,"").replace(/\/.*$/,"")
            comp.searchRoot = repo
          }
        }
        comp.searchFile(text);
        comp.focus()
         
      });
    } else {
      var comp = document.getElementsByTagName("lively-search-widget")[0];
      if (comp.isVisible && text == comp.query) {
        comp.isVisible = false;
      } else {
        comp.isVisible = true;
        comp.search(text, true);
      }
    }
  }
  
  static hideSearchWidget() {
    var comp = document.getElementsByTagName("lively-search-widget")[0];
    comp.hide();
  }

  static openIssue(number) {
    // #TODO customize or derive github issue url, making it context cependend 
    window.open("https://github.com/LivelyKernel/lively4-core/issues/" + number)
  }

  static openHelpWindow(text) {
    this.openComponentInWindow("lively-help").then(comp => {
      comp.parentElement.style.width = "850px";
      comp.parentElement.style.height = "600px";
      comp.getHelp(text);
    });
  }
  
  
  
  static openComponentInWindow(name, pos, extent, worldContext) {
    worldContext = worldContext || document.body
  
    var w = document.createElement("lively-window");
    if (extent) {
      w.style.width = extent.x;
      w.style.height = extent.y;
    }
    
    
    
    // #Problem: we cannot open last window here because we can be scrolled to the other end of the world
    // if (lastWindow) {
    //   var lastPos = lively.getPosition(lastWindow);
      
    if (!pos) {
      pos = this.findPositionForWindow(worldContext)
    }
    if (pos) 
      lively.setPosition(w, pos);

    
    return components.openIn(worldContext, w, true).then((w) => {
    	return components.openIn(w, document.createElement(name)).then((comp) => {
        
        if (comp.windowTitle) w.setAttribute("title", "" + comp.windowTitle);
        return comp
    	})
    })
  }
  
  static findPositionForWindow(worldContext) {
     // this gets complicated: find a free spot starting top left going down right
      var windows = Array.from(worldContext.querySelectorAll(":scope > lively-window"))
      var offset = 20
      var pos
      for(var i=0; !pos; i++) {
        var found = windows.find( ea => {
          // var ea = that; var i =0 
          var eaPos = lively.getGlobalPosition(ea)
          // find free space in direction bottom right
          return (i * offset <= eaPos.x) && (eaPos.x < (i + 1) * offset ) && (i * offset <= eaPos.y) && (eaPos.y < (i + 1) * offset)
        });
        if (!found) pos = pt(i * offset,i* offset)
      }
      return pos.subPt(lively.getGlobalPosition(worldContext))
  }
  
  // lively.openBrowser("https://lively4/etc/mounts", true, "Github")
  static async openBrowser(url, edit, patternOrPostion, replaceExisting, worldContext) {
    worldContext = worldContext || document.body
    if (patternOrPostion && patternOrPostion.line)
      var lineAndColumn = patternOrPostion
    else 
      var pattern = patternOrPostion

    if (!url || !url.match(/^http/))
      url = lively4url
    var editorComp;
    var containerPromise;
    if (replaceExisting) {
      editorComp = Array.from(worldContext.querySelectorAll("lively-container")).find(ea => ea.isSearchBrowser);
    } 
 
    var lastWindow = _.first(Array.from(worldContext.querySelectorAll("lively-window"))
      .filter(  ea => ea.childNodes[0] && ea.childNodes[0].isSearchBrowser));
      
    containerPromise = editorComp ? Promise.resolve(editorComp) :
      lively.openComponentInWindow("lively-container", undefined, undefined, worldContext);

    return containerPromise.then(comp => {
      editorComp = comp;
      comp.parentElement.style.width = "950px";
      comp.parentElement.style.height = "600px";
      
      if (lastWindow) {
        lively.setPosition(comp.parentElement, 
          lively.getPosition(lastWindow).addPt(pt(25,25)));
      }

      if (edit) comp.setAttribute("mode", "edit");
      if (pattern) {
        comp.isSearchBrowser = true;
        comp.hideNavbar();
      }
      return comp.followPath(url)
    }).then(async () => {
      if (edit) {
        await editorComp.asyncGet("#editor").then(livelyEditor => {
          if(pattern) {
            // #Hack ontop #Hack, sorry... The editor has still things to do
            setTimeout(() => {
              livelyEditor.find(pattern);
            }, 500)
            
          } else if (lineAndColumn) {
            // #TODO ... 
            // ace.gotoLine(lineAndColumn.line, lineAndColumn.column)
          }
        });
      }
      return editorComp
    });
  }
  
  static openDebugger() {
    if(!window.lively4ChromeDebugger) {
      return lively.notify("Please install Lively4Chrome Extension for debugger support.");
    } 
    lively4ChromeDebugger.getCurrentDebuggingTarget().then((res) => {
      // Use chrome.window.create to create an independent window, window.open does not work
      lively4ChromeDebugger.createWindow({
      	url: lively4url + '/debugger.html?targetId=' + res.targetId,
      	width: 1000, left: parseInt((screen.width - 1000)/2),
      	height: 750, top: parseInt((screen.height - 750)/2),
      	type: 'popup'
      }).catch((error) => {
        lively.notify("Unable to create new window for debugger.")
      });
    });
  }
  
  static get(query) {
    return document.querySelector(query)
  }
  
  static confirm(msg) {
    return Dialog.confirm(msg)
  }
  
  static prompt(msg, value) {
    return Dialog.prompt(msg, value)
  }
  
  static findWorldContext(element) {
    if (!element) return document.body
    if (!element.parentElement) return element.parentNode; // shadow root
    if (element.tagName == "BODY" || element.tagName == "LIVELY-CONTAINER")
      return element
    else
      return this.findWorldContext(element.parentElement)
  }
  
  static activeElement(worldContext) {
    worldContext = worldContext || document
    var element = worldContext.activeElement
    if (element.shadowRoot && element.shadowRoot.activeElement)
      return this.activeElement(element.shadowRoot); // probe if we want to go deeper
    return element
  }

  static findWindow(element) {
    if (element.isWindow) return element;
    if (element.parentNode) return this.findWindow(element.parentNode);
    if (element.host) return this.findWindow(element.host);
    return document.body; // nothing found... just use the body
  }
  
  // lively.print(document)
  static print(obj) {
    var s = "" + obj + "{"
    for(var i in obj) {
      if (!(obj[i] instanceof Function) && obj[i] !== undefined)
      s += i + ": " + obj[i] + "\n"
    }
    s +"}"
    return s
  }


  static allKeys(obj) {
    var keys = []
    for(var i in obj) {
      if (obj.hasOwnProperty(i) || obj.__lookupGetter__(i)) {
        keys.push(i);
      }
    }
    return keys
  }
  

  static currentStack() {
    try {
      throw new Error("XYZError")
    } catch(e) {
      return e.stack.split("\n")
        .filter(ea => !ea.match("src/external/ContextJS/src/Layers.js") )
        .filter(ea => !ea.match("XYZError") )
        .filter(ea => !ea.match("currentStack") )
        .map(ea => ea.replace(/\(.*?\)/,""))
        .join("\n")
    }
  }
  
  
  static onUnload() {
    // #TODO How to deal with multiple open lively pages? 
    // last closing site wins!
    // #IDEA: we could versionize the local content and saving to it will merge in conflicting changes first? But for this to work, we would need a change history in our local storage, too?
    persistence.current.saveLivelyContent()
  }
  
  /* Change Preference Callbacks */
  
  static async onInteractiveLayerPreference(enabled) {
    if (enabled) {
      await System.import("src/client/interactive.js");
      InteractiveLayer.beGlobal()
    } else {
      if (window.InteractiveLayer)
        InteractiveLayer.beNotGlobal()
    }
  }

  static async onShowFixedBrowserPreference(enabled) {
    if (enabled) {
      this.showMainContainer()
    } else {
      var content = document.querySelector("#main-content")
      if (content && content.parentElement.isWindow ) {
        content.parentElement.remove()
      }
    }
  }

  static async onShowDocumentGridPreference(enabled) {
    if (enabled) {
      ViewNav.showDocumentGrid(document.body)
    } else {
      ViewNav.hideDocumentGrid(document.body)
    }
  }

  static async onBodyPositionPreference(pos) {
    lively.setPosition(document.body, pos)
  }

  static async onBodyScrollPreference(pos) {
    this.deferredUpdateScroll = pos;
  }


  static isGlobalKeyboardFocusElement(element) {
    return element === document.body 
      || (element && (element.id == "copy-hack-element") 
      || (element  && element.tagName == "LIVELY-CONTAINER"))
  }

  static hasGlobalFocus() {
    return this.isGlobalKeyboardFocusElement(document.activeElement)
  }

  static globalFocus() {
    // document.querySelector('#copy-hack-element').remove()
    // var copyHack = document.querySelector('#copy-hack-element')
    //   if (!copyHack) {
    //     copyHack = document.createElement("input")
    //     lively.setPosition(copyHack, pt(0,0))
    //     lively.setExtent(copyHack, pt(30,30))
    //     copyHack.style.backgroundColor = "red"
    //     copyHack.id = "copy-hack-element"
    //     copyHack.isMetaNode = true
    //     document.body.appendChild(copyHack)
    //   }
    // lively.focusWithoutScroll(copyHack)
    
    this.focusWithoutScroll(document.body)
  }
  
  static focusWithoutScroll(element) {
    if (!element) return;
    // console.log("focusWithoutScroll " + element)
    var scrollTop = document.scrollingElement.scrollTop
    var scrollLeft = document.scrollingElement.scrollLeft
    element.focus(true) 
    // the focus scrolls as a side affect, but we don't want that
    document.scrollingElement.scrollTop = scrollTop
    document.scrollingElement.scrollLeft = scrollLeft
    //console.log("scroll back " + scrollTop + " " + scrollLeft )
  }
  
  static ensureID(element) {
    var id = element.getAttribute("data-lively-id")
    if (!id) {
      id = generateUUID()
      element.setAttribute("data-lively-id", id)
    }
    return id
  }

  static elementByID(id, worldContext) {
    if (!id) return;
    worldContext = worldContext || document;
    return worldContext.querySelector('[data-lively-id="' + id + '"]');
  }

  static query(element, query) {
   // lively.showElement(element)
   var result = element.querySelector(query)
   if (!result && element.isWindow) return; // scope that search to windows
   if (!result && element.parentElement) result = this.query(element.parentElement, query) 
   if (!result && element.parentNode) result = this.query(element.parentNode, query)    
   if (!result && element.host) result = this.query(element.host, query) 
   return result
  }

  static queryAll(element, query) {    
    var all = new Set()
    element.querySelectorAll(query).forEach(ea => all.add(ea))
    var containers = element.querySelectorAll("lively-container")
    containers.forEach(ea => {
      ea.shadowRoot.querySelectorAll(query).forEach(ea => all.add(ea))
    })
    return Array.from(all)
  }
 
  static gotoWindow(element) {
    element.focus()
    document.scrollingElement.scrollTop = 0
    document.scrollingElement.scrollLeft = 0
    var pos = lively.getPosition(element).subPt(pt(0,0))
    lively.setPosition(document.body, pos.scaleBy(-1))
  }

  //  lively.allPreferences()
  static allPreferences() {
    var regexp = /on(.*)Preference/
    return Object.getOwnPropertyNames(lively)
      .filter(ea => ea.match(regexp))
      .map(ea => ea.match(regexp)[1])
  }
  
  static async bench(func) {
    var s = Date.now()
    await func()
    return Date.now() - s  
  }
  
  static onMouseDown(evt) {
    // lively.showEvent(evt)
    lively.lastScrollTop = document.scrollingElement.scrollTop; 
    lively.lastScrollLeft = document.scrollingElement.scrollLeft; 
  }
  
  static onContextMenu(evt) {
    if (!evt.shiftKey) { // evt.ctrlKey
      evt.preventDefault();
      evt.stopPropagation();
      if (lively.lastScrollLeft) {
        document.scrollingElement.scrollTop = lively.lastScrollTop;
        document.scrollingElement.scrollLeft = lively.lastScrollLeft;
      }          
      lively.openContextMenu(document.body, evt);
      return false;
    }
  }
  
}

if (!window.lively || window.lively.name != "Lively") {
  window.lively = Lively;
  console.log("loaded lively intializer");
  // only load once... not during development
  Lively.loaded();
} else {
  var oldLively = window.lively
  Lively.previous = oldLively
  window.lively = Lively;
}


Lively.exportModules();
  
console.log("loaded lively");
