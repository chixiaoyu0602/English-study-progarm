// ECDICT contains older IPA typography. Ambiguous/multiple pronunciations
// deliberately fall back to spelling-based speech rather than guessing.
export function normalizeIPA(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) return null
  const source = value.trim()
  const modern = /^[\[/]/.test(source) || /[ˈˌːɪʊ]/.test(source)
  let ipa = source.replace(/^\/(.*)\/$/, '$1').replace(/^\[(.*)\]$/, '$1')
  if (!modern) {
    // ECDICT's older DJ notation uses i/u for the short vowels and a dot
    // for secondary stress; feeding those unchanged to IPA synthesis is wrong.
    ipa = ipa.replace(/ә:/g, 'ɜː').replace(/ɒ:/g, 'ɔː')
      .replace(/ɒi|oi/g, 'ɔɪ').replace(/ai/g, 'aɪ').replace(/ei/g, 'eɪ')
      .replace(/au/g, 'aʊ').replace(/әu|ou/g, 'əʊ')
      .replace(/iә/g, 'ɪə').replace(/uә/g, 'ʊə').replace(/eә/g, 'eə')
      .replace(/\./g, 'ˌ')
  }
  ipa = ipa.replace(/[’']/g, 'ˈ').replace(/:/g, 'ː').replace(/ә/g, 'ə').replace(/ʤ/g, 'dʒ').replace(/ʧ/g, 'tʃ').normalize('NFC')
  if (!modern) ipa = ipa.replace(/i(?!ː)/g, 'ɪ').replace(/u(?!ː)/g, 'ʊ')
  if (!/^[a-zɑɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸɹɺɾɻʀʁɽɿʃʂʈʧʊʋⱱʌɣɤχʎʏʑʐʒʔʕʡʢθʍʰʲʷˈˌːˑ.\s\u0300-\u036f]+$/u.test(ipa)) return null
  // Whitespace/comma often separates alternative dictionary readings. Only a
  // single phonetic form is accepted for word cards in this version.
  if (/\s/.test(ipa) || /[,;]/.test(value)) return null
  return ipa
}
