const {exec} = require('child_process');
const port = 5013;

const StaticServer = require('static-server');
const server = new StaticServer({
  rootPath: '.',
  name: 'my-http-server',
  port: port,
  host: '0.0.0.0',
  cors: '*',
  followSymlink: true
});

server.start(() => {
  exec(`./node_modules/.bin/mocha-headless-chrome -f http://127.0.0.1:${port}/demo/mocha.html -a no-sandbox -a disable-setuid-sandbox`, {timeout: 5000}, (err, stdOut, stdErr) => {
    console.log("stdErr", stdErr);
    console.log("stdOut", stdOut);
    if (err) process.exit(-1);
    else process.exit(0);
  });
});
