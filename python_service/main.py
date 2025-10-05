from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
import re

app = FastAPI(title="RFP Summarization and Spec Match Service")


class RfpItem(BaseModel):
    line_id: int
    description: str
    voltage_rating_kv: float | None = None
    cross_section_area_mm2: float | None = None
    cores: int | None = None
    conductor_material: str | None = None  # Copper/Aluminum
    insulation: str | None = None  # XLPE/PVC
    armored: bool | None = None
    length_m: float | None = None
    quantity: int | None = 1


class SummarizeRequest(BaseModel):
    rfp_text: str


class SpecMatchRequest(BaseModel):
    rfp_item: Dict[str, Any]
    candidates: List[Dict[str, Any]]


@app.get("/health")
async def health():
    return {"ok": True}


# --- Helper parsing functions ---

def extract_lines(text: str) -> List[RfpItem]:
    lines = []
    # Split by numbered lines or bullets
    raw_lines = re.split(r"\n\s*(?:\d+\.|- )\s*", text)
    idx = 1
    for raw in raw_lines:
        t = raw.strip()
        if not t:
            continue
        desc = t[:200]
        lines.append(parse_line_to_item(idx, t, desc))
        idx += 1
    # Fallback if nothing parsed
    if not lines:
        lines.append(
            RfpItem(
                line_id=1,
                description="Generic cable",
                voltage_rating_kv=11.0,
                cross_section_area_mm2=185,
                cores=3,
                conductor_material="Copper",
                insulation="XLPE",
                armored=True,
                length_m=1000,
                quantity=1,
            )
        )
    return lines


def parse_line_to_item(idx: int, text: str, desc: str) -> RfpItem:
    def find_float(pattern, default=None):
        m = re.search(pattern, text, re.I)
        if m:
            try:
                return float(m.group(1))
            except Exception:
                return default
        return default

    def find_int(pattern, default=None):
        m = re.search(pattern, text, re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                return default
        return default

    voltage = find_float(r"(\d+(?:\.\d+)?)\s*kV")
    area = find_float(r"(\d+(?:\.\d+)?)\s*(?:sqmm|mm2|mm\^2)")
    cores = find_int(r"(\d+)\s*core")

    conductor = None
    if re.search(r"copper", text, re.I):
        conductor = "Copper"
    elif re.search(r"alum", text, re.I):
        conductor = "Aluminum"

    insulation = None
    if re.search(r"xlpe", text, re.I):
        insulation = "XLPE"
    elif re.search(r"pvc", text, re.I):
        insulation = "PVC"

    armored = None
    if re.search(r"armou?red", text, re.I):
        armored = True
    elif re.search(r"unarmou?red|un-armou?red|unarmored", text, re.I):
        armored = False

    length = find_float(r"(\d+(?:\.\d+)?)\s*m\b")
    qty = find_int(r"qty\s*[:=]?\s*(\d+)") or 1

    return RfpItem(
        line_id=idx,
        description=desc,
        voltage_rating_kv=voltage or 11.0,
        cross_section_area_mm2=area or 185,
        cores=cores or 3,
        conductor_material=conductor or "Copper",
        insulation=insulation or "XLPE",
        armored=True if armored is None else armored,
        length_m=length or 1000,
        quantity=qty,
    )


@app.post("/summarize_rfp")
async def summarize_rfp(req: SummarizeRequest):
    text = req.rfp_text or ""
    # Extract tests
    tests = []
    for name in [
        "Insulation Resistance",
        "High Voltage Test",
        "Conductor Resistance",
        "Partial Discharge",
    ]:
        if re.search(name, text, re.I):
            tests.append(name)
    if not tests:
        tests = ["Insulation Resistance", "High Voltage Test"]

    products = extract_lines(text)

    return {
        "products": [p.model_dump() for p in products],
        "tests": tests,
    }


@app.post("/spec_match")
async def spec_match(req: SpecMatchRequest):
    rfp = req.rfp_item
    candidates = req.candidates

    def score(candidate):
        specs = candidate.get("specs", {})
        score_count = 0
        total = 0

        def add(cond):
            nonlocal score_count, total
            total += 1
            if cond:
                score_count += 1

        add(str(specs.get("conductor_material")).lower() == str(rfp.get("conductor_material")).lower())
        add(str(specs.get("insulation")).lower() == str(rfp.get("insulation")).lower())
        add(bool(specs.get("armored")) == bool(rfp.get("armored")))
        add(int(specs.get("cores", 0)) == int(rfp.get("cores", 0)))

        # Voltage: candidate must be >= requirement
        total += 1
        if specs.get("voltage_rating_kv") is not None and rfp.get("voltage_rating_kv") is not None:
            if float(specs["voltage_rating_kv"]) + 1e-6 >= float(rfp["voltage_rating_kv"]):
                score_count += 1

        # Cross section: within +/- 10%
        total += 1
        if specs.get("cross_section_area_mm2") is not None and rfp.get("cross_section_area_mm2") is not None:
            cand = float(specs["cross_section_area_mm2"])
            reqd = float(rfp["cross_section_area_mm2"])
            if abs(cand - reqd) / max(reqd, 1e-6) <= 0.10:
                score_count += 1

        percent = round(100.0 * score_count / max(total, 1), 1)
        return percent

    matches = []
    for c in candidates:
        percent = score(c)
        matches.append({
            "sku": c.get("sku"),
            "description": c.get("description"),
            "specs": c.get("specs"),
            "match_percent": percent,
        })

    matches.sort(key=lambda x: x["match_percent"], reverse=True)
    return {"matches": matches}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
