

// Patches to the meta system

// #ToBeRemoved after https://github.com/LivelyKernel/lively.ast/issues/7 is fixed

if (window.lively) {
  
  lively.ast.parseFunction =  function parseFunction(source, options) {
      var src = '(' + source + ')',
          ast = lively.ast.parse(src, options);
      // /*if (options.addSource) */addSource(ast, src);
      return ast.body[0].expression;
    }

}  