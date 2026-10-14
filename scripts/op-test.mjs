const q = `[out:json][timeout:25];(way(around:240,29.562,106.5798)["building"];);out geom tags;`;
const r = await fetch("https://overpass.kumi.systems/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "lsps-viewfinder/0.2 (location scouting; contact: github.com/SoUrCeSuNnY/lsps)" }, body: "data=" + encodeURIComponent(q) });
const t = await r.text();
let j = null; try { j = JSON.parse(t) } catch { }
console.log(r.status, "elements:", j ? j.elements.length : "-", t.slice(0, 80).replace(/\n/g, " "));
if (j) console.log("named:", JSON.stringify(j.elements.filter(e => e.tags && e.tags.name).slice(0, 8).map(e => e.tags.name)));

