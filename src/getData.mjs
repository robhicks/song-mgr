import { db } from './db.mjs';
import { uuid } from './uuid.mjs';

const faker = window.faker;

const artists = [];
const songs = [];

const recordLabels = [
  'Universal Music Group',
  'Sony Music Entertainment',
  'Warner Music Group'
];

async function getArtists() {
  let artistsInDb = await db.get('artists');
  if (artistsInDb) return artistsInDb;

  for (let i = 0; i < 25; i++) {
    artists.push({
      birth: faker.date.past(),
      country: faker.address.country(),
      death: faker.date.past(),
      dislikes: Math.floor(Math.random() * 400),
      email: faker.internet.email(),
      favorite: faker.random.boolean(),
      firstname: faker.name.firstName(),
      lastname: faker.name.lastName(),
      likes: Math.floor(Math.random() * 600),
      picture: faker.image.avatar(),
      uid: uuid()
    });
  }
  db.put('artists', artists);
  return artists;
}

async function getSongs() {
  let songsInDb = await db.get('songs');
  if (songsInDb) return songsInDb;

  for (let i = 0; i < 750; i++) {
    songs.push({
      artistId: artists[Math.floor(Math.random() * 25)].uid,
      dislikes: Math.floor(Math.random() * 400),
      favorite: faker.random.boolean(),
      image: `https://loremflickr.com/320/240?lock=${i}`,
      // image: `https://picsum.photos/200/300/?image=${Math.floor(Math.random() * 1084)}`,
      label: recordLabels[Math.floor(Math.random() * 3)],
      likes: Math.floor(Math.random() * 1000),
      name: faker.commerce.productName(),
      releaseDate: faker.date.past(),
      tagline: faker.lorem.paragraph(),
      uid: uuid()
    });
  }
  db.put('songs', songs);
  return songs;
}

export {
  getArtists,
  getSongs
}
