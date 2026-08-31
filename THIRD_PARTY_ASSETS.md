# Third-party product assets

The MIT license in `LICENSE` applies to the HomePlan 3D source code and original test fixtures. It does not grant rights to third-party trademarks, product photographs, product designs, catalog artwork, or derived 3D assets.

## IKEA reference data

- Product names, article numbers, dimensions, price snapshots and official product links are stored as attributed reference facts.
- `IKEA` is used only to identify the retailer. This project is not affiliated with, sponsored by or endorsed by IKEA.
- Files under `public/catalog/ikea/` are local reference snapshots and are excluded from Git tracking, MIT licensing and archive releases.
- GLBs produced from those snapshots remain local under `artifacts/generated-mesh/` or ignored `public/catalog/generated/` paths unless the operator has separate permission to distribute them.
- Product-page 3D assets discovered through IKEA DIMMA endpoints are reference material only. Locally downloaded copies stay under ignored `.runtime/` or quarantine paths and are not part of the MIT grant, published manifest, or release archive.
- IKEA logos are not included.

Users are responsible for confirming that their use of third-party photographs, trademarks and generated outputs is permitted in their jurisdiction. Removing an asset from the MIT grant does not itself create permission to redistribute it.

## TripoSR

The optional local worker installs TripoSR from its upstream repository at the commit pinned in `services/triposr-worker/compose.yaml`. TripoSR source code and pretrained model are provided upstream under the MIT license. See the upstream project for its complete notices and model information.

The worker image also contains PyTorch, CUDA and an NVIDIA container base, each governed by its own upstream license and notices. They are not relicensed by this repository's MIT license.
