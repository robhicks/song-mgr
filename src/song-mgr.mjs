import { clone } from './clone.mjs';
import {db } from './db.mjs';
import {getArtists, getSongs} from './getData.mjs';
import css from './song-mgr.styl';
import nav from './nav.mjs';

const {bind, hyper, wire} = hyperHTML;

class SongMgr extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._songs = [];
    this._artists = [];
    this.getData();
  }

  attributeChangedCallback(name, oVal, nVal) {
    if (nVal && !(/{{|_hyper/).test(nVal) && nVal !== oVal) {
      console.log('name', name);
    }
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {}

  activeType() {
    let activeTab = nav.find(n => n.active);
    return activeTab.id.includes('tracks') ? 'tracks' : 'artists';
  }

  getData(filter) {
    this.artists = this.getArtists();
    this.songs = this.getSongs();
  }

  async getArtists(filter = 'artists') {
    let artists = clone(await getArtists());
    if (filter === 'favoriteartists') this.artists = artists.filter(a => a.favorite === true);
    else this.artists = artists;
    this.syncNav();
  }

  async getSongs(filter = 'tracks') {
    this.getArtists();
    let songs = clone(await getSongs());
    if (filter === 'favoritetracks') this.songs = songs.filter(s => s.favorite === true);
    else this.songs = songs;
    this.syncArtists();
    this.syncNav();
  }

  handleEvent(ev) {
    let target = ev.currentTarget;
    let uid = target.getAttribute('uid');
    if (target.classList.contains('nav')) {
      nav.forEach(ni => ni.id === target.id ? ni.active = true : ni.active = false);
      let active = nav.find(n => n.active === true);
      if (/tracks/.test(active.id)) this.getSongs(active.id);
      if (/artists/.test(active.id)) this.getArtists(active.id);
    }
    if (target.name === 'song-like' || target.name === 'song-dislike') {
      let song = this.songs.find(s => s.uid === uid);
      if (target.name === 'song-like') song.likes++;
      else song.dislikes++;
      db.get('songs')
        .then(songs => {
          let dbSong = songs.find(s => s.uid === uid);
          Object.assign(dbSong, clone(song));
          return songs;
        })
        .then(songs => db.put('songs', songs));
      ;
    }
    if (target.name === 'artist-like' || target.name === 'artist-dislike') {
      let artist = this.artists.find(a => a.uid === uid);
      if (target.name === 'artist-like') artist.likes++;
      else artist.dislikes++;
      db.get('artists')
        .then(artists => {
          let dbArtist = artists.find(a => a.uid === uid);
          Object.assign(dbArtist, clone(artist));
          return artists;
        })
        .then(artists => db.put('artists', artists));
      ;
    }
    if (target.name === "song-favorite") {
      let song = this.songs.find(s => s.uid === uid)
      song.favorite = !song.favorite;
      db.get('songs').then(songs => {
        let dbSong = songs.find(s => s.uid === uid);
        Object.assign(dbSong, clone(song));
        return songs;
      })
      .then(songs => db.put('songs', songs));
    }
    if (target.name === "artist-favorite") {
      let artist = this.artists.find(a => a.uid === uid)
      artist.favorite = !artist.favorite;
      db.get('artists').then(artists => {
        let dbArtist = artists.find(a => a.uid === uid);
        Object.assign(dbArtist, clone(artist));
        return artists;
      })
      .then(artists => db.put('artists', artists));
    }
    this.syncNav();
  }

  async syncArtists() {
    this.songs.forEach(s => {
      let artist = this.artists.find(a => a.uid === s.artistId);
      s.artist = artist;
    })
  }

  syncNav() {
    return Promise.all([
      db.get('songs'),
      db.get('artists')
    ])
    .then(results => ({songs: results[0], artists: results[1]}))
    .then(o => {
      nav[0].number = o.songs.length;
      nav[1].number = o.artists.length;
      nav[2].number = this.songs.filter(s => s.favorite === true).length;
      nav[3].number = this.artists.filter(a => a.favorite === true).length;
    })
    .then(() => this.render());
  }

  artist(artist) {
    return wire(artist)`
    <div class="artist">
      <div class="left">
        <h2>${artist.firstname} ${artist.lastname}</h2>
        <div class="the-dash">
          ${artist.birth.toLocaleString('en', {year: 'numeric', month: '2-digit', day: 'numeric'})} -
          ${artist.death.toLocaleString('en', {year: 'numeric', month: '2-digit', day: 'numeric'})}
        </div>
        <div class="country">${artist.country}</div>
        <div class="likes">
          <button name="artist-like" uid="${artist.uid}" onclick="${this}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${artist.likes}
          </button>
          <button name="artist-dislike" uid="${artist.uid}" onclick="${this}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${artist.dislikes}
          </button>
          <button uid="${artist.uid}" name="artist-favorite" onclick="${this}">
            <img class="${artist.favorite === true ? '' : 'hidden'}" src="../src/favorite.selected.svg"></img>
            <img class="${artist.favorite !== true ? '' : 'hidden'}" src="../src/favorite.unselected.svg"></img>
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${artist.picture}"></img>
      </div>
    </div>
    `;
  }

  track(song) {
    return wire(song)`
    <div class="track">
      <div class="left">
        <h2>${song.name}</h2>
        <div class="tagline">${song.tagline}</div>
        <div class="artist">${song.artist.firstname} ${song.artist.lastname}</div>
        <div class="released">${song.releaseDate.toLocaleString('en', {year: 'numeric', month: '2-digit', day: 'numeric'})}</div>
        <div class="label">${song.label}</div>
        <div class="likes">
          <button name="song-like" uid="${song.uid}" onclick="${this}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${song.likes}
          </button>
          <button name="song-dislike" uid="${song.uid}" onclick="${this}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${song.dislikes}
          </button>
          <button uid="${song.uid}" name="song-favorite" onclick="${this}">
            <img class="${song.favorite === true ? '' : 'hidden'}" src="../src/favorite.selected.svg"></img>
            <img class="${song.favorite !== true ? '' : 'hidden'}" src="../src/favorite.unselected.svg"></img>
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${song.image}"></img>
      </div>
    </div>
    `;
  }

  render() {
    hyper(this.shadowRoot)`
    <style>${css}</style>
    <nav>
    ${nav.map(n => wire()`
      <button class="${n.active ? 'active nav' : 'nav'}" name="${n.id}" id="${n.id}" onclick="${this}">${n.name} (${n.number})</button>
    `)}
    </nav>
    <section id="tracks" class="${this.activeType() === 'tracks' ? '' : 'hidden'}">
      ${Array.isArray(this.songs) ? this.songs.map(song => this.track(song)) : ''}
    </section>
    <section id="artists" class="${this.activeType() === 'artists' ? '' : 'hidden'}">
      ${Array.isArray(this.artists) ? this.artists.map(artist => this.artist(artist)) : ''}
    </section>
    `;
  }

  get artists() {
    return this._artists;
  }

  set artists(artists) {
    this._artists = artists;
  }

  get songs() {
    return this._songs;
  }

  set songs(songs) {
    this._songs = songs;
  }

  static get observedAttributes() {
    return [];
  }
}

customElements.get('song-mgr') || customElements.define('song-mgr', SongMgr);

export { SongMgr };
