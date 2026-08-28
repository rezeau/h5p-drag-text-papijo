const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const mode = argv.mode;
  const isProd = (mode === 'production');
  const libraryName = process.env.npm_package_name;

  return {
    mode: mode,
    context: path.resolve(__dirname, 'src/entries'),
    entry: "./dist.js",
    devtool: (isProd) ? undefined : 'inline-source-map',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: `${libraryName}.js`,
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader'
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader'
          ]
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: `${libraryName}.css`
      }),
      new webpack.DefinePlugin({
        'process.env': {
          'NODE_ENV': JSON.stringify(mode)
        }
      })
    ],
    stats: {
      colors: true
    }
  };
};
