/**
 * Photographs of the actual places.
 *
 * Every file here is a real photograph of the specific landmark it is attached
 * to, sourced from Wikimedia Commons under a Creative Commons licence and served
 * from `public/places/` rather than hotlinked — the app's whole premise is
 * working on a weak hill connection, and a cover that needs a round trip to a
 * CDN is the first thing to fail there.
 *
 * Each entry was checked by eye against the place it labels, not matched on
 * filename alone. Two candidates were rejected that way: a close-up of biscuit
 * packets left as offerings (correctly filed under Tsuglagkhang, useless as a
 * cover) and a thangka workshop interior full of identifiable faces.
 *
 * ATTRIBUTION IS A LICENCE CONDITION, not a courtesy. CC BY and CC BY-SA both
 * require credit, the licence, and a link to the source. `PhotoCredit` renders
 * that on the place screen; do not add a photo here without filling in all four
 * fields, and do not drop the credit line from the UI.
 *
 * Places absent from this map fall back to the generated illustration in
 * `PlaceArt` — either no freely-licensed photograph of that specific spot was
 * found, or the venue is composite rather than a real named landmark.
 */

export interface PlacePhoto {
  /** Filename under `public/places/`. */
  file: string;
  /** Photographer, exactly as credited on Commons. */
  author: string;
  license: string;
  /** Commons file page — the licence's required link back. */
  source: string;
}

const COMMONS = 'https://commons.wikimedia.org/wiki/File:';

export const PLACE_PHOTOS: Record<string, PlacePhoto> = {
  'PL-HADIMBA': {
    file: 'PL-HADIMBA.jpg',
    author: 'Itsarti',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Hadimba_Devi_Temple_Manali.jpg`,
  },
  'PL-RIDGE': {
    file: 'PL-RIDGE.jpg',
    author: 'ShashankSharma2511',
    license: 'CC BY 3.0',
    source: `${COMMONS}Ridge,_Shimla.JPG`,
  },
  'PL-CHRIST-CH': {
    file: 'PL-CHRIST-CH.jpg',
    author: 'ShashankSharma2511',
    license: 'CC BY 3.0',
    source: `${COMMONS}Christ_Church,_Shimla.jpg`,
  },
  'PL-JAKHOO': {
    file: 'PL-JAKHOO.jpg',
    author: '502hsuya',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Jakhoo_Mandir_drone_view.jpg`,
  },
  'PL-VICEREGAL': {
    file: 'PL-VICEREGAL.jpg',
    author: 'ptwo',
    license: 'CC BY 2.0',
    source: `${COMMONS}Rashtrapati_Niwas,_Shimla.jpg`,
  },
  'PL-MALL-SML': {
    file: 'PL-MALL-SML.jpg',
    author: 'ArmouredCyborg',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Mall_Road_Shimla_Nov_21.jpg`,
  },
  'PL-KUFRI': {
    file: 'PL-KUFRI.jpg',
    author: 'Shahnoor Habib Munmun',
    license: 'CC BY 3.0',
    source: `${COMMONS}Kufri_Simla_Himachal_India_(6).jpg`,
  },
  'PL-CHAIL-PALACE': {
    file: 'PL-CHAIL-PALACE.jpg',
    author: 'Shrey.ashi',
    license: 'CC BY 4.0',
    source: `${COMMONS}Chail_Palace.jpg`,
  },
  'PL-HATU': {
    file: 'PL-HATU.jpg',
    author: 'Kondephy',
    license: 'CC BY-SA 3.0',
    source: `${COMMONS}Narkanda_hatu_peak_himachal_pradesh.jpg`,
  },
  'PL-SOLANG': {
    file: 'PL-SOLANG.jpg',
    author: 'Vikas Choudhary',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Solang_Valley,_Manali.jpg`,
  },
  'PL-NAGGAR': {
    file: 'PL-NAGGAR.jpg',
    author: 'Schwiki',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Naggar_Castle_Kullu_WLM22-4062.jpg`,
  },
  'PL-TSUGLAG': {
    file: 'PL-TSUGLAG.jpg',
    author: 'Geoff Stearns',
    license: 'CC BY 2.0',
    source: `${COMMONS}McLeod_Ganj_from_the_Dalai_Lama_Temple_(6466149411).jpg`,
  },
  'PL-BHAGSU': {
    file: 'PL-BHAGSU.jpg',
    author: 'Jpatokal',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Bhagsunag_Waterfall_Pan.JPG`,
  },
  'PL-TRIUND': {
    file: 'PL-TRIUND.jpg',
    author: 'Kiran Jonnalagadda',
    license: 'CC BY-SA 2.0',
    source: `${COMMONS}Triund_trek_route_(8679789585).jpg`,
  },
  'PL-HPCA': {
    file: 'PL-HPCA.jpg',
    author: 'Pranav Bhasin',
    license: 'CC BY 2.0',
    source: `${COMMONS}HPCA,_Dharamshala_Cricket_Stadium.jpg`,
  },
  'PL-NORBULINGKA': {
    file: 'PL-NORBULINGKA.jpg',
    author: 'Dainis Matisons',
    license: 'CC BY 4.0',
    source: `${COMMONS}Dainis_Matisons,_Water_Garden_of_Norbulingka_Institute,_Dharamsala.jpg`,
  },
  'PL-VASHISHT': {
    file: 'PL-VASHISHT.jpg',
    author: 'Sharvipul',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Vashisht_temple_near_manali.jpg`,
  },
  'PL-OLD-MANALI': {
    file: 'PL-OLD-MANALI.jpg',
    author: 'Aslam Kuttayi',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Old_Manali_2.jpg`,
  },
  'PL-MALL-MNL': {
    file: 'PL-MALL-MNL.jpg',
    author: 'TheSlumPanda',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Mall_Road,_Manali,_Himachal_Pradesh.jpg`,
  },
  // The Himalayan Nature Park *is* the Kufri zoo, and its brown bears are what
  // people go to see — this is a photograph taken inside that park.
  'PL-HIM-NATURE': {
    file: 'PL-HIM-NATURE.jpg',
    author: 'Ganesh Mohan T',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Himalayan_brown_bear_at_Kufri_Zoo_01.jpg`,
  },
  // Commons has no exterior of the museum building, so this is from the
  // collection inside it: a Chamba necklace, photographed in that gallery.
  'PL-HP-MUSEUM': {
    file: 'PL-HP-MUSEUM.jpg',
    author: 'SpeakingArch',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Chamba_Necklace,_Himachal_State_Museum,_Shimla.jpg`,
  },
  // The only freely-licensed depiction of Lakkar Bazaar in existence on Commons
  // is a hand-tinted period postcard. It is genuinely this street, and captioned
  // as such — but it is a postcard, not a photograph. Replace it if a modern
  // photo is ever uploaded.
  'PL-LAKKAR': {
    file: 'PL-LAKKAR.jpg',
    author: 'Paper Jewels',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Lakkar_Bazaar,_Simla_Postcard.jpg`,
  },
  'PL-CHAIL-GROUND': {
    file: 'PL-CHAIL-GROUND.jpg',
    author: 'Kavittaa',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}View_from_the_backside_of_Kali_Tibba_Temple,_Chail,_Himachal_Pradesh.jpg`,
  },
  'PL-SHOOLINI': {
    file: 'PL-SHOOLINI.jpg',
    author: 'Abhyuday Bhandari',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Jatoli_Shiv_Temple.jpg`,
  },
  'PL-BHUTNATH': {
    file: 'PL-BHUTNATH.jpg',
    author: 'Aranya Kar',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Panchvaktra_Temple,_Mandi_(FRONT_VIEW)_01.jpg`,
  },
  'PL-INDIRA-MKT': {
    file: 'PL-INDIRA-MKT.jpg',
    author: 'John Hill',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Clock_Tower,_Mandi,_HP,_India.jpg`,
  },
  'PL-CAFE-SOL': {
    file: 'PL-CAFE-SOL.jpg',
    author: 'Sumita Roy Dutta',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Indian_Coffee_House_Shimla.jpg`,
  },
  'PL-CAFE-KULLU': {
    file: 'PL-CAFE-KULLU.jpg',
    author: 'Rajani Gairshail',
    license: 'CC BY-SA 4.0',
    source: `${COMMONS}Kullu_Bazaar_Market_in_Himachal_Pradesh,1.jpg`,
  },
};

/**
 * Guard against a place quietly losing its photograph.
 *
 * Every place is expected to have one now — an illustration on screen is the bug
 * this map exists to prevent, and adding a place without adding its photo would
 * reintroduce one silently. Dev-only, because a missing file is a authoring
 * mistake to catch while editing, not a runtime condition to handle.
 */
if (import.meta.env.DEV) {
  void import('./places').then(({ PLACES }) => {
    const missing = PLACES.filter((p) => !PLACE_PHOTOS[p.id]).map((p) => `${p.id} (${p.name})`);
    if (missing.length > 0) {
      console.warn(
        `[Routify] ${missing.length} place(s) have no photograph and will fall back to the illustration:\n  ${missing.join('\n  ')}`,
      );
    }
  });
}

export function photoFor(placeId: string): PlacePhoto | undefined {
  return PLACE_PHOTOS[placeId];
}

export function photoUrl(photo: PlacePhoto): string {
  return `${import.meta.env.BASE_URL}places/${photo.file}`;
}
