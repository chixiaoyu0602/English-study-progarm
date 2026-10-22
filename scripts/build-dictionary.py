"""Reproduce the bundled dictionary from a pinned, checksum-verified ECDICT snapshot."""
import argparse
import csv
import hashlib
import json
import re
import string
import tempfile
from pathlib import Path
from urllib.request import urlopen

COMMIT = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'
CSV_SHA256 = '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf'
LICENSE_SHA256 = 'f8552dd246f61a4e064569eae6194a01c6b3d63b03bf27c6ca863593c549ed0f'
ROOT = Path(__file__).resolve().parent.parent
WORD = re.compile(r"[a-z]+(?:['-][a-z]+)*\Z")


def verified(file, expected):
    data = file.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Checksum verification failed: {file.name}')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Existing original ecdict.csv (checksum must match).')
    parser.add_argument('--license', type=Path, help='Existing original LICENSE (checksum must match).')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='marknote-dictionary-') as temp:
        paths = []
        for name, provided, checksum in [('ecdict.csv', args.source, CSV_SHA256), ('LICENSE', args.license, LICENSE_SHA256)]:
            file = provided or Path(temp) / name
            if not provided:
                with urlopen(f'https://raw.githubusercontent.com/skywind3000/ECDICT/{COMMIT}/{name}', timeout=120) as response:
                    file.write_bytes(response.read())
            verified(file, checksum)
            paths.append(file)
        entries, exchanges, scores = {}, {}, {}
        csv.field_size_limit(1024 * 1024)
        with paths[0].open(encoding='utf-8', newline='') as stream:
            for row in csv.DictReader(stream):
                word = row['word'].strip().lower()
                meaning = row['translation'].replace('\\n', '\n').strip()
                if len(word) > 80 or not WORD.fullmatch(word) or not re.search(r'[\u3400-\u9fff]', meaning):
                    continue
                score = (row['word'] != word, int(row['bnc'] or 0) or 10**9, int(row['frq'] or 0) or 10**9)
                if word in entries and scores[word] <= score:
                    continue
                exchange = dict(part.split(':', 1) for part in row['exchange'].split('/') if ':' in part)
                lemma = exchange.get('0', '').lower()
                record = [row['phonetic'].strip()[:200], meaning[:4000]]
                if lemma != word and WORD.fullmatch(lemma):
                    record.append(lemma)
                entries[word], exchanges[word], scores[word] = record, exchange, score
        forms = {}
        for word in sorted(entries, key=lambda item: (scores[item], item)):
            for tag, values in exchanges[word].items():
                if tag not in {'p', 'd', 'i', '3', 'r', 't', 's'}:
                    continue
                for form in values.lower().split('/'):
                    if len(form) <= 80 and WORD.fullmatch(form) and form not in entries:
                        forms.setdefault(form, word)
        output = ROOT / 'src/data/dictionary'
        output.mkdir(parents=True, exist_ok=True)
        hashes = {}
        for letter in string.ascii_lowercase:
            data = {'entries': {word: entries[word] for word in sorted(entries) if word.startswith(letter)},
                    'forms': {word: forms[word] for word in sorted(forms) if word.startswith(letter)}}
            content = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
            (output / f'{letter}.json').write_bytes(content)
            hashes[f'{letter}.json'] = hashlib.sha256(content).hexdigest()
        metadata = {'source': 'https://github.com/skywind3000/ECDICT', 'commit': COMMIT, 'license': 'MIT',
                    'entries': len(entries), 'forms': len(forms), 'source_sha256': CSV_SHA256, 'shards': hashes}
        (output / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
        notices = ROOT / 'public/DICTIONARY-LICENSE.txt'
        notices.write_text(f'MarkNote bundled English–Chinese dictionary\nSource: https://github.com/skywind3000/ECDICT\nSnapshot: {COMMIT}\nDerived data: English single-word entries, Chinese meanings, phonetics and inflections.\n\n' + paths[1].read_text())
        print(f'Generated {len(entries):,} dictionary entries and {len(forms):,} additional word forms in 26 offline shards.')


if __name__ == '__main__':
    main()
