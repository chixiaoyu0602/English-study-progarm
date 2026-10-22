// ECDICT contains older IPA typography. Ambiguous/multiple pronunciations
// deliberately fall back to spelling-based speech rather than guessing.
export function normalizeIPA(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) return null
  const ipa = value.trim().replace(/^\/(.*)\/$/, '$1').replace(/^\[(.*)\]$/, '$1')
    .replace(/[’']/g, 'ˈ').replace(/:/g, 'ː').replace(/ә/g, 'ə').normalize('NFC')
  if (!/^[a-zɑɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸɹɺɾɻʀʁɽɿʃʂʈʧʊʋⱱʌɣɤχʎʏʑʐʒʔʕʡʢθʍʰʲʷˈˌːˑ.\s\u0300-\u036f]+$/u.test(ipa)) return null
  // Whitespace/comma often separates alternative dictionary readings. Only a
  // single phonetic form is accepted for word cards in this version.
  if (/\s/.test(ipa) || /[,;]/.test(value)) return null
  return ipa
}
