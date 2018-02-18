import App from './components/App.html';
import { Store } from 'svelte/store.js';

const store = new Store({
  name: 'world!',
  width: 10,
  height: 10,
  depth: 10
});
store.compute(
  'volume',
  ['width', 'height', 'depth'],
  (width, height, depth) => width * height * depth
);
store.onchange((state, changed) => {
  console.log(`These properties changed: ${Object.keys(changed).join(', ')}`, state);
});

/*
function useLocalStorage(store, key) {
  const json = localStorage.getItem(key);
  if (json) {
    store.set(JSON.parse(json)); // this almost works, except complains that "volume" is read-only
  }
  store.onchange(state => {
    localStorage.setItem(key, JSON.stringify(state));
  });
}
useLocalStorage(store, 'my-svelte-key');
*/

export default new App({
  target: document.body,
  store,
  data: {
    name: 'steve',
    games: ['hockey', 'volleyball'],
    promise: new Promise(r => {
      setTimeout(() => r(42), 3000);
    })
  }
});
