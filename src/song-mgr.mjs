import { clone } from './clone.mjs';
import { db } from './db.mjs';
import { getArtists, getSongs } from './getData.mjs';
import css from './song-mgr.styl';
import nav from './nav.mjs';
import { html, render } from '../node_modules/lit-html/lib/lit-extended.js';

class SongMgr extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._songs = [];
    this._artists = [];
    this.getData();
  }

  activeType() {
    let activeTab = nav.find(n => n.active);
    return activeTab.id.includes('tracks') ? 'tracks' : 'artists';
  }

  artist(artist) {
    return html`
    <div class="artist">
      <div class="left">
        <h2>${artist.firstname} ${artist.lastname}</h2>
        <div class="the-dash">
          ${artist.birth.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })} -
          ${artist.death.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })}
        </div>
        <div class="country">${artist.country}</div>
        <div class="likes">
          <button name="artist-like" uid="${artist.uid}" onclick="${this.like.bind(this, artist)}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${artist.likes}
          </button>
          <button name="artist-dislike" uid="${artist.uid}" onclick="${this.dislike.bind(this, artist)}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${artist.dislikes}
          </button>
          <button uid="${artist.uid}" name="artist-favorite" onclick="${this.toggleFavorite.bind(this, artist)}">
            ${artist.favorite === true ? html`
              <img src="../src/favorite.selected.svg"></img>
            ` : html`
              <img src="../src/favorite.unselected.svg"></img>
            `}
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${artist.picture}"></img>
      </div>
    </div>
    `;
  }

  attributeChangedCallback(name, oVal, nVal) {
    if (nVal && !/{{|_hyper/.test(nVal) && nVal !== oVal) {
      console.log('name', name);
    }
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector('#tracks').classList.add('active');
  }

  dislike(thing) {
    thing.dislikes++;
    this.syncNav();
    this.render();
    this.save(thing);
  }

  disconnectedCallback() {}

  changeNav(ev) {
    let navItems = this.shadowRoot.querySelectorAll('button.nav');
    navItems.forEach(ni => ni.classList.remove('active'))
    const target = ev.currentTarget;
    const id = target.id;
    nav.forEach(n => n.active = false);
    let selected = nav.find(n => n.id === id);
    selected.active = true;
    target.classList.add('active');
    if (/tracks/.test(selected.id)) this.getSongs(selected.id);
    if (/artists/.test(selected.id)) this.getArtists(selected.id);
    this.render();
  }

  async getArtists(filter = 'artists') {
    let artists = clone(await getArtists());
    if (filter === 'favoriteartists') this.artists = artists.filter(a => a.favorite === true);
    else this.artists = artists;
    this.syncNav();
  }

  getData(filter) {
    this.artists = this.getArtists();
    this.songs = this.getSongs();
  }

  async getSongs(filter = 'tracks') {
    this.getArtists();
    let songs = clone(await getSongs());
    if (filter === 'favoritetracks') this.songs = songs.filter(s => s.favorite === true);
    else this.songs = songs;
    this.syncArtists();
    this.syncNav();
  }

  like(thing) {
    thing.likes++;
    this.syncNav();
    this.render();
    this.save(thing);
  }

  render() {
    const template = html`
    <style>${css}</style>
    <nav>
    ${nav.map(n => html`
      <button class="nav" name="${n.id}" id="${n.id}" onclick="${this.changeNav.bind(this)}">${n.name} (${n.number})</button>
    `
    )}
    </nav>
    ${this.activeType() === 'tracks'
      ? html`
      <section id="tracks">
        ${Array.isArray(this.songs) ? this.songs.map(song => this.track(song)) : ''}
      </section>
      `
      : html`
      <section id="artists">
        ${Array.isArray(this.artists) ? this.artists.map(artist => this.artist(artist)) : ''}
      </section>
      `
    }
    `;
    render(template, this.shadowRoot);
  }

  async syncArtists() {
    this.songs.forEach(s => {
      let artist = this.artists.find(a => a.uid === s.artistId);
      s.artist = artist;
    });
  }

  save(thing) {
    const keys = Object.keys(thing);
    let type;
    if (keys.includes('firstname')) type = 'artists';
    else type = 'songs';

    db
    .get(type)
    .then(items => {
      let item = items.find(i => i.uid === thing.uid);
      Object.assign(item, clone(thing));
      return items;
    })
    .then(items => db.put(type, items));
  }

  syncNav() {
    return Promise.all([db.get('songs'), db.get('artists')])
      .then(results => ({ songs: results[0], artists: results[1] }))
      .then(o => {
        nav[0].number = o.songs.length;
        nav[1].number = o.artists.length;
        nav[2].number = this.songs.filter(s => s.favorite === true).length;
        nav[3].number = this.artists.filter(a => a.favorite === true).length;
      })
      .then(() => this.render());
  }

  track(song) {
    return html`
    <div class="track">
      <div class="left">
        <h2>${song.name}</h2>
        <div class="tagline">${song.tagline}</div>
        <div class="artist">${song.artist.firstname} ${song.artist.lastname}</div>
        <div class="released">${song.releaseDate.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })}</div>
        <div class="label">${song.label}</div>
        <div class="likes">
          <button name="song-like" uid="${song.uid}" onclick="${this.like.bind(this, song)}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${song.likes}
          </button>
          <button name="song-dislike" uid="${song.uid}" onclick="${this.dislike.bind(this, song)}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${song.dislikes}
          </button>
          <button uid="${song.uid}" name="song-favorite" onclick="${this.toggleFavorite.bind(this, song)}">
            ${song.favorite === true ? html`
              <img src="../src/favorite.selected.svg"></img>
            ` : html`
              <img src="../src/favorite.unselected.svg"></img>
            `}
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${song.image}"></img>
      </div>
    </div>
    `;
  }

  toggleFavorite(thing) {
    thing.favorite = !thing.favorite;
    this.syncNav();
    this.render();
    this.save(thing);
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
