// Bright star catalog: name (Western), RA (hours, J2000), Dec (deg), Vmag, B-V color index.
// Source: Yale Bright Star Catalog (public domain). Extended full-catalog loader:
// see scripts/fetch-assets.mjs notes.
export interface Star {
  name: string;
  ra: number;
  dec: number;
  mag: number;
  bv?: number;
}

export const STARS: Star[] = [
  { name: 'Sirius', ra: 6.752, dec: -16.716, mag: -1.46, bv: 0.00 },
  { name: 'Canopus', ra: 6.399, dec: -52.696, mag: -0.74, bv: 0.15 },
  { name: 'Arcturus', ra: 14.261, dec: 19.182, mag: -0.05, bv: 1.23 },
  { name: 'Vega', ra: 18.616, dec: 38.784, mag: 0.03, bv: 0.04 },
  { name: 'Capella', ra: 5.278, dec: 45.998, mag: 0.08, bv: 0.80 },
  { name: 'Rigel', ra: 5.242, dec: -8.202, mag: 0.13, bv: -0.03 },
  { name: 'Procyon', ra: 7.655, dec: 5.225, mag: 0.34, bv: 0.42 },
  { name: 'Achernar', ra: 1.629, dec: -57.237, mag: 0.46, bv: -0.16 },
  { name: 'Betelgeuse', ra: 5.919, dec: 7.407, mag: 0.5, bv: 1.85 },
  { name: 'Hadar', ra: 14.064, dec: -60.373, mag: 0.61, bv: -0.23 },
  { name: 'Altair', ra: 19.846, dec: 8.868, mag: 0.77, bv: 0.22 },
  { name: 'Acrux', ra: 12.443, dec: -63.099, mag: 0.77, bv: -0.24 },
  { name: 'Aldebaran', ra: 4.599, dec: 16.509, mag: 0.87, bv: 1.54 },
  { name: 'Antares', ra: 16.49, dec: -26.432, mag: 1.06, bv: 1.83 },
  { name: 'Spica', ra: 13.42, dec: -11.161, mag: 1.04, bv: -0.23 },
  { name: 'Pollux', ra: 7.755, dec: 28.026, mag: 1.14, bv: 1.00 },
  { name: 'Fomalhaut', ra: 22.961, dec: -29.622, mag: 1.16, bv: 0.09 },
  { name: 'Deneb', ra: 20.69, dec: 45.28, mag: 1.25, bv: 0.09 },
  { name: 'Mimosa', ra: 12.795, dec: -59.689, mag: 1.25, bv: -0.24 },
  { name: 'Regulus', ra: 10.14, dec: 11.967, mag: 1.35, bv: -0.06 },
  { name: 'Adhara', ra: 6.977, dec: -28.972, mag: 1.5, bv: -0.21 },
  { name: 'Castor', ra: 7.577, dec: 31.888, mag: 1.58, bv: 0.03 },
  { name: 'Gacrux', ra: 12.519, dec: -57.113, mag: 1.63, bv: 1.60 },
  { name: 'Shaula', ra: 17.56, dec: -37.104, mag: 1.62, bv: -0.22 },
  { name: 'Bellatrix', ra: 5.419, dec: 6.35, mag: 1.64, bv: -0.22 },
  { name: 'Elnath', ra: 5.627, dec: 28.608, mag: 1.65, bv: 0.15 },
  { name: 'Miaplacidus', ra: 9.22, dec: -69.72, mag: 1.67, bv: 0.11 },
  { name: 'Alnilam', ra: 5.604, dec: -1.202, mag: 1.69, bv: -0.18 },
  { name: 'Alnair', ra: 22.137, dec: -46.961, mag: 1.74, bv: 0.06 },
  { name: 'Alioth', ra: 12.9, dec: 55.96, mag: 1.76, bv: 0.07 },
  { name: 'Alnitak', ra: 5.679, dec: -1.943, mag: 1.77, bv: -0.20 },
  { name: 'Dubhe', ra: 11.062, dec: 61.751, mag: 1.79, bv: 1.07 },
  { name: 'Mirfak', ra: 3.405, dec: 49.861, mag: 1.79, bv: 0.14 },
  { name: 'Wezen', ra: 7.14, dec: -26.393, mag: 1.83, bv: 0.68 },
  { name: 'Kaus Australis', ra: 18.403, dec: -34.385, mag: 1.85, bv: -0.04 },
  { name: 'Sargas', ra: 17.622, dec: -43.0, mag: 1.86, bv: 0.37 },
  { name: 'Avior', ra: 8.375, dec: -59.51, mag: 1.86, bv: 1.35 },
  { name: 'Alkaid', ra: 13.792, dec: 49.313, mag: 1.86, bv: 0.03 },
  { name: 'Menkalinan', ra: 5.992, dec: 44.947, mag: 1.9, bv: 0.03 },
  { name: 'Atria', ra: 16.811, dec: -69.028, mag: 1.91, bv: 1.45 },
  { name: 'Alhena', ra: 6.629, dec: 16.403, mag: 1.93, bv: 0.00 },
  { name: 'Peacock', ra: 20.427, dec: -56.735, mag: 1.94, bv: 0.07 },
  { name: 'Mirzam', ra: 6.378, dec: -17.956, mag: 1.98, bv: -0.24 },
  { name: 'Alphard', ra: 9.46, dec: -8.659, mag: 1.98, bv: 1.43 },
  { name: 'Polaris', ra: 2.53, dec: 89.264, mag: 1.98, bv: 0.60 },
  { name: 'Hamal', ra: 2.119, dec: 23.462, mag: 1.99, bv: 1.15 },
  { name: 'Algieba', ra: 10.333, dec: 19.841, mag: 2.04, bv: 0.87 },
  { name: 'Mizar', ra: 13.399, dec: 54.925, mag: 2.04, bv: 0.03 },
  { name: 'Nunki', ra: 18.921, dec: -26.297, mag: 2.05, bv: -0.11 },
  { name: 'Kochab', ra: 14.845, dec: 74.156, mag: 2.08, bv: 1.40 },
  { name: 'Rasalhague', ra: 17.582, dec: 12.56, mag: 2.07, bv: 0.01 },
  { name: 'Denebola', ra: 11.818, dec: 14.572, mag: 2.11, bv: 0.09 },
  { name: 'Algol', ra: 3.136, dec: 40.956, mag: 2.12, bv: 0.08 },
  { name: 'Tiaki', ra: 0.675, dec: -46.961, mag: 2.06, bv: 0.12 },
  { name: 'Sadalmelik', ra: 22.536, dec: -0.32, mag: 2.96, bv: 0.15 },
  { name: 'Vindemiatrix', ra: 13.036, dec: 10.959, mag: 2.83, bv: 0.95 },
];
