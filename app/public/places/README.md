City search uses a locally packaged GeoNames cities15000 extract downloaded on
27 September 2026, with admin1 region labels. GeoNames data is licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Sources: [cities15000](https://download.geonames.org/export/dump/cities15000.zip),
[admin1 labels](https://download.geonames.org/export/dump/admin1CodesASCII.txt).

The extract covers cities above 15,000 people and capitals. It is a starting
point for pickup discovery, not a street address database or proof of location.
Missing towns can be reached by searching a nearby city or using device location.
Coordinates, names and population ordering are provided without completeness or
accuracy guarantees. Users' search terms are processed locally, never sent to
GeoNames. Opening the map loads OpenStreetMap tiles separately.

Transformation: scripts/build-place-index.py retains city/region/country labels,
microdegree coordinates and bounded alternate names, sorts by population, and
excludes coordinates outside the map projection. The index contains 34,149
records. It is generated data, not authored source under the security line review.

Index SHA256: 682697605c69c5f560cc394fe0faecd9423643d02307dbb15b9013ba90f951b6
Source ZIP SHA256: ee0bbb84af646f5f4bd792fc402b4df9b371048cfe3fe45c4ef69c4e219ceb62
Region file SHA256: 1da92a6323a5fec3176f3f743bf4cf4040fd56a876da55e46fbca23c863aa60a
