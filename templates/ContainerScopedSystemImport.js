import {proceed, create as layer}  from "src/external/ContextJS.js"
import * as cop  from "src/external/ContextJS.js"
import lively from "src/client/lively.js"

export default class ScopedSystemImport {
  
  
}

layer(ScopedSystemImport, "ImportLayer").refineObject(lively, {
	import(name, parentName, parentAddress) {
		name = name.replace(/^.\//, ScopedSystemImport.documentRoot);
		// lively.notify("import "+ name + ", " + parentName +","+ parentAddress)
		return cop.proceed(name, parentName, parentAddress);
	}
});

ScopedSystemImport.documentRoot = lively4url; 