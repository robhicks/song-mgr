const path = require('path');
const resolve = require('rollup-plugin-node-resolve');
const root = process.cwd();
const string = require('rollup-plugin-string');
const stylus = require('rollup-plugin-stylus-to-css');
const uglifyEs = require('rollup-plugin-uglify-es');

const input = path.resolve(root, 'src', 'song-mgr.mjs');
const external = ['hyperhtml'];
const globals = {
  hyperhtml: 'hyperHTML'
};

export default [
  {
    input,
    plugins: [
      resolve(),
      string({include: 'src/*.svg'}),
      stylus()
    ],
    output: {
      file: path.resolve(root, 'dist', 'song-mgr.js'),
      format: 'es'
    }
  }
];
