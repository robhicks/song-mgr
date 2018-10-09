song-mgr
========

This a simple app consisting on one native web component. Its primary purpose is to use hyperHTML as a template tag literal library to create/update DOM and capture events. The app is developed around the concept of a simple song manager, with tracks and artists. To do so, it generates some bogus song data (750 songs) and some bogus artist (50) data. The data is persisted using [localforage](https://github.com/localForage/localForage). If you wish to clear the data, delete the localforage database under IndexDB.

The master *branch* uses [hyperHTML](https://viperhtml.js.org/hyperhtml/documentation/).

Other branches of interest include the *wire-ids* branch which splits the artists and songs rendering template string literals into functions, and the *lit-html* branch which ports the *wire-ids* branch to [lit-html](https://polymer.github.io/lit-html/).

# Installation and Use

Note the app uses [rollup](https://rollupjs.org/guide/en) for bundling. The bundles is an 'es' bundle so it won't run in all browsers. The rollup config and the demo could be modified to allow it to run in browsers supporting the v1 web components spec, either directly or through polyfills.

Clone the app using git. ```git clone https://github.com/robhicks/song-mgr.git```.

Change to the directory *song-mgr* and using npm or yarn and NodeJs 8.x or greater install the assets:
```npm i```

Then run ```npm run dev``` and point your browser to ```localhost:5005```.

Play around with the other branches. In doing so, you'll see that the lit-html branch is noticeably faster in liking, unliking and favoriting tracks and artists. It doesn't appear to be any faster in switching between tracks and artists.
