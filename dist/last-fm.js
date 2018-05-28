var css = ":host {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n}\n"

const faker = window.faker;
const artists = [];
const songs = [];

for (let i = 0; i < 25; i++) {
  artists.push({
    id: i,
    firstname: faker.name.firstName,
    lastname: faker.name.lastName,
    avatar: faker.internet.avatar,
    email: faker.internet.email,
    country: faker.address.country
  });
}

for (let i = 0; i < 1000; i++) {
  songs.push({
    id: i,
    name: faker.commerce.productName,
    label: faker.company.companyName,
    artistId: Math.floor(Math.randon() * 25)
  });
}

const {bind, hyper, wire} = hyperHTML;

class SongMgr extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.t = Function;
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

  render() {
    hyper(this.shadowRoot)`
    <style>${css}</style>
    `;
  }

  static get observedAttributes() {
    return [];
  }
}

customElements.get('song-mgr') || customElements.define('song-mgr', SongMgr);

export { SongMgr };
