// let Ofetch = fetch;
// fetch = function(...args) {
//   console.warn('FETCH' + args[0].url)
//   return Ofetch(...args);
// }


console.log("HUHU lets go 3!!!")
self.addEventListener('install', (event) => {
  console.log("HUHU Install")
})

self.oninstall = function() {
  console.log("HUHU on install ") // why are they not called? Sometimes they are?
}


function getChromeVersion () {     
    var raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
    return raw ? parseInt(raw[2], 10) : false;
}

// console.log("chrome version: " + getChromeVersion())
var postfix = ""

// #TODO only while developing
// postfix += Date.now()

postfix = "" // because 

if (getChromeVersion() < 60) {
  console.log("disable SWX for now")
} else {
  console.log("ok, lets work on it... SWX")

  importScripts('swx-pre.js?' + postfix);
  
  try {
    importScripts('swx-boot.js?'+ postfix);
  } catch(e) {
    debugger
  }
  
  console.log("boot loaded...")
  importScripts('swx-post.js?' + postfix);
}