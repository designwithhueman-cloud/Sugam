# Local image model for DIFF-002

DIFF-002 (Visual Distinctiveness) compares a scan's first screen with the reference set in `data/hero-references/`, using DINOv2
(`facebookresearch/dinov2`, ViT-S/14, pinned to commit `4d83ffd`). It runs locally in the scan worker; there are no paid API calls.

Set up once (about 430 MB for the Python environment, 99 MB for the model weights):

```bash
python3 -m venv worker/vision/.venv
```

```bash
worker/vision/.venv/bin/pip install torch torchvision pillow
```

The first comparison fetches the pinned dinov2 source from GitHub and the weights from `dl.fbaipublicfiles.com` into `.data/torch`. After that it runs offline.
Vectors are cached in `.data/vision-cache/<model>/<sha256>.json`, so an image is embedded once per model version.

| Variable | Default | Meaning |
|---|---|---|
| `AVARA_HERO_MATCH` | on | `off` skips the comparison (reported as skip reason `disabled`) |
| `AVARA_VISION_PYTHON` | `worker/vision/.venv/bin/python` | the Python that runs `embed.py` |
| `TORCH_HOME` | `.data/torch` | where the model source and weights are cached |
| `AVARA_HERO_REFS` | `data/hero-references` | the reference set |
| `AVARA_VISION_TIMEOUT_MS` | 120000 | how long one embedding call may take |

Without the environment, the model or the references, DIFF-002's image check is reported as not run, with the reason
(`model_unavailable`, `model_failed`, `model_mismatch`, `no_references`, `no_capture`, `no_layout`, `viewport_mismatch`); the style check still runs.

Rebuild the reference set and its calibration after changing the model, the capture or the templates:

```bash
node --experimental-strip-types scripts/hero-references.ts
```

The templates are cloned (MIT licence) into `.data/hero-templates/` at the commits recorded in `data/hero-references/sources.json`.
