const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  mode: 'development',
  devServer: {
    open: true,
    port: 5173,
    client: {
      overlay: true // Show application errors
    },
    historyApiFallback: {
      index: 'index.html'
    },
    static: './public'
  },
  devtool: 'inline-source-map'
})
