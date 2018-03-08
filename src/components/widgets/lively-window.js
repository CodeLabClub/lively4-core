import Morph from 'src/components/widgets/lively-morph.js';
import {pt} from 'src/client/graphics.js';
import {Grid} from 'src/client/morphic/snapping.js';
import Preferences from 'src/client/preferences.js';

export default class Window extends Morph {

  get title() {
    return this._title
  }
  set title(val) {
    this._title = val
    this.render();
  }
  get isWindow() { return true }
  get minimizedWindowWidth() { return 300 }
  get minimizedWindowPadding() { return 10 }

  get active() { return this.hasAttribute('active')}
  get isFixed() { return this.hasAttribute('fixed')}
  get titleSpan() { return this.get('.window-title span') }
  get target() { return this.childNodes[0]}
  get window() { return this.get('.window') }
  get maxButton() { return this.get('.window-max')}
  get windowTitle() { return this.get('.window-title')}

  setExtent(extent) {
    lively.setExtent(this, extent)
    if (this.target) 
      this.target.dispatchEvent(new CustomEvent("extent-changed"))
  }

  initialize() {
    this.setup();
    
    this.created = true;
    this.render();

    if (this.isMinimized() || this.isMaximized())
      this.displayResizeHandle(false);

    this.setAttribute("tabindex", 0)
  }
  
  attachedCallback() {
    if (this.parentElement === document.body) {
       this.classList.add("global")
    } else {
       this.classList.remove("global")
    }
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    switch (attrName) {
      case 'title':
        this.render();
        break;
      case 'icon':
        this.render();
        break;
      case 'fixed':
        this.reposition();
        break;
      default:
        //
    }
  }

  bindEvents() {
    try {
      this.addEventListener('created', (evt) => this.focus());
      this.addEventListener('extent-changed', (evt) => { this.onExtentChanged(); });
      this.windowTitle.addEventListener('pointerdown', (evt) => { this.onTitleMouseDown(evt) });
      this.windowTitle.addEventListener('dblclick', (evt) => { this.onTitleDoubleClick(evt) });
      this.addEventListener('mousedown', (evt) => lively.focusWithoutScroll(this), true);
      this.get('.window-menu').addEventListener('click', evt => { this.onMenuButtonClicked(evt); });
      this.get('.window-min').addEventListener('click', evt => { this.onMinButtonClicked(evt); });
      this.maxButton.addEventListener('click', evt => { this.onMaxButtonClicked(evt); });
      this.addEventListener('dblclick', evt => { this.onDoubleClick(evt); });
      this.get('.window-close').addEventListener('click', evt => { this.onCloseButtonClicked(evt); });
      this.addEventListener('keyup', evt => { this.onKeyUp(evt); });
    } catch(err) {
      console.log("Error, binding events! Continue anyway!", err)
    }
  }
  
  onKeyUp(evt) {
    var char = String.fromCharCode(evt.keyCode || evt.charCode);
    if ((evt.altKey || evt.ctrlKey) && char == "W") {
      this.onCloseButtonClicked(evt)
      evt.preventDefault();
    }
  }

  setup() {
    this.dragging = false;
    this.bindEvents();
  }

  /*
   * Window methods
   */
  render() {
    if (this.created) {
      var icon = this.attributes['icon'];
      var title = this.attributes['title'];
      var content = '';
      if (icon && title) {
        content = icon.value + ' ' + title.value.slice(0, 50);
      } else if (icon) {
        content = icon.value;
      } else if (title) {
        content = title.value.slice(0, 50);
      }
      this.titleSpan.innerHTML = content;
    }
  }

  reposition() {
    let pos = lively.getGlobalPosition(this);
    if (this.isFixed) {
      lively.setPosition(this, pos);
      this.classList.add('window-fixed');
    } else {
      lively.setPosition(this, pos.addPt(lively.getScroll()))
      this.classList.remove('window-fixed') 
    }
  }

	get minZIndex() {
		return 100
	}
	
  allWindows() {
    return Window.allWindows()
	}

  static allWindows() {
    return Array.from(document.querySelectorAll('*')).filter(ea => ea.isWindow);
	}

  isFullscreen() {
    return this.get(".window-titlebar").style.display == "none"
  }
  
  focus(evt) {
    let allWindows = this.allWindows();
    let thisIdx = allWindows.indexOf(this);
    let allWindowsButThis = allWindows;
    allWindowsButThis.splice(thisIdx, 1);
    allWindowsButThis.sort((a, b) => {
      return parseInt(a.style['z-index']) - parseInt(b.style['z-index']);
    });

    allWindowsButThis.forEach((win, index) => {
      win.style['z-index'] = this.minZIndex + index;
      if (win.window)
        win.window.classList.remove('focused');
      win.removeAttribute('active');
    });
    
    if (this.isFullscreen()) {
      // fullscreen and everything is in front of me...
      this.style['z-index'] = 0;
    } else {
      this.style['z-index'] = this.minZIndex + allWindowsButThis.length;
    
    }
    
    this.window.classList.add('focused');
    this.setAttribute('active', true);
    
    // this.bringMinimizedWindowsToFront()
    
    if (this.target && this.target.focus) this.target.focus()
  }

	bringMinimizedWindowsToFront() {
	  var allWindows = this.allWindows();
		allWindows.filter(ea => ea.isMinimized()).forEach( ea => {
      ea.style['z-index'] = this.minZIndex + allWindows.length +1
    });
	}
	
  onMinButtonClicked(evt) {
    if (evt.shiftKey) {
      document.scrollingElement.scrollTop = 0
      document.scrollingElement.scrollLeft = 0
      lively.moveBy(document.body, lively.getGlobalPosition(this).scaleBy(-1))
      lively.setExtent(this, lively.getExtent(this).withY(window.innerHeight - 8))
    } else {
      this.toggleMinimize()
    }
    evt.stopPropagation()
  }

  onMaxButtonClicked(evt) {
    if (evt.shiftKey) {
      this.togglePined() 
    } else {
      this.toggleMaximize()
    }
  }

  toggleMaximize() {
    if (this.positionBeforeMaximize) {
      $('i', this.maxButton).removeClass('fa-compress').addClass('fa-expand');

      this.style.position = "absolute"
      lively.setGlobalPosition(this, 
        pt(this.positionBeforeMaximize.x, this.positionBeforeMaximize.y)
      );
      this.setExtent(pt(this.positionBeforeMaximize.width, this.positionBeforeMaximize.height))
      document.body.style.overflow = this.positionBeforeMaximize.bodyOverflow

      this.positionBeforeMaximize = null
    } else {
      if (this.isMinimized()) {
        return this.toggleMinimize()
      }

      $('i', this.maxButton).removeClass('fa-expand').addClass('fa-compress');

      var bounds = this.getBoundingClientRect()
      this.positionBeforeMaximize = {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
        bodyOverflow: document.body.style.overflow
      }

      this.style.position = "fixed"
      this.style.top = 0;
      this.style.left = 0;
      this.style.width = "100%";
      this.style.height= "100%";
      document.body.style.overflow = "hidden"
      if (this.target) 
        this.target.dispatchEvent(new CustomEvent("extent-changed"))
    }
    this.bringMinimizedWindowsToFront()
    this.displayResizeHandle(!this.isMaximized())
  }

  displayResizeHandle(bool) {
    if (bool === undefined) bool = true;
    this.get('lively-resizer').style.display =
      bool ? "block" : "none";
  }

  toggleMinimize() {
    // this.style.display = this.isMinimized() ?
    //   'block' : 'none';
      
    // if(this.isMinimized())
    //   this.removeAttribute('active');
      
      
    var content = this.get('#window-content');
    if (this.positionBeforeMinimize) {
      this.minimizedPosition = lively.getPosition(this)


      lively.setPosition(this, this.positionBeforeMinimize)
      // this.setExtent(this.extentBeforeMinimize);  
      content.style.display = "block";
      this.displayResizeHandle(true)
      this.positionBeforeMinimize = null
      
      // this.classList.removed("minimized")
      this.style.transformOrigin = "" 
      this.style.transform = "" 

      content.style.pointerEvents = ""

    } else {
      if (this.isMaximized()) {
        return this.toggleMaximize()
      }
      // this.style['z-index'] = 100
      this.positionBeforeMinimize = lively.getPosition(this)
      // this.extentBeforeMinimize = lively.getExtent(this)
      
      
      
      if (this.minimizedPosition) {
        lively.setPosition(this, this.minimizedPosition) 
      }
    
      // this.style.position = "fixed";
      // this.style.left = "";
      // this.style.top = this.minimizedWindowPadding +"px";
      // this.style.right = this.minimizedWindowPadding + "px";
      // lively.setGlobalPosition()
      
      this.style.transformOrigin = "0 0" 
      this.style.transform = "scale(0.4)" 
      
      content.style.pointerEvents = "none"
      
      this.displayResizeHandle(false)
   
    }
    this.bringMinimizedWindowsToFront()
  }

  isMinimized() {
    return !!this.positionBeforeMinimize
  }

  isMaximized() {
    return !!this.positionBeforeMaximize;
  }

  togglePined() {
    let isPinned = this.style.position == "fixed"
    if (isPinned) {
      this.removeAttribute('fixed');
      this.style.position = "absolute" // does not seem to work with css? #Jens
    } else {
      this.setAttribute('fixed', '');
      this.style.position = "fixed" // does not seem to work with css? #Jens
    }
  }

  async onCloseButtonClicked(evt) {
    if (this.target && this.target.unsavedChanges && this.target.unsavedChanges()) {
      if(!await lively.confirm("Window contains unsaved changes, close anyway?"))  {
        return 
      }
    }
    if (this.positionBeforeMaximize)
      this.toggleMaximize()

    this.parentNode.removeChild(this);
  }

  onMenuButtonClicked(evt) {
    lively.openContextMenu(document.body, evt, this.target);
  }

  onTitleMouseDown(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    lively.focusWithoutScroll(this)
    
    if(this.positionBeforeMaximize) return; // no dragging when maximized

    if (this.isFixed) {
      let offsetWindow =  this.getBoundingClientRect()
      this.dragging = pt(evt.pageX - offsetWindow.left, evt.pageY - offsetWindow.top)

    } else {
      this.draggingStart = lively.getPosition(this)
      if (isNaN(this.draggingStart.x) || isNaN(this.draggingStart.y)){
        throw new Error("Drag failed, because window Position is not a number")
      }
      this.dragging = pt(evt.clientX, evt.clientY)
    }
    lively.removeEventListener('lively-window-drag', this.windowTitle)
    
    this.windowTitle.setPointerCapture(evt.pointerId)
    lively.addEventListener('lively-window-drag', this.windowTitle, 'pointermove', 
      evt => this.onWindowMouseMove(evt), true);
    lively.addEventListener('lively-window-drag', this.windowTitle, 'pointerup', 
      evt => this.onWindowMouseUp(evt));
    this.window.classList.add('dragging', true);
  }

  onWindowMouseMove(evt) {
    // lively.showEvent(evt)

    if (this.dragging) {
      evt.preventDefault();
      evt.stopPropagation();
      
      if (this.isFixed) {
        lively.setPosition(this, pt(evt.clientX, evt.clientY).subPt(this.dragging));
      } else {
        var pos = this.draggingStart.addPt(pt(evt.pageX, evt.pageY))
          .subPt(this.dragging).subPt(lively.getScroll())
        lively.setPosition(this, Grid.optSnapPosition(pos, evt))
      }
    }
  }

  onWindowMouseUp(evt) {
    evt.preventDefault();
    this.dragging = false;
    this.windowTitle.releasePointerCapture(evt.pointerId)
    this.window.classList.remove('dragging');
    this.window.classList.remove('resizing');
    lively.removeEventListener('lively-window-drag', this.windowTitle)
  }

  onExtentChanged(evt) {
    if (this.target) {
      this.target.dispatchEvent(new CustomEvent("extent-changed"));
    }
  }

  onDoubleClick(evt) {
    if (this.isMinimized()) {
      this.toggleMinimize()
    }
  }

  onTitleDoubleClick(evt) {
    this.toggleMaximize()
    evt.stopPropagation()
  }

  livelyMigrate(oldInstance) {
    // this is crucial state
    this.positionBeforeMaximize = oldInstance.positionBeforeMaximize;
    this.positionBeforeMinimize = oldInstance.positionBeforeMinimize;
  }
  
  getAddOnRoot() {
    return this.shadowRoot.querySelector("#window-global")
  }
  
  /* embed content in parent and remove yourself */
  embedContentInParent() {
  	var content = this.querySelector("*")
  	var pos = lively.getPosition(this);
  	this.parentElement.appendChild(content);
  	lively.setPosition(content, pos);
  	this.remove()
  }


}
