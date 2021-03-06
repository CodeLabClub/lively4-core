

var myPath = "src/babylonian-programming-editor/worker/ast-worker-babel-wrapper.js"
self.lively4url = self.location.toString().replace(myPath, "");

importScripts("../../worker/livelyworker.js")

// React to messages
onmessage = function(e) {
  System.import("src/babylonian-programming-editor/worker/ast-worker.js")
    .then((m) => {
      m.default(e);
    })
    .catch((error) => {
      postMessage(error);
    });
};
