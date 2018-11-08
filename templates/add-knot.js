import Morph from "src/components/widgets/lively-morph.js"

import { Graph } from 'src/client/triples/triples.js';

export default class AddKnot extends Morph {

  async initialize() {
    this.windowTitle = "Add Knot";

    let title = this.get("#title");
    title.addEventListener('keyup', event => {
      if (event.keyCode == 13) { // ENTER
        this.save();
      }
    });

    let button = this.get('#save');
    button.addEventListener('click', event => this.save());
  }

  focus() {
    this.get("#title").focus();
  }

  async save() {
    let graph = await Graph.getInstance();

    let directory = this.get('#directory').value;
    let title = this.get('#title').value;
    let fileEnding = this.get('#file-ending').value;

    let knot = await graph.createKnot(directory, title, fileEnding);
    let knotView = await lively.openComponentInWindow("knot-view");
    knotView.loadKnotForURL(knot.url);

    this.afterSubmit(knot);
  }

  // TODO: employ nice event-based approach or AOP/COP
  afterSubmit(knot) {}
}
