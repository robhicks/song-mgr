song-mgr
========

This a simple app consisting on one native web component. It generates some song data (750 songs) and some artist (50) data. The data is persisted using [localforage](https://github.com/localForage/localForage).

The master *branch* uses [hyperHTML](https://viperhtml.js.org/hyperhtml/documentation/).

Other branches of interest include the *wire-ids* branch which splits the artists and songs rendering template string literals into functions, and the *lit-html* branch which ports the *wire-ids* branch to [lit-html](https://polymer.github.io/lit-html/).

# Installation and Use

Clone the app using git. ```git clone https://github.com/robhicks/song-mgr.git```.

Change to the directory *song-mgr* and using npm or yarn and NodeJs 8.x or greater install the assets:
```npm i```

Then run ```npm run dev``` and point your browser to ```localhost:5005```.

Play around with the other branches. In doing so, you see that the lit-html branch is noticeably faster in liking, disliking and favoriting tracks and artists.
