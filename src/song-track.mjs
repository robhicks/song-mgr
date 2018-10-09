import { getArtist, getTrack } from './getData.mjs';

class SongTrack extends HTMLElement {
  constructor() {
    super();
  }

  attributeChangedCallback(name, oVal, nVal) {
    if (nVal && !(/{{|_hyper/).test(nVal) && nVal !== oVal) {
      if (name === 'artist-id') this._artistId = nVal;
      if (name === 'track-id') this._trackId = nVal;
    }
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {}

  async getArtist(id) {
    this.artist = await(getArtist(id));
  }

  async getTrack(id) {
    this.artist = await(getTrack(id));
  }

  render() {
    hyper(this)`
    `;
  }

  get artist() {
    return this._artist;
  }

  set artist(artist) {
    this._artist = artist;
    this.render();
  }

  get track() {
    return this._track;
  }

  set track(track) {
    this._track = track;
    this.render();
  }

  get artistId() {
    return this._artistId;
  }

  set artistId(artistId) {
    this.setAttribute('artist-id', artistId);
  }

  get trackId() {
    return this._trackId;
  }

  set trackId(trackId) {
    this.setAttribute('track-id', trackId);
  }

  static get observedAttributes() {
    return [
      'artist-id',
      'track-id'
    ];
  }
}

customElements.get('song-track') || customElements.define('song-track', SongTrack);

export { SongTrack };
