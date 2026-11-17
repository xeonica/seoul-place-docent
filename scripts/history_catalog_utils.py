"""Shared normalization helpers for the review catalog and BigQuery pipeline."""
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


def canonical_url(url):
    """Match the long-standing review-export URL duplicate rule; never rewrite source values."""
    p = urlsplit((url or "").strip())
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError(f"Invalid source URL: {url}")
    keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
            if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", urlencode(sorted(keep)), ""))
