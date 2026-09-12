"""Import source product records, never infer a 3D asset from a product photograph.

python scripts/import-cube-references.py [--input saved-products.json]
The public Shopify endpoint is paginated to exhaustion. --input replays a snapshot.
"""
import argparse
import datetime
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = "https://www.thecubicle.com"
TYPES = {f"{n}x{n}": str(n) * 3 for n in range(2, 8)} | {
    "Pyraminx": "pyram", "Skewb": "skewb", "Megaminx": "minx",
    "Square-1": "sq1", "Clock": "clock",
}


def import_records(products):
    records, logos = [], []
    for product in products:
        kind = product["product_type"]
        if kind not in TYPES and kind != "Cube Logos":
            continue
        images = [{"url": image["src"], "alt": image.get("alt") or product["title"]}
                  for image in product["images"]]
        record = {
            "id": product["handle"], "name": product["title"], "brand": product["vendor"],
            "source": SOURCE + "/products/" + product["handle"], "images": images,
            "variants": [{"id": str(v["id"]), "name": v["title"],
                          "image": (v.get("featured_image") or {}).get("src")}
                         for v in product["variants"]],
        }
        if kind == "Cube Logos":
            logos.append(record)
        else:
            record["puzzle"] = TYPES[kind]
            records.append(record)
    return {
        "schemaVersion": 1, "retrievedAt": datetime.date.today().isoformat(),
        "source": SOURCE, "sourceProductCount": len(products),
        "products": sorted(records, key=lambda r: (r["brand"].lower(), r["name"].lower())),
        "logos": sorted(logos, key=lambda r: r["name"].lower()),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path)
    args = parser.parse_args()
    if args.input:
        products = json.loads(args.input.read_text())
    else:
        products, page = [], 1
        while True:
            with urllib.request.urlopen(f"{SOURCE}/products.json?limit=250&page={page}", timeout=40) as response:
                batch = json.load(response)["products"]
            if not batch:
                break
            products.extend(batch)
            print(f"Page {page}: {len(batch)} records", flush=True)
            page += 1
        products = list({p["id"]: p for p in products}.values())
    catalogue = import_records(products)
    target = ROOT / "public/cube-library/catalog.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(target)
    print(f"{len(catalogue['products'])} product references, {len(catalogue['logos'])} logo references. No 3D certification inferred.")
