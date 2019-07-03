# Home Object Soup Graph

<div>
url <input style="width:500px" id="url" value=""><br>
limit <input id="limit">
</div>

<script>
  const MAX_ELEMENTS = 100
  const GraphvizEngine = "neato" // "dot" , "neato"

  import moment from "src/external/moment.js";  
  import Strings from 'src/client/strings.js'  
  import Colors from "src/external/tinycolor.js"
  import d3 from "src/external/d3.v5.js"
  import beautify from "src/client/js-beautify/beautify.js"
  import {GroupMap} from "src/client/collections.js"

  import {key} from "./home.js" // #Bug #TODO, Home as the default class is undefined in this list...
  import Home from "./home.js" // and here not
  
  import ScriptApp from "./scriptapp.js"
  
  class ObjectGraph extends ScriptApp {
    
    static async create(ctx) {
      // var url = "livelyfile:///object-storage.zip"
      var url = "http://localhost:9005/Desktop/object-storage.zip"
      this.home = new Home(url)
      var home = this.home

      this.ctx = ctx
  

      this.get("input#url").value = url
      var limitElement = this.get("input#limit")

      limitElement.value = MAX_ELEMENTS
      
      var urlElement = this.get("input#url")
      var container = this.get("lively-container");
      var graphviz = await (<graphviz-dot engine={GraphvizEngine} server="true"></graphviz-dot>)
      
      
      var width = 1800
      var height = 1200
      
      
      graphviz.style.width = width + "px"
      graphviz.style.height = height +"px"


      var limit = Number(limitElement.value)
      limitElement.addEventListener("change", function(evt) {
          limit = Number(this.value)
          updateTable() // on Enter
      });
      
      urlElement.addEventListener("change", function(evt) {
        url = this.value
        updateTable() // on Enter
      });
      
      this.home.objectLimit = limitElement.value
      await this.home.updateData()
      
      var objects
      var edges
      var nodes
      
      var outgoing = new GroupMap()
      var incoming = new GroupMap() 
      
      var selectedChange 
      var selectedNode 
      var lastSelectedNode

      var linkToFilenameMap

      function linkToFilename(link) {
        return linkToFilenameMap.get(link)
      }

      function key(id) {
        if (!id) throw ("id missing")
        return "_" + id.replace(/.*\//,"").replace(/[^a-z0-9A-Z_]/g,"")
      }


      function addEdge(a , b, style="") {
        outgoing.add(key(a), key(b))
        incoming.add(key(b), key(a))
        
        edges.add(key(a)  + " -> " +  key(b) + style)
      }
      
      var classColors = new Map()
   

      var updateTable = async () => {

        objects = new Map()
        edges = new Set()
        nodes = new Map()

        if (!zip) {
          var zip = window.SmalltalkHomeObjects
          var blob = await fetch(url).then(r => r.blob())
          zip = await JSZip.loadAsync(blob)
          window.SmalltalkHomeObjects = zip
        }
        var data  =  Object.keys(zip.files)
        
        linkToFilenameMap = new Map()
        data.forEach(ea => {
          var link = ea.replace(/.*\//,"").replace(/[^0-9A-Za-z]/g,"")
          linkToFilenameMap.set(link, ea)
        })

        data = data.reverse()

        var it = new Map()
        
        
        var progress = await lively.showProgress("update");
        var total = data.length;
        var i=0
        var start = performance.now()
        
        var addNode = async (eaName) => {
          console.log("addObject ")
          if (i > 100) {
            debugger
          }
          if (objects.get(key(eaName))) {
            console.log("stop " + eaName)
            return key(eaName) // we have it already
          }
          var unfinished=false
          var ea = this.home.objectMap.get(eaName)
          if (ea.object) {
            if (ea.object._class == "CreativeWork") {
              if (_.isArray(ea.object.additionalState.tags)) {
                  if (ea.object.additionalState.tags.includes("live programming study")) {
                    return
                  }
              }
              // return 
            }
          } else {
            // could not parse
            if (ea.transformed.match(/_class: 'CreativeWork'/))
              return 
          }

          objects.set(key(eaName), ea)
          if (ea.links) { 
            for(var link of ea.links) {
              if (!objects.get(key(link))) {
                if (i < limitElement.value) {
                  var filename = linkToFilename(link)
                  if (filename) {
                    if (await addNode(filename)) {
                      addEdge(eaName, link, `[color="gray"]`)            
                    }
                  } else {
                    console.log("could not find file for:" + link)
                    debugger
                  }
                } else {
                  unfinished=true
                  
                }
              } else {
                addEdge(eaName, link, `[color="gray"]`)      
              }
            }            
          }

          var style
          var size = ea.contents ? Math.sqrt(ea.contents.length) / 20 : 0
          if (ea.object) {
            var color = classColors.get(ea.object._class)
            if (!color) {
              color = Colors.random().desaturate().toHexString()
              classColors.set(ea.object._class, color)
            }
            style = `[style="${unfinished ? "" : "filled"}" color="${color}"  label="${i} ${ea.object._class}"]`  // style="filled" 
          } else {
            style = `[fontcolor="red" label="ERROR" width="${size}" height="${size}"]`
          }
          console.log("NODE " + key(eaName))
          console.log("add " + i + " " + eaName)
          progress.value = i++ / total

          nodes.set(key(eaName), key(eaName) + style)
          return key(eaName)
        }
        
        
        try {
          for(var eaName of data) {
              await this.home.addObject(eaName)
          }
          for(var eaName of data) {
            if (i > limitElement.value) break; 
            await addNode(eaName)
          }
        } finally {
          progress.remove()
        
        }
        lively.notify("loaded in " + Math.round(performance.now() - start) + "ms")
        
        // AND NOW we filter the last time
        
        var totalNodesCount = 0
        var renderedNodesCount = 0
        
        Array.from(nodes.keys()).forEach(key => {
          
        totalNodesCount ++
          if (incoming.get(key).size == 0 && outgoing.get(key).size == 0) {
            nodes.delete(key)
          } else {
          renderedNodesCount ++ 
          }
        })
        
        console.log("total nodes: " + totalNodesCount + " rendered: " +renderedNodesCount )
        
// 
// overlap=scale;
        var source = `digraph {
          rankdir=LR;
          edge [ len=2] 
        
          node [ style="filled" color="lightgray" fontsize="8pt" fontname="helvetica"]; 
          ${Array.from(edges).join(";")} 
          ${Array.from(nodes.values()).join(";")} 
        }`
          
          
        graphviz.innerHTML = `<` +`script type="graphviz">`+source+ `<` + `/script>}`
        var start = performance.now()
        await graphviz.updateViz()
        lively.notify("layouted  in " + Math.round(performance.now() - start) + "ms" )
        
        var svg = graphviz.get("svg")
        var zoomElement = document.createElementNS("http://www.w3.org/2000/svg", "g")
        
        var zoomG = d3.select(zoomElement)
        
        
        // TODO does not work D3 kommt durcheinander...
//         if (window.lively4LastD3ZoomTransform) {
//           zoomG.attr("transform", window.lively4LastD3ZoomTransform); // preserve context through development...
//         }
        
        var svgOuter = d3.select(svg)
        var svgGraph = d3.select(graphviz.get("#graph0"))
        
        svgOuter
          .style("pointer-events", "all")        
          .call(d3.zoom()
              .scaleExtent([1 / 30, 30])
              .on("zoom", () => {
                details.hidden = true
                var trans = d3.event.transform
                // window.lively4LastD3ZoomTransform = trans
                zoomG.attr("transform", trans);
              }));
        
        svg.appendChild(zoomElement)
        zoomElement.appendChild(graphviz.get("#graph0"))
        
        
        
        graphviz.shadowRoot.querySelectorAll("g.node").forEach(ea => {
          d3.select(ea).style("pointer-events", "all")
          ea.addEventListener("click", async (evt) => {
            // lively.showElement(ea)
            var key = ea.querySelector('title').textContent
            var object = objects.get(key)
                        
            if (evt.shiftKey) {
              lively.openInspector({
                element: ea,
                key: key,
                objects: objects,
                data: object
              })
              return
            }
            selectedNode = ea
            selectedChange = object
            
            
            if(object) {
              if (lastSelectedNode == selectedNode) {
                details.hidden = true
                selectedNode = undefined
              } else {
                // if (selectedNode) {
                //   selectedNode.querySelector("polygon,ellipse").setAttribute("fill", "none")
                // }
                // selectedNode.querySelector("polygon,ellipse").setAttribute("fill", "lightgray")
                details.hidden = false
                if (object.object) {
                  details.value = "(" +JSON.stringify(object.object, undefined, 2) +")"
                } else if (object.error) {
                  details.value = `// ERROR: ${object.error} \n` +global.js_beautify(object.transformed);

                  // details.innerHTML = object.contents + "<br>" + object.error
                } else {

                  details.value = object.contents
                }

                // JSON.stringify(change, undefined, 2)
                lively.setGlobalPosition(details, lively.getGlobalBounds(selectedNode).topRight().addPt(lively.pt(10,0)))            
              }
            }
            
            
            lastSelectedNode = selectedNode
          })
        })
        
      }

      updateTable()

      var details = await (<div id="details"><lively-code-mirror ></lively-code-mirror></div>)
      
      Object.defineProperty(details, 'value', {
        get() { 
          return details.querySelector("lively-code-mirror").value
        },
        set(newValue) { 
          details.querySelector("lively-code-mirror").value = newValue || ""
        },
        enumerable: true,
        configurable: true
      });
      
      var style = document.createElement("style")
      style.textContent = `
      td.comment {
        max-width: 300px
      }
      div#root {
        overflow: visible;
      }
      
      div#details lively-code-mirror {
        width: 100%;
        height: 100%;
      }
      
      div#details {
        position: absolute;
        width: 800px;
        height: 400px;
        background-color: lightgray;
        border: 1px solid gray;
      }
      `
      
      var div = document.createElement("div")
      div.id = "root"
      
      div.appendChild(style)
      div.appendChild(<div>
        <button click={evt => {
          lively.notify("reset")
          reset();
          updateTable()
        }}>reset</button>
        <button click={evt => updateTable()}>update</button>
      </div>)
      div.appendChild(graphviz)
      div.appendChild(details)
      
      return div
    }
  }
  ObjectGraph.create(this)
</script>