var path = require('path'),
    webpack = require('webpack'),
    transformRuntime = require('babel-plugin-transform-runtime').default;

module.exports = {
  target: 'web',
  context: path.resolve(__dirname),
  entry: {
    'kernel': ['./src/kernel.js']
  },
  output: {
    path: __dirname,
    filename: "dist-[name].js"
  },
  devtool: 'source-map',
  module: {
    loaders: [
      { test: /\.jsx?$/, exclude: /(node_modules)/, loader: 'babel',
        query: {
          plugins: [
            "syntax-async-functions",
            "syntax-do-expressions",
            "syntax-function-bind",
            "transform-es2015-modules-commonjs",
            "transform-do-expressions",
            "transform-function-bind",
            "transform-async-to-generator",
            new transformRuntime({
              "polyfill": false,
              "regenerator": true
            })
          ]
        }
      },
      { test: /\.json$/, loader: 'json' }
    ]
  },
  node: {
    fs: 'empty',
    module: 'empty',
    net: 'empty'
  }
};
