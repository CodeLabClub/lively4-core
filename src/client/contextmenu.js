/*
 * Lively4 ContextMenu
 * - creates the "world menu" for Lively4
 */ 
  
import html from './html.js';
import {pt} from './graphics.js';
import ViewNav from 'src/client/viewnav.js'
import Layout from "src/client/layout.js"
import Preferences from './preferences.js';
import Windows from "src/components/widgets/lively-window.js"
import {Grid} from "src/client/morphic/snapping.js"
import Info from "src/client/info.js"


// import lively from './lively.js'; #TODO resinsert after we support cycles again

export default class ContextMenu {
  
  constructor(target, optItems) {
    this.target = target;
    this.items = optItems;
  }
  
  openIn(container, evt, target, worldContext) {
     return ContextMenu.openIn(container, evt, target, worldContext,  this.items);
  }
  
  static hide() {
    if (this.menu) this.menu.remove();
    lively.removeEventListener("contextMenu",  document.documentElement);
    delete this.menu
  }
  
  static visible() {
    return this.menu && this.menu.parentElement
  }
  
  static openComponentInWindow (name, evt, worldContext) {
    this.hide();
    return lively.openComponentInWindow(name, 
      this.eventPosition(worldContext, evt), 
      undefined, worldContext).then( comp => {
      
      return comp
    });
  }
  
  static openInWindow(comp, worldContext, evt) {
    var pos = lively.getPosition(comp);
	  lively.components.openInWindow(comp, pos).then( comp => {
	     lively.setPosition(comp, pt(0,0));
	  });
  }
  
  static eventPosition(worldContext, evt) {
    evt = this.firstEvent || evt;
    
    var pos = pt(evt.clientX, evt.clientY);
    var bodyBounds = document.body.getBoundingClientRect()
    var offset = pt(bodyBounds.left, bodyBounds.top)
    
    if (worldContext.localizePosition) { 
      pos = worldContext.localizePosition(pos);
    } else {
      pos = pos.subPt(lively.getGlobalPosition(worldContext))
    }
    return pos
  }
  
  static positionElementAtEvent(element, worldContext, evt) {
    lively.setPosition(element, this.eventPosition(worldContext, evt));
  }
  
  static targetMenuItems(target) {
    var wasEditable = (target.contentEditable == "true");
    var wasDisabled = (target.disabled == "true");
    var targetInWindow = target.parentElement && target.parentElement.tagName == 'LIVELY-WINDOW';
    return [
      ["show", (evt) => {
         this.hide();
         lively.showElement(target);
      }],
      ["browse template source", (evt) => {
         this.hide();
         lively.showSource(target, evt);
      }],
      ["browse class source", (evt) => {
         this.hide();
         lively.showClassSource(target, evt);
      }],
      // ["trace", (evt) => {
      //    System.import("src/client/tracer.js").then(tracer => {
      //      tracer.default.traceObject(target);
      //    });
      //    this.hide();
      // }],
      ["remove", (evt) => {
         target.remove()
         this.hide();
      }],
      ["go back", (evt) => {
        target.parentElement.insertBefore(target, target.parentElement.childNodes[0])
         this.hide();
      }],
      ["come forward", (evt) => {
        target.parentElement.appendChild(target)
        this.hide();
      }],
      
      [
        "make space", (evt) => {
          Layout.makeLocalSpace(target)
          this.hide()
        }
      ],
      [wasEditable ? "make uneditable" : "make editable", (evt) => {
         this.hide();
         target.contentEditable = !wasEditable;
      }],
      [wasDisabled ? "enable" : "disable", (evt) => {
         this.hide();
         target.disabled = !wasDisabled;
      }],
      [targetInWindow ? "strip window" : "open in window", (evt) => {
          this.hide();
          targetInWindow ?
            target.parentElement.embedContentInParent() :
            ContextMenu.openInWindow(target, evt);
        }],
      ["save as...", async (evt) => {
        var name = await lively.prompt("save element as: ", "src/parts/element.html")
        // var name = "foo.html"
        var url = name
        if (!url.match(/https?:\/\//)) {
          url = lively4url + "/" + url 
        }
        var source = ""
        if (name.match(/\.html$/)) {
          source = target.outerHTML  
        } else if (name.match(/\.svg/)) {
          var element = target.querySelector("svg")
          if (!element) throw new Error("Could not find SVG elment in target");
          var extent = lively.getExtent(element)
          var tmp = document.createElement("div")
          tmp.innerHTML = element.outerHTML
          tmp.querySelector("svg").setAttribute("width", extent.x)
          tmp.querySelector("svg").setAttribute("height", extent.y)
          source = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + 
            tmp.innerHTML  
        } else if (name.match(/\.png/)) {
          
          var element
          if (target.tagName == "IMG") 
            element = target
          else
            target.querySelector("img")
          if (!element) throw new Error("Could not find img elment in target");
          // var extent = lively.getExtent(element)
          // var tmp = document.createElement("div")
          // tmp.innerHTML = element.outerHTML
          source = await fetch(element.src).then(r => r.blob())
        } else{
          // fall back to text
          source = target.outerText
        }
        await lively.files.saveFile (url, source)
        lively.notify("saved ", name, 10, () => {
          lively.openBrowser(url)
        })
      }]
    ];
  }
  
  static openCenteredAt(morph, worldContext, evt) {
    worldContext.appendChild(morph);
    lively.setGlobalPosition(morph, pt(evt.clientX, evt.clientY)
      .subPt(lively.getExtent(morph).scaleBy(0.5)))
  }
  
  static preferenceEntry(preferenceKey) {
    let enabledIcon = function(enabled) {
      return enabled ? 
        '<i class="fa fa-check-square-o" aria-hidden="true"></i>' :
        '<i class="fa fa-square-o" aria-hidden="true"></i>'    
    }
    
    return [
      Preferences.shortDescription(preferenceKey), (evt, item) => {
        evt.stopPropagation();
        evt.preventDefault();
        
        if (Preferences.get(preferenceKey))  {
          Preferences.disable(preferenceKey)
        } else {
          Preferences.enable(preferenceKey)    
        }
        item.querySelector(".icon").innerHTML = enabledIcon(Preferences.get(preferenceKey)); 
      },"", enabledIcon(Preferences.get(preferenceKey))
    ]
  }
  
  
  
  static worldMenuItems(worldContext) {
    return  [
      ["Workspace", evt => {
        this.hide();
        lively.openWorkspace("", null, worldContext).then(comp => {
          this.positionElementAtEvent(comp.parentElement, worldContext, evt)
        });
      }, "CMD+K", '<i class="fa fa-window-maximize" aria-hidden="true"></i>'],
      ["Browse/Edit", evt => {
          var container = _.last(document.querySelectorAll("lively-container"));
          this.openComponentInWindow("lively-container", evt, worldContext).then(comp => {
            if (container)
              comp.followPath("" + container.getURL());
            else
              comp.followPath(lively4url +"/");
            comp.parentElement.style.width = "950px";
            comp.parentElement.style.height = "600px";
            this.positionElementAtEvent(comp.parentElement, worldContext, evt)
          });
        }, 
        "CMD+SHIFT+B", '<i class="fa fa-cogs" aria-hidden="true"></i>'],
      // ["File Editor", evt => this.openComponentInWindow("lively-editor", evt)],
      // ["File Browser", evt => this.openComponentInWindow("lively-file-browser", evt)],
      ["Component Bin", evt => 
        this.openComponentInWindow("lively-component-bin", evt, worldContext),
       "CMD+O", '<i class="fa fa-th" aria-hidden="true"></i>'],
      ["Insert", [
        ["Text", evt => {
          var morph  = document.createElement("p");
          morph.innerHTML = "Hello";
          morph.contentEditable = true;
          worldContext.appendChild(morph);
          this.openCenteredAt(morph, worldContext, evt)          
          lively.hand.startGrabbing(morph, evt)
          if (worldContext === document.body) {
            morph.classList.add("lively-content")
          }
          this.hide();
        }, "", '<i class="fa fa-font" aria-hidden="true"></i>'],
        ["Rectangle", evt => {
          var morph  = document.createElement("div");
          morph.style.width = "200px";
          morph.style.height = "100px";
          morph.style.border = "1px solid black"
          
          this.openCenteredAt(morph, worldContext, evt)          
          // morph.style.backgroundColor = "blue";
          if (worldContext === document.body) {
            morph.classList.add("lively-content")
          }
          morph.style.backgroundColor = 'rgba(40,40,80,0.5)';
          lively.hand.startGrabbing(morph, evt)
          

          this.hide();
        }, "", '<i class="fa fa-square-o" aria-hidden="true"></i>'],
         ["Drawing", async evt => {
          var morph  = document.createElement("lively-drawboard");
          morph.setAttribute("width", "400px");
          morph.setAttribute("height", "400px");
          await lively.components.openIn(worldContext, morph);

          this.openCenteredAt(morph, worldContext, evt)          
          lively.hand.startGrabbing(morph, evt)
          // morph.style.backgroundColor = "blue";
          if (worldContext === document.body) {
            morph.classList.add("lively-content")
          }
          morph.style.backgroundColor = 'rgb(255,250,205)';
          this.hide();
        }, "", '<i class="fa fa-pencil-square-o" aria-hidden="true"></i>'], 
        ["Button", async evt => {
          var data = await fetch(lively4url + "/src/parts/button.html").then(t => t.text())
          var morph  = lively.clipboard.pasteHTMLDataInto(data, worldContext).childNodes[0];
          this.openCenteredAt(morph, worldContext, evt)          
          lively.hand.startGrabbing(morph, evt)
          // morph.style.backgroundColor = "blue";
          if (worldContext === document.body) {
            morph.classList.add("lively-content")
          }
          this.hide();
        }]
      ]],
      ["Tools", [
        // ["Services", evt => this.openComponentInWindow("lively-services", evt)],
        // ["Terminal", evt => this.openComponentInWindow("lively-terminal", evt)],
        ["Console", evt => this.openComponentInWindow("lively-console", evt, worldContext), 
          "CMD+J", '<i class="fa fa-terminal" aria-hidden="true"></i>'],
        ["Search", evt => this.openComponentInWindow("lively-search", evt, worldContext),
          "CMD+SHIFT+F",'<i class="fa fa-search" aria-hidden="true"></i>'],
        // ['Debugger', evt => lively.openDebugger().then( cmp), 
        //   "", '<i class="fa fa-chrome" aria-hidden="true"></i>'],
        ["Test Runner", evt => this.openComponentInWindow("lively-testrunner", evt, worldContext),
          "", '<i class="fa fa-check-square-o" aria-hidden="true"></i>'],
        ["Drawboard", evt => this.openComponentInWindow("lively-drawboard", evt, worldContext),
          "", '<i class="fa fa-pencil-square-o" aria-hidden="true"></i>'],
        ["Storage Setup", evt => this.openComponentInWindow("lively-filesystems", evt, worldContext),
          "", '<i class="fa fa-cloud" aria-hidden="true"></i>'],
        ["Graph Control", evt => this.openComponentInWindow("graph-control", evt, worldContext),
          "Ctrl+Alt+G", '<i class="fa fa-globe" aria-hidden="true"></i>'],
        ["Diary", evt => this.openComponentInWindow("research-diary", evt, worldContext),
          "Ctrl+Alt+D", '<i class="fa fa-book" aria-hidden="true"></i>'],
      ]],
      [
        "Windows", 
        Windows.allWindows().map(ea => [
          "" + ea.getAttribute("title"),
          () => lively.gotoWindow(ea)
        ])
      ],
      ["View", [
        ["Reset View", (evt) => ViewNav.resetView(), 
          "",'<i class="fa fa-window-restore" aria-hidden="true"></i>'],
        
        !document.webkitIsFullScreen ?
            ["Enter Fullscreen", (evt) => {
                document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT)
              },
              "F11", '<i class="fa fa-arrows-alt" aria-hidden="true"></i>'
            ] :
            ["Leave Fullscreen", (evt) => document.webkitCancelFullScreen(),
              "F11", '<i class="fa fa-times-circle-o" aria-hidden="true"></i>'
          ],

        ["Gather Windows", (evt) => {
            var pos = pt(0,0)
            _.sortBy(worldContext.querySelectorAll(":scope > lively-window"), ea => {
              return getComputedStyle(ea).zIndex
            }).forEach(ea => {
              lively.setPosition(ea, pos)
              pos = pos.addPt(pt(20,20))
            })
          },
          "", '<i class="fa fa-window-restore" aria-hidden="true"></i>'
        ],
        ["Explode Windows", (evt) => {
            Layout.expandUntilNoIntersectionsExplosion()
          },
          "", '<i class="fa fa-window-restore" aria-hidden="true"></i>'
        ],
        ["Show Windows", (evt) => {
            var pos = pt(0,0)
            var windowsByWidth = _.groupBy(document.body.querySelectorAll("lively-window"), ea => ea.clientWidth) 
            Object.keys(windowsByWidth).forEach( width => {
              windowsByWidth[width].forEach( ea => {
                lively.setPosition(ea, pos)
                pos = pos.addPt(pt(0, Math.max(lively.getExtent(ea).y, 50) + 10))
              })
              pos = pt(pos.x + Math.min(1000, Number(width)), 0)
            })
          },
          "", '<i class="fa fa-window-restore" aria-hidden="true"></i>',
        ],
        ["Snap All to Grid Now", (evt) => {
          Grid.snapAllTopLevelContent()
        },
        "", '<i class="fa fa-th" aria-hidden="true"></i>'
        ]
      ]],
      ["Documentation", [
        ["Devdocs.io", (evt) => {
            this.openComponentInWindow("lively-help",  pt(evt.pageX, evt.pageY), worldContext);
          }, 
          "CMD+H", '<i class="fa fa-book" aria-hidden="true"></i>'],
        ["Docs", (evt) => {
          this.openComponentInWindow("lively-container", evt, worldContext).then(comp => {
              comp.followPath(lively4url + "/doc/index.md");
            });
          },
          "",'<i class="fa fa-file-text-o" aria-hidden="true"></i>'
        ],
        ["Journal", (evt) => {
          this.openComponentInWindow("lively-container", evt, worldContext).then(comp => {
            comp.followPath(lively4url + "/doc/journal/index.html");
          });
        }],
        ["Issues", (evt) => {
           this.openComponentInWindow("lively-container", evt, worldContext).then(comp => {
            comp.followPath(lively4url + "/doc/stories.md");
          });
          // window.open("https://github.com/LivelyKernel/lively4-core/issues") ;
        },, '<i class="fa fa-bug" aria-hidden="true"></i>'],
        ["Module Info", (evt) => {
          Info.showModuleInfo()
          },, '<i class="fa fa-info" aria-hidden="true"></i>']
      ]],
      ["Preferences", 
          ["ShowDocumentGrid", "InteractiveLayer", "ShowFixedBrowser", "SnapWindowsInGrid", "DisableAExpWorkspace", "DisableAltGrab", "UseTernInCodeMirror", "UseAsyncWorkspace", "CtrlAsHaloModifier"].map(ea => this.preferenceEntry(ea))
      ],
      ["Sync Github", (evt) => this.openComponentInWindow("lively-sync", evt, worldContext), 
        "CMD+SHIFT+G",'<i class="fa fa-github" aria-hidden="true"></i>'],
      ["save as ..", (evt) => {
        if (worldContext.onSaveAs)
          worldContext.onSaveAs() 
        else html.saveCurrentPageAs();
      }],

      ["Save", (evt) => {
          if (worldContext.onSave)
            worldContext.onSave()
          else
            html.saveCurrentPage();
        },
        "CMD+S", '<i class="fa fa-cloud-upload" aria-hidden="true"></i>']
    ];
  }
  
  static items (target, worldContext) {
    if (!worldContext) worldContext = document.body;
    if (target) {
      return this.targetMenuItems(target);
    } else {
      return this.worldMenuItems(worldContext);
    }
  }
  
  static openIn(container, evt, target, worldContext, optItems) {    
    this.hide();
    this.firstEvent = evt
    lively.addEventListener("contextMenu", document.documentElement, "click", () => {
      this.hide();
    });

    var menu = lively.components.createComponent("lively-menu");
    return lively.components.openIn(container, menu).then(() => {
      if (this.menu) this.menu.remove()
      this.menu = menu;
      if (evt) {
        lively.setGlobalPosition(menu, pt(evt.clientX, evt.clientY))
      }
      // menu.focus()
      lively.focusWithoutScroll(menu)
      menu.openOn(optItems || this.items(target, worldContext), evt).then(() => {
      });
      return menu;
    });
  }
}