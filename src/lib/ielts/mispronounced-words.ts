// A starter list of words IELTS / ESL learners commonly mispronounce.
// Extend this list any time — the page renders it automatically.
// `ipa` is a rough British English transcription; `tip` explains the usual error.

export type MispronouncedWord = {
  word: string;
  ipa: string;
  tip: string;
};

export const MISPRONOUNCED_WORDS: MispronouncedWord[] = [
  { word: "comfortable", ipa: "/ˈkʌmftəbəl/", tip: "Say “KUMF-tuh-bul” (3 syllables), not “com-for-TAY-bul”." },
  { word: "vegetable", ipa: "/ˈvedʒtəbəl/", tip: "“VEJ-tuh-bul” — 3 syllables, the second ‘e’ disappears." },
  { word: "Wednesday", ipa: "/ˈwenzdeɪ/", tip: "The first ‘d’ is silent: “WENZ-day”." },
  { word: "clothes", ipa: "/kləʊðz/", tip: "Almost sounds like “close”; don’t add an extra syllable." },
  { word: "often", ipa: "/ˈɒf(t)ən/", tip: "The ‘t’ is usually silent: “OFF-en”." },
  { word: "island", ipa: "/ˈaɪlənd/", tip: "The ‘s’ is silent: “EYE-lund”." },
  { word: "recipe", ipa: "/ˈresəpi/", tip: "3 syllables: “RESS-uh-pee”, not “re-SIPE”." },
  { word: "vehicle", ipa: "/ˈviːəkəl/", tip: "The ‘h’ is silent: “VEE-uh-kul”." },
  { word: "jewellery", ipa: "/ˈdʒuːəlri/", tip: "“JOO-uhl-ree” — don’t say “jew-le-ry”." },
  { word: "colleague", ipa: "/ˈkɒliːg/", tip: "Stress the first syllable: “KOL-eeg”." },
  { word: "determine", ipa: "/dɪˈtɜːmɪn/", tip: "Ends with “-min”, not “-mine”." },
  { word: "suite", ipa: "/swiːt/", tip: "Sounds exactly like “sweet”." },
  { word: "queue", ipa: "/kjuː/", tip: "Just sounds like the letter “Q”." },
  { word: "mischievous", ipa: "/ˈmɪstʃɪvəs/", tip: "3 syllables: “MIS-chiv-us”, not “mis-CHEE-vee-us”." },
  { word: "pronunciation", ipa: "/prəˌnʌnsiˈeɪʃən/", tip: "It’s “pro-nun-see-AY-shun” — note “nun”, not “nounce”." },
  { word: "February", ipa: "/ˈfebruəri/", tip: "Don’t drop it to “Feb-yu-ary”; the first ‘r’ is there." },
  { word: "salmon", ipa: "/ˈsæmən/", tip: "The ‘l’ is silent: “SAM-un”." },
  { word: "receipt", ipa: "/rɪˈsiːt/", tip: "The ‘p’ is silent: “ri-SEET”." },
  { word: "subtle", ipa: "/ˈsʌtəl/", tip: "The ‘b’ is silent: “SUT-ul”." },
  { word: "debt", ipa: "/det/", tip: "The ‘b’ is silent: “det”." },
  { word: "doubt", ipa: "/daʊt/", tip: "The ‘b’ is silent: “dout”." },
  { word: "thorough", ipa: "/ˈθʌrə/", tip: "Two syllables — don’t confuse it with “through”." },
  { word: "chaos", ipa: "/ˈkeɪɒs/", tip: "“KAY-oss” — the ‘ch’ sounds like ‘k’." },
  { word: "architect", ipa: "/ˈɑːkɪtekt/", tip: "The ‘ch’ is a ‘k’ sound: “AR-ki-tekt”." },
  { word: "stomach", ipa: "/ˈstʌmək/", tip: "“STUM-uk” — the ‘ch’ is a ‘k’." },
  { word: "genre", ipa: "/ˈʒɒnrə/", tip: "Starts with a soft ‘zh’ sound: “ZHON-ruh”." },
  { word: "entrepreneur", ipa: "/ˌɒntrəprəˈnɜː/", tip: "“on-truh-pruh-NUR” — stress the last syllable." },
  { word: "niche", ipa: "/niːʃ/", tip: "Commonly said “neesh”." },
  { word: "height", ipa: "/haɪt/", tip: "Ends in a ‘t’ sound — there is no “heighth”." },
  { word: "castle", ipa: "/ˈkɑːsəl/", tip: "The ‘t’ is silent: “KAH-sul”." },
  { word: "listen", ipa: "/ˈlɪsən/", tip: "The ‘t’ is silent: “LISS-un”." },
  { word: "answer", ipa: "/ˈɑːnsə/", tip: "The ‘w’ is silent: “AHN-suh”." },
  { word: "foreign", ipa: "/ˈfɒrən/", tip: "The ‘g’ is silent: “FOR-un”." },
  { word: "iron", ipa: "/ˈaɪən/", tip: "“EYE-un” — the ‘r’ moves before the ‘o’." },
  { word: "business", ipa: "/ˈbɪznəs/", tip: "Two syllables: “BIZ-nis”, not “bizi-ness”." },
  { word: "temperature", ipa: "/ˈtemprətʃə/", tip: "“TEM-pruh-cher” — don’t over-pronounce every letter." },
  { word: "interesting", ipa: "/ˈɪntrəstɪŋ/", tip: "“IN-truh-sting” — 3 syllables, not 4." },
  { word: "restaurant", ipa: "/ˈrestrɒnt/", tip: "“RES-tront” — the middle ‘au’ is reduced." },
  { word: "photography", ipa: "/fəˈtɒɡrəfi/", tip: "Stress the 2nd syllable: “fuh-TOG-ruh-fee”." },
  { word: "develop", ipa: "/dɪˈveləp/", tip: "Stress the middle: “di-VEL-up” — no “-ment” sound." },
  { word: "analysis", ipa: "/əˈnæləsɪs/", tip: "Stress the 2nd syllable: “uh-NAL-uh-sis”." },
  { word: "comparable", ipa: "/ˈkɒmpərəbəl/", tip: "Stress the first syllable: “KOM-pruh-bul”." },
  { word: "athlete", ipa: "/ˈæθliːt/", tip: "Two syllables — don’t add one: “ATH-leet”, not “ath-uh-lete”." },
  { word: "specific", ipa: "/spəˈsɪfɪk/", tip: "“spuh-SIF-ik”, not “pacific”." },
];
