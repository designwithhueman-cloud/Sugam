"""DINOv2 image embeddings for DIFF-002 (Visual Distinctiveness). Local only: no network calls once the model is cached, no paid APIs.

Reads JSON from stdin: {"images": ["/abs/path.jpg", ...]}. Writes JSON to stdout:
  {"model": "facebookresearch/dinov2:dinov2_vits14", "dim": 384, "vectors": [[...], ...]}
Each vector is the L2-normalised CLS token of the image resized to 448x280 (the 1280x800 first screen, kept at 16:10, in 14px patches).
The model is loaded with torch.hub from facebookresearch/dinov2 at a pinned commit; weights are cached under TORCH_HOME (default .data/torch).
Errors go to stderr with a non-zero exit, so the caller can record an explicit skip reason.
"""
import json
import os
import sys

COMMIT = "4d83ffd4f4b39df112cef7ed7833de7ebf3a202e"  # pinned: later main needs Python 3.10+; pinning also fixes the model code version
MODEL_LABEL = f"facebookresearch/dinov2@{COMMIT[:7]}"
MODEL_NAME = os.environ.get("AVARA_DINOV2_MODEL", "dinov2_vits14")
SIZE = (448, 280)  # width, height: multiples of the 14px patch, 16:10 like the 1280x800 desktop viewport


def repo_dir() -> str:
    """The dinov2 source at the pinned commit, fetched once from GitHub into TORCH_HOME and reused offline after that."""
    home = os.environ.get("TORCH_HOME") or os.path.join(os.getcwd(), ".data", "torch")
    d = os.path.join(home, f"dinov2-{COMMIT}")
    if not os.path.exists(os.path.join(d, "hubconf.py")):
        import io, urllib.request, zipfile
        data = urllib.request.urlopen(f"https://codeload.github.com/facebookresearch/dinov2/zip/{COMMIT}", timeout=60).read()
        tmp = d + ".tmp"
        zipfile.ZipFile(io.BytesIO(data)).extractall(tmp)
        os.rename(os.path.join(tmp, f"dinov2-{COMMIT}"), d)
        os.rmdir(tmp)
    return d


def main() -> int:
    req = json.load(sys.stdin)
    paths = req.get("images") or []
    import torch  # imported late so a missing install is reported as such
    from PIL import Image
    from torchvision import transforms

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    model = torch.hub.load(repo_dir(), MODEL_NAME, source="local", verbose=False)
    model.eval()
    tf = transforms.Compose([
        transforms.Resize((SIZE[1], SIZE[0]), interpolation=transforms.InterpolationMode.BICUBIC),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ])
    vectors = []
    with torch.inference_mode():
        for i in range(0, len(paths), 8):
            batch = torch.stack([tf(Image.open(p).convert("RGB")) for p in paths[i:i + 8]])
            cls = model(batch)  # (n, dim): the CLS token after the final norm
            cls = torch.nn.functional.normalize(cls, dim=-1)
            vectors.extend([[round(float(x), 6) for x in v] for v in cls])
    json.dump({"model": f"{MODEL_LABEL}:{MODEL_NAME}", "dim": len(vectors[0]) if vectors else 0, "vectors": vectors}, sys.stdout)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 - every failure becomes a skip reason upstream
        print(f"{type(e).__name__}: {str(e).splitlines()[0][:300] if str(e) else ''}", file=sys.stderr)
        sys.exit(2)
