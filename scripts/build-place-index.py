"""Build a local city search index from explicit GeoNames source files.

No network, secrets, or geolocation input. Output is discovery data, never
payment authority. GeoNames data is CC BY 4.0; preserve its attribution.
"""
import argparse
import hashlib
import json
from pathlib import Path
import unicodedata
import zipfile


def normalize(text):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", text.lower().replace("ı", "i").replace("ß", "ss")) if not unicodedata.combining(c)).split())


def build(cities, regions):
    regions_by_code = {}
    for line in regions.splitlines():
        fields = line.split("\t")
        if len(fields) == 4:
            regions_by_code[fields[0]] = fields[1]
    rows = []
    seen = set()
    for line in cities.splitlines():
        fields = line.split("\t")
        if len(fields) != 19:
            raise ValueError("Unexpected GeoNames row")
        ident, name, ascii_name, aliases = fields[:4]
        lat, lon = round(float(fields[4]) * 1e6), round(float(fields[5]) * 1e6)
        if abs(lat) > 85051128 or abs(lon) > 180000000:
            continue
        if not ident.isdecimal() or ident in seen or len(name) > 200:
            raise ValueError("Invalid or duplicate city")
        seen.add(ident)
        country = fields[8]
        if len(country) != 2 or not country.isascii() or not country.isupper():
            raise ValueError("Invalid country code")
        region = regions_by_code.get(country + "." + fields[10], "")
        # Keep common/native alternate spellings, bounded per entry. Neither
        # labels nor aliases become HTML, request destinations or code.
        names = list(dict.fromkeys(normalize(n) for n in [name, ascii_name, *aliases.split(",")] if n))
        search = "|".join(names)[:3000]
        rows.append((int(fields[14]), [int(ident), name, region, country, lat, lon, search]))
    return {"version": 1, "cities": [row for _, row in sorted(rows, key=lambda r: (-r[0], r[1][0]))]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cities_zip", type=Path)
    parser.add_argument("regions", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.cities_zip) as archive:
        entry = archive.getinfo("cities15000.txt")
        if entry.file_size > 30_000_000:
            raise ValueError("Source exceeds bound")
        cities = archive.read(entry).decode("utf-8")
    index = build(cities, args.regions.read_text())
    encoded = (json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(encoded) > 12_000_000 or len(index["cities"]) > 50_000:
        raise ValueError("Index exceeds browser bounds")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded)
    print(json.dumps({"cities": len(index["cities"]), "bytes": len(encoded), "sha256": hashlib.sha256(encoded).hexdigest(), "sourceZipSha256": hashlib.sha256(args.cities_zip.read_bytes()).hexdigest(), "regionsSha256": hashlib.sha256(args.regions.read_bytes()).hexdigest()}))
