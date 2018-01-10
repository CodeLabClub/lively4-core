'use strict';

import Morph from 'src/components/widgets/lively-morph.js';
import lively from 'src/client/lively.js';


export default class Search extends Morph {
  initialize() {
    this.windowTitle = "File Search";
    var container = this.get(".container");
    this.registerButtons();
    lively.html.registerInputs(this);
    
    this.shadowRoot.querySelector("#rootsInput").value = lively4url.replace(/.*\//,"");

    ['#rootsInput', '#excludesInput', '#searchInput'].forEach(selector => {
      lively.addEventListener("lively-search", this.get(selector), "keyup", (evt) => { 
          if(evt.keyCode == 13) { 
            try {
              this.onSearchButton(); 
            } catch(e) {
              console.error(e);
            }
          }
      });
    });
      
    var search = this.getAttribute("search");
    if(search) {
      this.get("#searchInput").value = search;
      this.searchFile();
    }
  }

  focus() {
    this.get("#searchInput").focus();
  }
  clearLog(s) {
    this.get("#searchResults").innerHTML="";
  }

  browseSearchResult(url, pattern) {
    return lively.openBrowser(url, true, pattern, undefined, /* lively.findWorldContext(this)*/);
  }

  log(s) {
    s.split(/\n/g).forEach( entry => {
      
      var m = entry.match(/^([^:]*):(.*)$/);
      if (!m) return ;
      var file = m[1];
      var pattern = m[2];
      var url = lively4url + "/../" + file;
      var item = document.createElement("tr");
      var filename = file.replace(/.*\//,"")
      item.innerHTML = `<td class="filename"><a>${filename}</a></td><td><span ="pattern">${
        pattern.replace(/</g,"&lt;")}</span></td>`;
      var link = item.querySelector("a");
      link.href = entry;
      link.onclick = () => {
        this.browseSearchResult(url, pattern);
        return false;
      };
      this.get("#searchResults").appendChild(item);
    });
  }

  onSearchButton() {
      this.setAttribute("search", this.get("#searchInput").value);
      this.searchFile();
  }
  
  getSearchURL() {
    // return "https://lively-kernel.org/lively4S2/_search/files" // #DEV
    if (document.location.host == "livelykernel.github.io")
      return "https://lively-kernel.org/lively4/_search/files";
    else
      return lively4url + "/../_search/files";
  }
  
  get searchRoot() {
    return this.get("#rootsInput").value
  }

  set searchRoot(value) {
    return this.get("#rootsInput").value = value
  }

  searchFile(text) {
    if (text) {
      this.setAttribute("search", text); // #TODO how to specify data-flow / connections...
      this.get("#searchInput").value = text;
    }
    // if (this.searchInProgres) return;
    var search = this.get("#searchInput").value;
    if (search.length < 2) {
      this.get("#searchResults").innerHTML = "please enter a longer search string";
      this.searchInProgres = false;
      return; // this.log("not searching for " + search)
    }
    let start = Date.now();
    this.searchInProgres = true;
    this.clearLog();
    this.get("#searchResults").innerHTML = "searching ..." + JSON.stringify(search);
    fetch(this.getSearchURL(), {
      headers: { 
  	   "searchpattern": search,
  	   "rootdirs": this.searchRoot,
  	   "excludes": this.get("#excludesInput").value,
    }}).then(r => r.text()).then( t => {
      this.searchInProgres = false;
      this.clearLog();
      //this.log('found');
      this.get("#searchResults").innerHTML = `finished in ${Date.now() - start}ms`;
      this.log(t);
    });
  }
  
}
