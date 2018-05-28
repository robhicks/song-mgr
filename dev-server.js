const liveServer = require('live-server');
const port = 5005;

const params = {
  file: 'index.html',
  host: "0.0.0.0",
  logLevel: 2,
  mount: [['/bower_components', './bower_components'], ['/dist', './dist'], ['/src', './src'], ['/node_modules', './node_modules']],
  open: false,
  port,
  root: 'demo',
  wait: 500
};

liveServer.start(params);
